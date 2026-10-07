'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Loader2, Repeat, XCircle } from 'lucide-react'
import { AddressLink, BlockLink, TimeAgo, TxLink } from './common'
import { useTokenMap } from './data'
import { Tabs } from './ui'
import { assetSymbol, isOracleVote, type IndexedPage, type IndexedTx } from '@/lib/qrdx/indexed'
import { cn } from '@/lib/utils'

const OP_LABELS: Record<string, string> = {
  TOKEN_TRANSFER: 'Token transfer',
  TOKEN_TRANSFER_FROM: 'Token transfer',
  TOKEN_DEPLOY: 'Token launch',
  TOKEN_MINT: 'Mint',
  TOKEN_BURN: 'Burn',
  TOKEN_APPROVE: 'Approve',
  TOKEN_SET_AUTHORITY: 'Set authority',
  SWAP: 'Swap',
  PLACE_ORDER: 'Limit order',
  CANCEL_ORDER: 'Cancel order',
  CREATE_POOL: 'Create pool',
  ADD_LIQUIDITY: 'Add liquidity',
  REMOVE_LIQUIDITY: 'Remove liquidity',
  PERP_ORDER: 'Perp order',
  PERP_CANCEL: 'Perp cancel',
  PERP_DEPOSIT: 'Perps deposit',
  PERP_WITHDRAW: 'Perps withdraw',
  PERP_SET_LEVERAGE: 'Set leverage',
  CREATE_MARKET: 'Create perp market',
  VAULT_DEPOSIT: 'Vault deposit',
  VAULT_WITHDRAW: 'Vault withdraw',
  ORACLE_VOTE: 'Oracle vote',
  STAKE_DEPOSIT: 'Stake',
  NFT_MINT: 'NFT mint',
  NFT_TRANSFER: 'NFT transfer',
  NFT_CREATE_COLLECTION: 'NFT collection',
}

export function opLabel(t: Pick<IndexedTx, 'kind' | 'op'>): string {
  if (t.op && OP_LABELS[t.op]) return OP_LABELS[t.op]
  if (t.kind === 'transfer') return 'Transfer'
  if (t.kind === 'coinbase') return 'Block reward'
  if (t.kind === 'genesis') return 'Genesis'
  if (t.kind === 'evm') return t.op ? t.op.replace(/_/g, ' ').toLowerCase() : 'EVM call'
  return (t.op ?? t.kind).replace(/_/g, ' ').toLowerCase()
}

const KINDS = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'transfers', label: 'Transfers', kinds: 'transfer,coinbase,genesis' },
  { id: 'exchange', label: 'Exchange', kinds: 'exchange' },
  { id: 'evm', label: 'EVM', kinds: 'evm' },
] as const
type KindId = (typeof KINDS)[number]['id']

/**
 * Transactions from the node's index (get_address_history / get_latest_transactions),
 * newest first, with a kind filter, validator votes hidden unless asked, and more on demand.
 */
export function HistoryTable({
  load,
  address,
  pageSize = 50,
  defaultShowVotes = false,
}: {
  load: (q: { limit: number; cursor: string | null; kinds: string | null }) => Promise<IndexedPage>
  /** The address whose history this is: rows show their direction. */
  address?: string
  pageSize?: number
  defaultShowVotes?: boolean
}) {
  const tokens = useTokenMap()
  const [kind, setKind] = useState<KindId>('all')
  const [votes, setVotes] = useState(defaultShowVotes)
  const [rows, setRows] = useState<IndexedTx[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kinds = KINDS.find((k) => k.id === kind)!.kinds

  const fetchPage = useCallback(
    async (from: string | null) => {
      setBusy(true)
      setError(null)
      try {
        const page = await load({ limit: pageSize, cursor: from, kinds })
        setRows((prev) => (from && prev ? [...prev, ...page.transactions] : page.transactions))
        setCursor(page.next_cursor)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load transactions')
        setRows((prev) => prev ?? [])
      } finally {
        setBusy(false)
      }
    },
    [load, pageSize, kinds]
  )

  useEffect(() => {
    setRows(null)
    void fetchPage(null)
  }, [fetchPage])

  const shown = (rows ?? []).filter((t) => votes || !isOracleVote(t))
  const hidden = (rows ?? []).length - shown.length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-2">
        <Tabs tabs={KINDS.map((k) => ({ id: k.id, label: k.label }))} value={kind} onChange={setKind} className="border-b-0" />
        <label className="ml-auto flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={votes} onChange={(e) => setVotes(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          Validator votes{!votes && hidden > 0 ? ` (${hidden} hidden)` : ''}
        </label>
      </div>
      <div className="overflow-x-auto border-t">
        <table className="num w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b text-left">
              <th className="px-4 py-2.5 font-medium">Transaction</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Block</th>
              <th className="px-3 py-2.5 font-medium">From → To</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 text-right font-medium">Fee</th>
              <th className="px-4 py-2.5 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const out = address && t.roles?.includes('sender')
              const into = address && !out && t.roles?.some((r) => ['to', 'token_to', 'maker'].includes(r))
              return (
                <tr key={`${t.tx_hash}:${t.position}`} className="border-b last:border-b-0 transition-colors hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {t.status === 'failed' ? (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-ask" aria-label="Failed" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-bid/80" aria-label="Success" />
                      )}
                      <TxLink hash={t.tx_hash} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {address &&
                        (out ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-ask" aria-label="Out" />
                        ) : into ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-bid" aria-label="In" />
                        ) : (
                          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                        ))}
                      <span className={cn('rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium', isOracleVote(t) && 'text-muted-foreground')}>{opLabel(t)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <BlockLink height={t.block_height} className="text-sm" />
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <AddressLink address={t.sender} className="min-w-0" />
                      {t.target && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          {tokens.get(t.target.toLowerCase()) ? (
                            <Link href={`/address/${t.target}`} className="text-sm text-primary hover:underline">
                              {tokens.get(t.target.toLowerCase())!.symbol}
                            </Link>
                          ) : t.target.includes(':') ? (
                            <span className="truncate text-sm">
                              {t.target
                                .split(':')
                                .map((a) => (a.toUpperCase() === 'QRDX' ? 'QRDX' : tokens.get(a.toLowerCase())?.symbol ?? `${a.slice(0, 8)}…`))
                                .join(' / ')}
                            </span>
                          ) : /^0x[0-9a-fA-F]{40}$|^0xPQ/.test(t.target) ? (
                            <AddressLink address={t.target} className="min-w-0" />
                          ) : (
                            <span className="truncate font-mono text-xs text-muted-foreground">{t.target}</span>
                          )}
                        </>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {t.amount ? (
                      <>
                        {Number(t.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
                        {t.asset && !t.asset.startsWith('0x') && t.asset.toUpperCase() !== 'QRDX' ? (
                          <span className="text-muted-foreground">{t.asset}</span>
                        ) : t.asset && t.asset.toUpperCase() !== 'QRDX' ? (
                          <Link href={`/address/${t.asset}`} className="text-primary hover:underline">
                            {assetSymbol(t.asset, tokens)}
                          </Link>
                        ) : t.asset || t.kind !== 'exchange' ? (
                          <span className="text-muted-foreground">QRDX</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">{t.fee && Number(t.fee) > 0 ? Number(t.fee).toPrecision(2) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">
                    <TimeAgo timestamp={t.timestamp} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows === null && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…
        </p>
      )}
      {rows && !shown.length && !busy && (
        <p className="py-10 text-center text-sm text-muted-foreground">{hidden ? `Only validator votes here. Tick "Validator votes" to see them.` : 'No transactions yet.'}</p>
      )}
      {error && <p className="px-4 py-3 text-sm text-ask">{error}</p>}
      {cursor && rows && (
        <div className="border-t p-3 text-center">
          <button onClick={() => void fetchPage(cursor)} disabled={busy} className="rounded-lg border px-4 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
            {busy ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
