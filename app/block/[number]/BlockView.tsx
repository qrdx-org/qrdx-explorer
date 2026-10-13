'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Blocks as BlocksIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileCode2, Fingerprint, Layers, ListTree, Radio, ShieldCheck, Timer } from 'lucide-react'
import { useChain, useHead, useNodeNow } from '@/components/explorer/ChainProvider'
import { AddressLink, CopyButton, formatPreciseTime, TimeAgo, TxKindBadge, TxLink } from '@/components/explorer/common'
import { slotTimeOf, useFinalityOf } from '@/components/explorer/consensus'
import { opLabel } from '@/components/explorer/HistoryTable'
import { useAsync, useChainStats, useHeaders } from '@/components/explorer/hooks'
import { Panel, Pill, Row, Tile, fmtNum } from '@/components/explorer/ui'
import { blockTxCount, getBlock, type ExplorerBlock } from '@/lib/qrdx'
import { epochMs, slotStartMs, type SlotClock } from '@/lib/qrdx/consensus'
import { getBlockTransactions, isOracleVote } from '@/lib/qrdx/indexed'
import { formatDateTime, formatMs, formatQrdx } from '@/lib/format'
import { cn } from '@/lib/utils'


const ZERO_ROOT = /^0*$/

function Mono({ value, empty = '—' }: { value: string | null | undefined; empty?: string }) {
  if (!value) return <span className="text-muted-foreground">{empty}</span>
  return (
    <span className="inline-flex max-w-full items-start gap-1">
      <span className="break-all text-left font-mono text-xs">{value}</span>
      <CopyButton value={value} />
    </span>
  )
}

export function BlockView({ number }: { number: string }) {
  const { clock, live } = useChain()
  const tip = useHead(500)
  const { data: block, loading, error, reload } = useAsync(() => getBlock(number), [number])
  const [waitingForBlock, setWaitingForBlock] = useState(false)

  useEffect(() => {
    if (block) live.remember(block)
  }, [block, live])

  // A future height: wait for the chain to reach it instead of erroring.
  const requestedHeight = /^\d+$/.test(number) ? Number(number) : null
  useEffect(() => {
    if (!loading && !block && requestedHeight != null && tip >= 0 && requestedHeight > tip) {
      setWaitingForBlock(true)
    } else if (waitingForBlock && requestedHeight != null && tip >= requestedHeight) {
      setWaitingForBlock(false)
      reload()
    }
  }, [loading, block, requestedHeight, tip, waitingForBlock, reload])

  if (loading && !block) {
    return <Shell><p className="py-16 text-center text-sm text-muted-foreground">Loading block…</p></Shell>
  }

  if (waitingForBlock && requestedHeight != null) {
    const eta = clock && tip >= 0 ? (requestedHeight - tip) * clock.slotMs : null
    return (
      <Shell>
        <Panel bodyClassName="py-14 text-center">
          <Clock className="mx-auto mb-3 h-9 w-9 animate-pulse text-primary" />
          <h2 className="text-lg font-semibold">Block #{requestedHeight.toLocaleString()} has not been produced yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The chain is at #{tip.toLocaleString()}
            {eta != null ? `, about ${formatMs(eta)} away at one block a slot` : ''}. This page opens it when it arrives.
          </p>
        </Panel>
      </Shell>
    )
  }

  if (error || !block) {
    return (
      <Shell>
        <Panel bodyClassName="py-14 text-center">
          <h2 className="text-lg font-semibold">Block not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error ?? `No block matches "${number}".`}</p>
          <button onClick={reload} className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Try again
          </button>
        </Panel>
      </Shell>
    )
  }

  return <BlockDetail block={block} tip={tip} clock={clock} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
}

function BlockDetail({ block, tip, clock }: { block: ExplorerBlock; tip: number; clock: SlotClock | null }) {
  const header = block.header
  const stats = useChainStats(0)
  const finality = useFinalityOf(block)
  const nodeNow = useNodeNow(1000)
  const parentHeight = block.height > 0 ? block.height - 1 : -1
  const neighbours = useHeaders([parentHeight, block.height < tip ? block.height + 1 : -1].filter((h) => h >= 0), 2)
  const parent = neighbours.get(parentHeight) ?? null
  const child = neighbours.get(block.height + 1) ?? null
  const indexed = useAsync(() => getBlockTransactions(block.height), [block.height])
  const [showVotes, setShowVotes] = useState(false)

  const slotTime = slotTimeOf(clock, block)
  const gap = parent && parent.slot != null && block.slot != null ? block.slot - parent.slot : null
  const nextGap = child && child.slot != null && block.slot != null ? child.slot - block.slot : null
  const confirmations = tip >= block.height ? tip - block.height : null
  const slotInEpoch = clock && block.slot != null ? (block.slot % clock.slotsPerEpoch) + 1 : null

  // When this block's epoch should finalize at the lag the chain is running with now.
  const finalizeEta = useMemo(() => {
    if (finality !== 'pending' || !clock || block.epoch == null || stats.finalityLagEpochs == null) return null
    const at = slotStartMs(clock, (block.epoch + stats.finalityLagEpochs + 1) * clock.slotsPerEpoch)
    return Math.max(0, at - nodeNow)
  }, [finality, clock, block.epoch, stats.finalityLagEpochs, nodeNow])

  const txs = indexed.data?.transactions ?? null
  const votes = (txs ?? []).filter(isOracleVote)
  const listed = (txs ?? []).filter((t) => showVotes || !isOracleVote(t))
  const txCount = txs ? txs.length : blockTxCount(block)

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/blocks" className="text-muted-foreground transition-colors hover:text-primary" aria-label="All blocks">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Block #{block.height.toLocaleString()}</h1>
          {finality === 'genesis' ? (
            <Pill>genesis</Pill>
          ) : finality === 'finalized' ? (
            <Pill tone="bid">
              <CheckCircle2 className="h-3 w-3" /> finalized
            </Pill>
          ) : finality === 'pending' ? (
            <Pill tone="warn">pending finality</Pill>
          ) : (
            <Pill>checking finality</Pill>
          )}
          {gap != null && gap > 1 && <Pill tone="ask">{gap - 1} missed slot{gap > 2 ? 's' : ''} before</Pill>}
          <div className="ml-auto flex gap-2">
            <NavButton href={block.height > 0 ? `/block/${block.height - 1}` : null}>
              <ChevronLeft className="h-4 w-4" /> Parent
            </NavButton>
            <NavButton href={tip < 0 || block.height < tip ? `/block/${block.height + 1}` : null}>
              Child <ChevronRight className="h-4 w-4" />
            </NavButton>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <span className="break-all font-mono text-xs">{block.hash}</span>
          <CopyButton value={block.hash} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Slot" icon={<Clock className="h-4 w-4" />} value={block.slot != null ? block.slot.toLocaleString() : '—'} sub={slotInEpoch && clock ? `${slotInEpoch} of ${clock.slotsPerEpoch} in epoch ${block.epoch?.toLocaleString()}` : ''} />
        <Tile
          label="Block time"
          icon={<Timer className="h-4 w-4" />}
          value={gap != null && clock ? formatMs(gap * clock.slotMs) : block.height === 0 ? '—' : '…'}
          sub={gap != null ? (gap === 1 ? 'the slot after its parent' : `${gap} slots after its parent`) : block.height === 0 ? 'genesis' : 'reading the parent'}
        />
        <Tile label="Slot started" icon={<Clock className="h-4 w-4" />} value={slotTime ? <TimeAgo timestamp={slotTime} precise /> : <TimeAgo timestamp={block.timestamp} />} sub={slotTime ? formatPreciseTime(slotTime).split(' ')[1] : formatDateTime(block.timestamp)} />
        <Tile label="Transactions" icon={<Radio className="h-4 w-4" />} value={txs ? txCount : indexed.loading ? '…' : txCount} sub={txs ? `${votes.length} oracle vote${votes.length === 1 ? '' : 's'}` : 'native, from the header'} />
        <Tile label="Attestations" icon={<ShieldCheck className="h-4 w-4" />} value={block.attestationCount} sub={header.kind === 'pos' ? `${header.slashingEvidenceCount} slashing evidence` : ''} />
        <Tile
          label="Confirmations"
          icon={<Layers className="h-4 w-4" />}
          value={confirmations != null ? confirmations.toLocaleString() : '—'}
          sub={confirmations != null && clock ? `${formatMs(confirmations * (stats.avg100Ms ?? clock.slotMs))} of blocks on top` : ''}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Overview" icon={<BlocksIcon className="h-4 w-4" />}>
          <Row k="Height">{block.height.toLocaleString()}</Row>
          <Row k="Hash" wrap>
            <Mono value={block.hash} />
          </Row>
          <Row k="Parent" wrap>
            {block.parentHash && block.height > 0 ? (
              <span className="inline-flex items-start gap-1">
                <Link href={`/block/${block.height - 1}`} className="break-all text-left font-mono text-xs text-primary hover:underline">
                  {block.parentHash}
                </Link>
                <CopyButton value={block.parentHash} />
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
          {header.kind === 'pos' && (
            <>
              <Row k="Proposer">
                <AddressLink address={header.proposer} avatar copy />
              </Row>
              <Row k="Slot start">{slotTime ? formatPreciseTime(slotTime) : '—'}</Row>
              <Row k="Recorded timestamp">
                {formatDateTime(block.timestamp)} <span className="text-xs text-muted-foreground">(whole seconds)</span>
              </Row>
              <Row k="Epoch">
                {header.epoch.toLocaleString()}
                {slotInEpoch && clock ? <span className="text-muted-foreground"> · slot {slotInEpoch} of {clock.slotsPerEpoch}</span> : null}
              </Row>
              <Row k="Finality">
                {finality === 'finalized'
                  ? `Finalized (epoch ${stats.finalizedEpoch?.toLocaleString()} and earlier)`
                  : finality === 'pending'
                    ? finalizeEta != null
                      ? finalizeEta === 0
                        ? 'Due now'
                        : `Expected in about ${formatMs(finalizeEta)} at the current finality lag`
                      : 'Pending'
                    : '—'}
              </Row>
              <Row k="State root" wrap>
                <Mono value={header.stateRoot} />
              </Row>
              <Row k="Transactions root" wrap>{ZERO_ROOT.test(header.transactionsRoot) ? <span className="text-muted-foreground">empty (no native transactions)</span> : <Mono value={header.transactionsRoot} />}</Row>
              <Row k="RANDAO reveal" wrap>
                <Mono value={header.randaoReveal} empty="none" />
              </Row>
              <Row k="Proposer signature">
                ML-DSA-65 · {header.proposerSignatureBytes.toLocaleString()} bytes
                {header.proposerPublicKeyBytes ? ` · key ${header.proposerPublicKeyBytes.toLocaleString()} bytes` : ''}
              </Row>
              {header.graffiti && <Row k="Graffiti">{header.graffiti}</Row>}
            </>
          )}
          {header.kind === 'genesis' && (
            <>
              <Row k="Network">
                {header.networkName} (chain ID {header.chainId})
              </Row>
              <Row k="Genesis time">{formatDateTime(header.genesisTime)}</Row>
              <Row k="State root" wrap>
                <Mono value={header.stateRoot} />
              </Row>
              <Row k="RANDAO seed" wrap>
                <Mono value={header.randaoSeed} />
              </Row>
              <Row k="Allocations">
                {header.prefundedAccounts} prefunded · {header.systemWallets} system wallets · {header.validators} validators
              </Row>
              {header.systemWalletController && (
                <Row k="System wallet controller">
                  <AddressLink address={header.systemWalletController} copy />
                </Row>
              )}
            </>
          )}
          {header.kind === 'pow' && (
            <>
              <Row k="Miner">
                <AddressLink address={header.miner} copy />
              </Row>
              <Row k="Merkle root" wrap>
                <Mono value={header.merkleRoot} />
              </Row>
              <Row k="Difficulty">{header.difficulty}</Row>
              <Row k="Nonce">{header.nonce}</Row>
            </>
          )}
          <Row k="Header size">{Math.round(block.contentBytes).toLocaleString()} bytes stored</Row>
        </Panel>

        <div className="space-y-6">
          <Panel title="Slot timeline" icon={<Timer className="h-4 w-4" />} bodyClassName="p-4">
            {clock && block.slot != null ? (
              <SlotTimeline clock={clock} block={block} parent={parent} child={child} />
            ) : (
              <p className="text-sm text-muted-foreground">{block.height === 0 ? 'Genesis has no slot before it.' : 'Reading the chain spec…'}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
              <div>
                <div className="text-muted-foreground">After parent</div>
                <div className="num mt-0.5 font-medium">{gap != null && clock ? `${formatMs(gap * clock.slotMs)} · ${gap} slot${gap === 1 ? '' : 's'}` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Before child</div>
                <div className="num mt-0.5 font-medium">{nextGap != null && clock ? `${formatMs(nextGap * clock.slotMs)} · ${nextGap} slot${nextGap === 1 ? '' : 's'}` : block.height >= tip ? 'head of the chain' : '—'}</div>
              </div>
            </div>
          </Panel>

          {header.kind === 'pos' && clock && block.slot != null && (
            <Panel title={`Epoch ${header.epoch.toLocaleString()}`} icon={<Layers className="h-4 w-4" />} bodyClassName="p-4">
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${clock.slotsPerEpoch}, minmax(0, 1fr))` }}>
                {Array.from({ length: clock.slotsPerEpoch }, (_, i) => {
                  const slot = header.epoch * clock.slotsPerEpoch + i
                  return (
                    <span
                      key={slot}
                      title={`Slot ${slot.toLocaleString()}`}
                      className={cn('h-4 rounded-[2px]', slot === block.slot ? 'bg-primary' : slot < block.slot! ? 'bg-primary/25' : 'bg-muted')}
                    />
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Slot {slotInEpoch} of {clock.slotsPerEpoch}; the epoch runs {formatMs(epochMs(clock))}, from{' '}
                {formatPreciseTime(slotStartMs(clock, header.epoch * clock.slotsPerEpoch) / 1000).split(' ')[1]}.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <Panel
        title={`Transactions${txs ? ` (${txs.length}${indexed.data && !indexed.data.complete ? '+' : ''})` : ''}`}
        icon={<ListTree className="h-4 w-4" />}
        right={
          votes.length > 0 ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={showVotes} onChange={(e) => setShowVotes(e.target.checked)} className="accent-[hsl(var(--primary))]" /> Show {votes.length} oracle vote{votes.length === 1 ? '' : 's'}
            </label>
          ) : null
        }
      >
        {txs ? (
          listed.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{txs.length ? 'Only validator oracle votes in this block.' : 'No transactions in this block.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="num w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b text-left">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Transaction</th>
                    <th className="px-3 py-2.5 font-medium">Operation</th>
                    <th className="hidden px-3 py-2.5 font-medium md:table-cell">From → To</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((t) => (
                    <tr key={`${t.position}:${t.tx_hash}`} className="border-b last:border-b-0 hover:bg-accent/40">
                      <td className="px-4 py-2 text-muted-foreground">{t.position}</td>
                      <td className="px-3 py-2">
                        <TxLink hash={t.tx_hash} />
                      </td>
                      <td className="px-3 py-2">{opLabel(t)}</td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        <span className="flex items-center gap-1">
                          <AddressLink address={t.sender} />
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <AddressLink address={t.target} />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{t.amount ? `${fmtNum(t.amount, 6)} ${t.asset && t.asset.length < 12 ? t.asset : ''}` : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Pill tone={t.status === 'success' ? 'bid' : t.status === 'failed' ? 'ask' : 'muted'}>{t.status}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : block.transactions.length ? (
          <div className="divide-y">
            {block.transactions.map((tx) => (
              <div key={`${tx.kind}-${tx.hash}`} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <TxKindBadge kind={tx.kind} />
                  <TxLink hash={tx.hash} />
                  <span className="hidden text-xs text-muted-foreground sm:inline">{tx.method}</span>
                </div>
                <span className="num text-sm">{formatQrdx(tx.value, 6)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">{indexed.loading ? 'Reading the transaction index…' : 'No transactions in this block.'}</p>
        )}
      </Panel>

      {header.kind === 'pos' && header.attestations.length > 0 && (
        <Panel title={`Attestations (${header.attestations.length})`} icon={<ShieldCheck className="h-4 w-4" />}>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">Validator</th>
                  <th className="px-3 py-2.5 text-right font-medium">Slot</th>
                  <th className="px-3 py-2.5 text-right font-medium">Epoch</th>
                  <th className="px-3 py-2.5 text-right font-medium">Source → target</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Attested block</th>
                </tr>
              </thead>
              <tbody>
                {header.attestations.map((att, i) => (
                  <tr key={`${att.validatorAddress}-${att.slot}-${i}`} className="border-b last:border-b-0">
                    <td className="px-4 py-2">
                      <AddressLink address={att.validatorAddress} avatar />
                    </td>
                    <td className="px-3 py-2 text-right">{att.slot.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{att.epoch.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {att.sourceEpoch} → {att.targetEpoch}
                    </td>
                    <td className="hidden px-4 py-2 md:table-cell">
                      <Link href={`/block/${att.blockHash}`} className="font-mono text-xs text-primary hover:underline">
                        {att.blockHash.slice(0, 16)}…
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
          <FileCode2 className="h-4 w-4 text-primary" /> Decoded header
          <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">show</span>
        </summary>
        <pre className="max-h-[420px] overflow-auto border-t bg-muted/30 p-4 text-[11px] leading-relaxed">{JSON.stringify(block.header, null, 2)}</pre>
      </details>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Fingerprint className="h-3 w-3" /> Header from <code>/get_block</code>; transactions from the node&apos;s transaction index; times from the slot clock (genesis + slot × {clock ? formatMs(clock.slotMs) : 'slot length'}).
      </p>
    </div>
  )
}

/** The slots from the parent's to the child's, with this block's highlighted and any missed slots between. */
function SlotTimeline({ clock, block, parent, child }: { clock: SlotClock; block: ExplorerBlock; parent: ExplorerBlock | null; child: ExplorerBlock | null }) {
  const self = block.slot!
  const from = parent?.slot != null ? parent.slot : self - 2
  const to = child?.slot != null ? child.slot : self + 2
  const cells = Array.from({ length: Math.min(40, to - from + 1) }, (_, i) => from + i)
  return (
    <div>
      <div className="flex items-end gap-1">
        {cells.map((s) => {
          const kind = s === self ? 'self' : s === parent?.slot ? 'parent' : s === child?.slot ? 'child' : (parent?.slot != null && s > parent.slot && s < self) || (child?.slot != null && s > self && s < child.slot) ? 'missed' : 'unknown'
          return (
            <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  'block h-10 w-full rounded-md border',
                  kind === 'self' ? 'border-primary bg-primary' : kind === 'parent' || kind === 'child' ? 'border-primary/40 bg-primary/20' : kind === 'missed' ? 'border-ask/40 bg-ask/15' : 'border-dashed bg-muted/40',
                )}
                title={`Slot ${s.toLocaleString()} · ${formatPreciseTime(slotStartMs(clock, s) / 1000)}`}
              />
              <span className={cn('num truncate text-[10px]', kind === 'self' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{kind === 'self' ? 'this' : kind === 'parent' ? 'parent' : kind === 'child' ? 'child' : kind === 'missed' ? 'missed' : ''}</span>
            </div>
          )
        })}
      </div>
      <p className="num mt-2 text-xs text-muted-foreground">
        Slots {from.toLocaleString()} – {to.toLocaleString()} · each {formatMs(clock.slotMs)}
      </p>
    </div>
  )
}

function NavButton({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href)
    return <span className="flex h-8 items-center gap-1 rounded-md border px-2.5 text-sm text-muted-foreground opacity-40">{children}</span>
  return (
    <Link href={href} className="flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-sm transition-colors hover:bg-accent">
      {children}
    </Link>
  )
}
