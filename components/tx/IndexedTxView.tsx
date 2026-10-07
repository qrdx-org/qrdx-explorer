'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronLeft, FileText, ListChecks, Users, XCircle } from 'lucide-react'
import { AddressLink, BlockLink, CopyButton } from '@/components/explorer/common'
import { useTokenMap } from '@/components/explorer/data'
import { opLabel } from '@/components/explorer/HistoryTable'
import { Panel, Pill, Row, Tile, fmtNum } from '@/components/explorer/ui'
import { nodeRequest } from '@/lib/qrdx'
import { assetSymbol, type IndexedTxDetail } from '@/lib/qrdx/indexed'
import { cn } from '@/lib/utils'

interface Receipt {
  block_height: number
  block_time?: number
  success: boolean
  error: string
  gas_used: number
  gas_price?: number
  fee?: string
  data?: Record<string, unknown>
}

const isAccount = (v: unknown) => typeof v === 'string' && (/^0xPQ[0-9a-fA-F]{64}$/.test(v) || /^0x[0-9a-fA-F]{40}$/.test(v))

/** An exchange operation: what it did (index), how it executed (receipt), and who it touched. */
export function IndexedTxView({ tx }: { tx: IndexedTxDetail }) {
  const tokens = useTokenMap()
  const [receipt, setReceipt] = useState<Receipt | null | undefined>(undefined)
  useEffect(() => {
    nodeRequest<Receipt | null>('get_exchange_receipt', { query: { tx_hash: tx.tx_hash } })
      .then(setReceipt)
      .catch(() => setReceipt(null))
  }, [tx.tx_hash])

  const params = (tx.detail?.params ?? {}) as Record<string, unknown>
  const ok = tx.status !== 'failed'
  const value = (k: string, v: unknown): React.ReactNode => {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'string' && v.toUpperCase() === 'QRDX' && /token|asset|pair/.test(k)) return 'QRDX (native)'
    if (isAccount(v)) {
      const t = typeof v === 'string' ? tokens.get(v.toLowerCase()) : undefined
      return t ? (
        <Link href={`/address/${v}`} className="text-primary hover:underline">
          {t.symbol} <span className="font-mono text-xs text-muted-foreground">{String(v).slice(0, 10)}…</span>
        </Link>
      ) : (
        <AddressLink address={String(v)} />
      )
    }
    if (k === 'pair' && typeof v === 'string' && v.includes(':')) {
      const [a, b] = v.split(':')
      return `${assetSymbol(a, tokens)} / ${assetSymbol(b, tokens)}`
    }
    if (typeof v === 'object') return <code className="text-xs">{JSON.stringify(v)}</code>
    return String(v)
  }
  const data = receipt?.data ?? {}
  const fills = Array.isArray(data.fills) ? (data.fills as Record<string, unknown>[]) : []
  const rest = Object.entries(data).filter(([k]) => k !== 'fills')

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Transactions
      </Link>
      <section className="hero-glow -mx-4 border-b px-4 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          {ok ? <CheckCircle2 className="h-7 w-7 text-bid" /> : <XCircle className="h-7 w-7 text-ask" />}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{opLabel(tx)}</h1>
          <Pill tone={ok ? 'bid' : 'ask'}>{ok ? 'Executed' : 'Failed'}</Pill>
          <Pill>Exchange · {tx.op}</Pill>
        </div>
        <div className="mt-2 flex items-center gap-1.5 break-all font-mono text-xs text-muted-foreground">
          {tx.tx_hash}
          <CopyButton value={tx.tx_hash} />
        </div>
        {!ok && tx.error && <p className="mt-3 rounded-lg border border-ask/30 bg-ask/10 px-3 py-2 text-sm text-ask">{tx.error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Block" value={<BlockLink height={tx.block_height} className="text-xl" />} sub={new Date(tx.timestamp * 1000).toLocaleString()} />
          <Tile label="Amount" value={tx.amount ? `${fmtNum(tx.amount, 6)} ${tx.asset ? (tx.asset.startsWith('0x') ? assetSymbol(tx.asset, tokens) : tx.asset) : ''}` : '—'} />
          <Tile label="Fee" value={tx.fee ? `${Number(tx.fee).toPrecision(3)} QRDX` : '—'} sub="burned" />
          <Tile label="Gas used" value={receipt?.gas_used?.toLocaleString() ?? '—'} sub={receipt?.gas_price ? `${(receipt.gas_price / 1e9).toLocaleString()} gwei` : ''} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Operation" icon={<FileText className="h-4 w-4" />}>
          <Row k="Sender">
            <AddressLink address={tx.sender} />
          </Row>
          {tx.target && (
            <Row k="Target">
              <AddressLink address={tx.target} />
            </Row>
          )}
          {typeof tx.detail?.nonce === 'number' && <Row k="Exchange nonce">{String(tx.detail.nonce)}</Row>}
          {Object.entries(params).map(([k, v]) => (
            <Row key={k} k={k.replace(/_/g, ' ')}>
              {value(k, v)}
            </Row>
          ))}
        </Panel>
        <Panel title="Result" icon={<ListChecks className="h-4 w-4" />}>
          {receipt === undefined && <p className="py-8 text-center text-sm text-muted-foreground">Reading the receipt…</p>}
          {receipt === null && <p className="py-8 text-center text-sm text-muted-foreground">This node no longer keeps the receipt (it keeps the latest 50,000).</p>}
          {receipt && rest.length === 0 && !fills.length && <p className="py-8 text-center text-sm text-muted-foreground">{receipt.success ? 'Executed.' : receipt.error}</p>}
          {rest.map(([k, v]) => (
            <Row key={k} k={k.replace(/_/g, ' ')}>
              {value(k, v)}
            </Row>
          ))}
          {fills.length > 0 && (
            <div className="border-t">
              <div className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Fills ({fills.length})</div>
              <table className="num w-full text-xs">
                <tbody>
                  {fills.map((f, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2">{String(f.market ?? '').includes(':') ? String(f.market).split(':').map((a) => assetSymbol(a, tokens)).join('/') : String(f.market ?? '')}</td>
                      <td className={cn('px-2 py-2 font-medium uppercase', f.side === 'sell' ? 'text-ask' : 'text-bid')}>{String(f.side ?? '')}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(String(f.amount ?? ''), 6)}</td>
                      <td className="px-2 py-2 text-muted-foreground">at</td>
                      <td className="px-2 py-2">{fmtNum(String(f.price ?? ''), 8)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{String(f.venue ?? (f.maker ? 'book' : ''))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {tx.accounts && tx.accounts.length > 0 && (
        <Panel title={`Accounts touched (${tx.accounts.length})`} icon={<Users className="h-4 w-4" />}>
          {tx.accounts.map((a) => (
            <div key={a.address} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
              <AddressLink address={a.address} full avatar />
              <span className="ml-auto flex flex-wrap gap-1">
                {a.roles.map((r) => (
                  <Pill key={r}>{r.replace(/_/g, ' ')}</Pill>
                ))}
              </span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
