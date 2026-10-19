'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, Code2, ExternalLink, FileCode2, Play } from 'lucide-react'
import { AddressLink, BlockLink, CopyButton, TxLink } from '@/components/explorer/common'
import { Panel, Pill, Row } from '@/components/explorer/ui'
import { getContractInfo, getContractLogs, readCall, type ContractInfo, type DecodedLog } from '@/lib/qrdx/contracts'
import { getAddressHistory, type IndexedTx } from '@/lib/qrdx/indexed'
import { fmtNum } from '@/components/explorer/ui'


/**
 * An EVM contract without its source: what it is (code, standards, a known contract by its code
 * hash), who created it and when, its recent events, and read-only calls by signature.
 */
export function ContractPanel({ address }: { address: string }) {
  const [info, setInfo] = useState<ContractInfo | null | undefined>(undefined)
  const [creation, setCreation] = useState<IndexedTx | null>(null)
  const [logs, setLogs] = useState<DecodedLog[] | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    let live = true
    getContractInfo(address).then((i) => live && setInfo(i))
    // The creation is the EVM row that names this address as created (tx_index.py).
    getAddressHistory(address, { limit: 500, kinds: 'evm' })
      .then(async (p) => {
        let rows = p.transactions
        let cursor = p.next_cursor
        for (let i = 0; i < 4 && cursor && !rows.some((t) => t.roles?.includes('created')); i++) {
          const next = await getAddressHistory(address, { limit: 500, kinds: 'evm', cursor })
          rows = [...rows, ...next.transactions]
          cursor = next.next_cursor
        }
        if (live) setCreation(rows.find((t) => t.roles?.includes('created')) ?? null)
      })
      .catch(() => undefined)
    getContractLogs(address)
      .then((l) => live && setLogs(l))
      .catch((e) => live && (setLogs([]), setLogError(e instanceof Error ? e.message : String(e))))
    return () => {
      live = false
    }
  }, [address])

  if (info === undefined) return <p className="py-10 text-center text-sm text-muted-foreground">Reading the contract…</p>
  if (info === null) return <p className="py-10 text-center text-sm text-muted-foreground">No contract code at this address.</p>

  return (
    <div className="space-y-4 p-4">
      {info.known && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="font-medium">{info.known.name}</div>
            <div className="text-xs text-muted-foreground">{info.known.description} Recognised by its code, which matches the published build exactly.</div>
            <a href={info.known.source} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Source <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
      <Panel title="Contract" icon={<FileCode2 className="h-4 w-4" />}>
        <Row k="Standards">
          {info.interfaces.length ? (
            <span className="inline-flex flex-wrap justify-end gap-1">
              {info.interfaces.map((i) => (
                <Pill key={i} tone="primary">
                  {i}
                </Pill>
              ))}
            </span>
          ) : (
            'None detected'
          )}
        </Row>
        {info.erc20 && (
          <>
            <Row k="Token">{`${info.erc20.name ?? '—'} (${info.erc20.symbol ?? '—'})`}</Row>
            <Row k="Total supply">{info.erc20.decimals != null && info.erc20.totalSupply ? `${fmtNum(Number(info.erc20.totalSupply) / 10 ** info.erc20.decimals, 4)} ${info.erc20.symbol ?? ''}` : '—'}</Row>
          </>
        )}
        <Row k="Code size">{`${info.size.toLocaleString()} bytes`}</Row>
        <Row k="Code hash">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            {info.codeHash.slice(0, 18)}…{info.codeHash.slice(-6)} <CopyButton value={info.codeHash} />
          </span>
        </Row>
        <Row k="Created by">{creation ? <AddressLink address={creation.sender} /> : 'Not in the index'}</Row>
        {creation && (
          <Row k="Creation">
            <span className="inline-flex items-center gap-2">
              <TxLink hash={creation.tx_hash} /> in <BlockLink height={creation.block_height} />
            </span>
          </Row>
        )}
        <Row k="Source">{info.known ? 'Published (see above)' : 'Not verified: the explorer has no source for this code'}</Row>
      </Panel>

      <Panel title={`Events${logs ? ` (${logs.length.toLocaleString()})` : ''}`} icon={<Code2 className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">last 200,000 blocks</span>}>
        {!logs ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading events…</p>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{logError ?? 'No events in this range.'}</p>
        ) : (
          <div className="divide-y">
            {logs.slice(0, 100).map((l) => (
              <div key={`${l.tx}:${l.index}`} className="px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{l.name ?? <span className="font-mono text-muted-foreground">{l.raw.topics[0]?.slice(0, 18)}…</span>}</span>
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <TxLink hash={l.tx} /> <BlockLink height={l.block} />
                  </span>
                </div>
                {l.args.length > 0 ? (
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    {l.args.map((a) => (
                      <div key={a.name} className="flex min-w-0 gap-2">
                        <span className="shrink-0 text-muted-foreground">{a.name}</span>
                        <span className="min-w-0 truncate font-mono">{a.kind === 'address' ? <AddressLink address={a.value} /> : a.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {l.raw.topics.slice(1).join(' ')} {l.raw.data !== '0x' ? l.raw.data : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ReadContract address={address} />

      <Panel title="Bytecode" right={<button onClick={() => setShowCode(!showCode)} className="text-xs text-primary hover:underline">{showCode ? 'Hide' : 'Show'}</button>}>
        {showCode && (
          <div className="p-4">
            <div className="mb-2 flex justify-end">
              <CopyButton value={info.code} />
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-[11px]">{info.code}</pre>
          </div>
        )}
      </Panel>
    </div>
  )
}

function ReadContract({ address }: { address: string }) {
  const [signature, setSignature] = useState('')
  const [args, setArgs] = useState('')
  const [out, setOut] = useState<{ data?: string; words?: string[]; error?: string } | null>(null)
  const run = async () => {
    setOut(null)
    try {
      const list = args.trim() ? args.split(',').map((a) => a.trim()) : []
      setOut(await readCall(address, signature, list))
    } catch (e) {
      setOut({ error: e instanceof Error ? e.message : String(e) })
    }
  }
  return (
    <Panel title="Read" icon={<Play className="h-4 w-4" />}>
      <div className="space-y-2 p-4 text-xs">
        <p className="text-muted-foreground">Call a view function against the latest block. Nothing is signed or sent.</p>
        <div className="flex flex-wrap gap-2">
          <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="balanceOf(address)" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono" aria-label="Function signature" />
          <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="arguments, comma-separated" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono" aria-label="Arguments" />
          <button onClick={() => void run()} disabled={!signature.trim()} className="h-9 rounded-md border px-3 font-medium hover:bg-accent disabled:opacity-50">
            Call
          </button>
        </div>
        {out?.error && <p className="text-ask">{out.error}</p>}
        {out?.words && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-2 font-mono">
            {out.words.length === 0 ? (
              <div className="text-muted-foreground">No return data ({out.data})</div>
            ) : (
              out.words.map((w, i) => (
                <div key={i} className="break-all">
                  <span className="text-muted-foreground">[{i}]</span> {w}
                  <span className="text-muted-foreground"> = {BigInt(w).toString()}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
