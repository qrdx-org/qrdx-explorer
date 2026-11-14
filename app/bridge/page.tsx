'use client'

import { useState } from 'react'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CheckCircle2, Clock, Coins, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { AddressLink, BlockLink, TxLink } from '@/components/explorer/common'
import { usePolled } from '@/components/explorer/hooks'
import { Panel, Pill, Row, Tile, fmtNum } from '@/components/explorer/ui'
import { getBridgeAssets, getBridgeDeposit, getBridgeGuardrails, getBridgeHeads, getBridgeWithdrawals, getDoomsday, type BridgeDeposit, type BridgeHead } from '@/lib/qrdx/consensus'

const WITHDRAWALS = 1000

/** Names for the source chains the bridge is likely to name; others show their id. */
const CHAINS: Record<number, string> = { 1: 'Ethereum', 10: 'Optimism', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum', 11155111: 'Sepolia', 421614: 'Arbitrum Sepolia' }
const chainName = (id: number) => CHAINS[id] ?? `chain ${id}`

const span = (seconds: number) => (seconds % 86400 === 0 ? `${seconds / 86400} day${seconds === 86400 ? '' : 's'}` : seconds % 3600 === 0 ? `${seconds / 3600} h` : `${Math.round(seconds / 60)} min`)

/**
 * The consensus bridge (qrdx-node docs/BRIDGE.md): what it carries, its guardrails and the
 * Doomsday Protocol's state, the source-chain heads deposits are proven against, the withdrawals
 * waiting for release on their source chains, and a deposit's progress by id.
 */
export default function BridgePage() {
  const assets = usePolled(() => getBridgeAssets(), 60_000)
  const withdrawals = usePolled(() => getBridgeWithdrawals(1, WITHDRAWALS), 15_000)
  const [query, setQuery] = useState('')
  const [deposit, setDeposit] = useState<{ id: string; result: BridgeDeposit | null; error: string | null } | null>(null)
  const guard = usePolled(() => getBridgeGuardrails().catch(() => null), 60_000)
  const doom = usePolled(() => getDoomsday().catch(() => null), 60_000)
  // Attested heads of every chain the bridge names (its assets' sources and its canaries').
  const chainKey = [...new Set([...(assets.data ?? []).map((a) => a.chain), ...Object.keys(doom.data?.canaries ?? {}).map(Number)])].sort((a, b) => a - b).join(',')
  const heads = usePolled(
    async () => {
      const chains = chainKey ? chainKey.split(',').map(Number) : []
      const all = await Promise.all(chains.map((c) => getBridgeHeads(c).catch(() => [] as BridgeHead[])))
      return all.map((h, i) => ({ chain: chains[i], count: h.length, newest: h[h.length - 1] ?? null }))
    },
    30_000,
    [chainKey]
  )
  const symbolOf = new Map((assets.data ?? []).map((a) => [`${a.chain}:${a.source_token.toLowerCase()}`, a]))
  const list = [...(withdrawals.data ?? [])].reverse()
  const validId = /^\d+:\d+$/.test(query.trim())

  const lookup = async () => {
    const id = query.trim()
    setDeposit({ id, result: null, error: null })
    try {
      setDeposit({ id, result: await getBridgeDeposit(id), error: null })
    } catch (e) {
      setDeposit({ id, result: null, error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (assets.error && !assets.data)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Bridge</h1>
        <Panel className="mt-6" bodyClassName="py-12 text-center text-sm text-muted-foreground">
          This node does not serve bridge_* ({assets.error}).
        </Panel>
      </div>
    )

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bridge</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Tokens locked in a lockbox on another chain are minted here once validators holding more than two thirds of the committee&apos;s stake attest the deposit, or once anyone
          proves the lockbox&apos;s record of it against a source-chain head the validators attested. A withdrawal burns the token here; the lockbox&apos;s custodian releases it on the
          source chain once the block is final.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Bridged assets" icon={<Coins className="h-4 w-4" />} value={assets.data ? assets.data.length : '—'} sub="set by the chain spec" />
        <Tile label="Withdrawals" icon={<ArrowUpFromLine className="h-4 w-4" />} value={withdrawals.data ? withdrawals.data.length.toLocaleString() : '—'} sub={withdrawals.data && withdrawals.data.length >= WITHDRAWALS ? `the first ${WITHDRAWALS.toLocaleString()}` : 'recorded on QRDX'} />
        <Tile label="Source chains" icon={<ArrowLeftRight className="h-4 w-4" />} value={assets.data ? new Set(assets.data.map((a) => a.chain)).size : '—'} sub={assets.data?.length ? [...new Set(assets.data.map((a) => chainName(a.chain)))].join(', ') : ''} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Guardrails"
          icon={<ShieldCheck className="h-4 w-4" />}
          right={guard.data ? guard.data.mint_paused ? <Pill tone="warn">Minting paused</Pill> : <Pill tone="bid">Minting open</Pill> : null}
        >
          {!guard.data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{guard.loading ? 'Loading…' : 'This node does not report the bridge’s guardrails.'}</p>
          ) : (
            <>
              <Row k="Deposit window">{span(guard.data.deposit_window)} from the source block</Row>
              <Row k="Minting">{guard.data.mint_paused ? 'paused by governance' : 'open'}</Row>
              {Object.entries(guard.data.mint_limits).map(([sym, l]) => (
                <Row key={sym} k={`${sym} limit`}>
                  {fmtNum(l.per_day, 2)} per {span(guard.data!.mint_period)} · cap {fmtNum(l.cap, 2)}
                </Row>
              ))}
              {Object.keys(guard.data.mint_limits).length === 0 && <Row k="Mint limits">none set</Row>}
              <p className="px-4 py-2 text-[11px] text-muted-foreground">
                A deposit older than the window can never be minted; the custodian refunds it on the source chain.
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Doomsday Protocol"
          icon={<ShieldAlert className="h-4 w-4" />}
          right={doom.data ? doom.data.triggered ? <Pill tone="ask">Triggered</Pill> : <Pill tone="bid">Not triggered</Pill> : null}
        >
          {!doom.data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{doom.loading ? 'Loading…' : 'This node does not report the Doomsday Protocol.'}</p>
          ) : (
            <>
              {doom.data.triggered ? (
                <>
                  <Row k="Triggered">{new Date(doom.data.triggered.time * 1000).toLocaleString()}</Row>
                  <Row k="Block">
                    <BlockLink height={doom.data.triggered.height} />
                  </Row>
                  <Row k="Cause">{doom.data.triggered.cause}</Row>
                </>
              ) : (
                <Row k="State">No canary key has signed</Row>
              )}
              {Object.entries(doom.data.canaries).map(([chain, address]) => (
                <Row key={chain} k={`Canary on ${chainName(Number(chain))}`}>
                  <span className="font-mono text-xs">{address}</span>
                </Row>
              ))}
              {Object.keys(doom.data.canaries).length === 0 && <Row k="Canaries">none on this network</Row>}
              <p className="px-4 py-2 text-[11px] text-muted-foreground">
                A canary is an account on another chain whose classical key nobody should be able to use. A signature from it proves that key type is broken: bridge minting stops and
                classical accounts move to their post-quantum successors.
              </p>
            </>
          )}
        </Panel>
      </div>

      {(heads.data?.length ?? 0) > 0 && (
        <Panel title="Attested heads" icon={<ArrowLeftRight className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">bridge_getHeads</span>}>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">Chain</th>
                  <th className="px-3 py-2.5 text-right font-medium">Newest head</th>
                  <th className="px-3 py-2.5 font-medium">State root</th>
                  <th className="px-3 py-2.5 font-medium">Finalized</th>
                  <th className="px-4 py-2.5 text-right font-medium">Kept</th>
                </tr>
              </thead>
              <tbody>
                {heads.data!.map((h) => (
                  <tr key={h.chain} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{chainName(h.chain)}</td>
                    <td className="px-3 py-2.5 text-right">{h.newest ? h.newest.height.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{h.newest ? `${h.newest.state_root.slice(0, 18)}…` : 'none attested yet'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{h.newest ? new Date(h.newest.timestamp * 1000).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{h.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            Validators attest each source chain&apos;s finalized head. BRIDGE_PROVE_DEPOSIT mints a deposit on a storage proof against one of these state roots.
          </p>
        </Panel>
      )}

      <Panel title="Assets" icon={<Coins className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">bridge_getAssets</span>}>
        {!assets.data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : assets.data.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No bridged assets on this network: the chain spec&apos;s BRIDGE_ASSETS lists none.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Token on QRDX</th>
                  <th className="px-4 py-2.5 text-right font-medium">Supply here</th>
                </tr>
              </thead>
              <tbody>
                {assets.data.map((a) => (
                  <tr key={a.token_address} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{a.symbol}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {chainName(a.chain)}
                      <span className="block font-mono text-[11px] text-muted-foreground">{a.source_token}</span>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <AddressLink address={a.token_address} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {fmtNum(a.supply, 4)} {a.symbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Deposit status" icon={<ArrowDownToLine className="h-4 w-4" />}>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            A deposit&apos;s id is its source chain and the number the lockbox gave it: <span className="font-mono">42161:17</span>.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (validId) void lookup()
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="chain:deposit number"
              aria-label="Deposit id"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-xs"
            />
            <button type="submit" disabled={!validId} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-50">
              <Search className="h-4 w-4" /> Look up
            </button>
          </form>
          {deposit && (
            <div className="rounded-md border p-3 text-sm">
              {deposit.error ? (
                <p className="text-ask">{deposit.error}</p>
              ) : !deposit.result ? (
                <p className="text-muted-foreground">Looking up…</p>
              ) : deposit.result.minted ? (
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-bid" /> Minted on QRDX.
                </p>
              ) : deposit.result.pending.length ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warn" /> Being attested: {deposit.result.pending.length} version{deposit.result.pending.length === 1 ? '' : 's'} of this deposit seen.
                  </p>
                  {deposit.result.pending.map((p, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {Array.isArray(p.voters) ? p.voters.length : Object.keys(p.voters).length} validator vote(s) since block {p.since.toLocaleString()}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Not minted, and no validator has attested it yet. Deposits are read once the source chain finalizes the block; anyone can also mint one with a proof
                  (BRIDGE_PROVE_DEPOSIT).
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Withdrawals" icon={<ArrowUpFromLine className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">newest first</span>}>
        {!withdrawals.data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{withdrawals.error ?? 'Loading…'}</p>
        ) : list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No withdrawals yet. BRIDGE_WITHDRAW burns a bridged token and records one here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">From</th>
                  <th className="px-3 py-2.5 font-medium">To</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Block</th>
                  <th className="px-4 py-2.5 font-medium">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {list.map((w) => {
                  const asset = symbolOf.get(`${w.chain}:${w.token.toLowerCase()}`)
                  return (
                    <tr key={w.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5 text-muted-foreground">{w.id}</td>
                      <td className="max-w-[200px] px-3 py-2.5">
                        <AddressLink address={w.from} />
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className="font-mono">{w.to.slice(0, 10)}…{w.to.slice(-6)}</span>
                        <span className="block text-[11px] text-muted-foreground">on {chainName(w.chain)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmtNum(w.amount, 6)} {asset?.symbol ?? ''}
                      </td>
                      <td className="px-3 py-2.5">
                        <BlockLink height={w.height} />
                      </td>
                      <td className="max-w-[160px] px-4 py-2.5">
                        <TxLink hash={w.tx_hash} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Releases happen on the source chain and the node does not record them: this list shows what was burned here, not whether the custodian has paid it out yet.
        </p>
      </Panel>
    </div>
  )
}
