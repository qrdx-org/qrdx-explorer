'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Bars, type Bar } from '@/components/charts/Bars'
import type { ExplorerBlock } from '@/lib/qrdx'
import { epochMs, slotStartMs, type SlotClock } from '@/lib/qrdx/consensus'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChain, useNodeNow } from './ChainProvider'
import { useLiveBlocks, type ChainStats } from './hooks'

type SlotState = 'block' | 'missed' | 'current' | 'future' | 'pending'

const SLOT_STYLE: Record<SlotState, string> = {
  block: 'bg-primary/80 hover:bg-primary',
  missed: 'bg-ask/70',
  current: 'bg-primary/30 ring-1 ring-primary animate-pulse',
  future: 'bg-muted',
  pending: 'bg-muted-foreground/25',
}

/**
 * Every slot of the previous and current epoch: a block, a missed slot, or not read yet.
 * A slot counts as missed only between two consecutive blocks whose headers are both
 * read (block h at slot a, block h+1 at slot b: slots a+1 … b−1 had no block).
 */
export function SlotMap({ stats, epochs = 2 }: { stats: ChainStats; epochs?: number }) {
  const { clock, currentSlot, currentEpoch } = stats
  const span = clock ? clock.slotsPerEpoch * epochs + 8 : 72
  const { blocks } = useLiveBlocks(span)

  const rows = useMemo(() => {
    if (!clock || currentSlot == null || currentEpoch == null) return []
    const headers = blocks.map((b) => b.block).filter((b): b is ExplorerBlock => !!b && b.slot != null)
    const bySlot = new Map(headers.map((b) => [b.slot!, b]))
    const byHeight = new Map(headers.map((b) => [b.height, b]))
    const missed = new Set<number>()
    for (const b of headers) {
      const next = byHeight.get(b.height + 1)
      if (next?.slot != null) for (let s = b.slot! + 1; s < next.slot; s++) missed.add(s)
    }
    const out: { epoch: number; cells: { slot: number; state: SlotState; block: ExplorerBlock | null }[] }[] = []
    for (let e = currentEpoch - epochs + 1; e <= currentEpoch; e++) {
      if (e < 0) continue
      const cells = Array.from({ length: clock.slotsPerEpoch }, (_, i) => {
        const slot = e * clock.slotsPerEpoch + i
        const block = bySlot.get(slot) ?? null
        const state: SlotState = block ? 'block' : slot > currentSlot ? 'future' : slot === currentSlot ? 'current' : missed.has(slot) ? 'missed' : 'pending'
        return { slot, state, block }
      })
      out.push({ epoch: e, cells })
    }
    return out
  }, [blocks, clock, currentSlot, currentEpoch, epochs])

  if (!clock) return <p className="py-8 text-center text-sm text-muted-foreground">Reading the chain spec…</p>

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const produced = row.cells.filter((c) => c.state === 'block').length
        const missedCount = row.cells.filter((c) => c.state === 'missed').length
        return (
          <div key={row.epoch}>
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Epoch <span className="num text-foreground">{row.epoch.toLocaleString()}</span>
                {row.epoch === currentEpoch ? ' · current' : ''}
                {stats.finalizedEpoch != null && row.epoch <= stats.finalizedEpoch ? ' · finalized' : ''}
              </span>
              <span className="num">
                {produced} blocks{missedCount ? ` · ${missedCount} missed` : ''}
              </span>
            </div>
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${clock.slotsPerEpoch}, minmax(0, 1fr))` }}>
              {row.cells.map((c) => {
                const title = `Slot ${c.slot.toLocaleString()} · ${new Date(slotStartMs(clock, c.slot)).toLocaleTimeString([], { hour12: false })}.${String(slotStartMs(clock, c.slot) % 1000).padStart(3, '0')}\n${
                  c.block ? `Block #${c.block.height.toLocaleString()}` : c.state === 'missed' ? 'No block (missed slot)' : c.state === 'future' ? 'Upcoming' : c.state === 'current' ? 'In progress' : 'Not read yet'
                }`
                const cell = <span className={cn('block h-5 rounded-[3px] transition-colors sm:h-6', SLOT_STYLE[c.state])} title={title} />
                return c.block ? (
                  <Link key={c.slot} href={`/block/${c.block.height}`} aria-label={`Block ${c.block.height}`}>
                    {cell}
                  </Link>
                ) : (
                  <span key={c.slot}>{cell}</span>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
        <Legend className="bg-primary/80">block</Legend>
        <Legend className="bg-ask/70">missed slot</Legend>
        <Legend className="bg-primary/30 ring-1 ring-primary">current slot</Legend>
        <Legend className="bg-muted-foreground/25">header not read yet</Legend>
        <Legend className="bg-muted">upcoming</Legend>
      </div>
    </div>
  )
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-[2px]', className)} />
      {children}
    </span>
  )
}

/** Where the node's clock is in the current epoch, and how long until the next. */
export function EpochProgress({ clock, className }: { clock: SlotClock; className?: string }) {
  const now = useNodeNow(Math.min(clock.slotMs, 250))
  const length = epochMs(clock)
  const into = (((now - clock.genesisMs) % length) + length) % length
  const slot = Math.floor(into / clock.slotMs)
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear" style={{ width: `${(into / length) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span className="num">
          slot {slot + 1} of {clock.slotsPerEpoch}
        </span>
        <span className="num">next epoch in {formatMs(length - into)}</span>
      </div>
    </div>
  )
}

/** Block times from slots (exact to the slot), one bar per block; missed slots stand out. */
export function BlockTimeChart({ stats, count = 48, height = 130 }: { stats: ChainStats; count?: number; height?: number }) {
  const bars = useMemo<Bar[]>(
    () =>
      stats.intervals.slice(-count).map((i) => ({
        key: i.height,
        values: [{ value: i.ms, className: i.slots > 1 ? 'fill-ask' : 'fill-[hsl(var(--chart-1))]', label: 'ms' }],
        tooltip: `#${i.height.toLocaleString()} · ${formatMs(i.ms)} after its parent${i.slots > 1 ? ` · ${i.slots - 1} slot${i.slots > 2 ? 's' : ''} missed` : ''} · slot ${i.block.slot?.toLocaleString()}`,
      })),
    [stats.intervals, count],
  )
  if (!stats.clock) return <p className="py-10 text-center text-sm text-muted-foreground">Reading the chain spec…</p>
  if (bars.length < 2) return <p className="py-10 text-center text-sm text-muted-foreground">Reading block headers…</p>
  return <Bars bars={bars} height={height} unit={`ms (one slot is ${stats.clock.slotMs} ms)`} />
}

/** Finalized → current epoch, as a strip, with the lag in time. */
export function FinalityStrip({ stats }: { stats: ChainStats }) {
  const { clock, currentEpoch, finalizedEpoch, finalityLagEpochs } = stats
  if (!clock || currentEpoch == null || finalizedEpoch == null) return <p className="text-sm text-muted-foreground">Waiting for finality…</p>
  const shown = 8
  const first = Math.max(0, currentEpoch - shown + 1)
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: currentEpoch - first + 1 }, (_, i) => first + i).map((e) => {
          const state = e <= finalizedEpoch ? 'finalized' : e === currentEpoch ? 'current' : 'pending'
          return (
            <span
              key={e}
              title={`Epoch ${e.toLocaleString()}: ${state === 'finalized' ? 'finalized' : state === 'current' ? 'in progress' : 'awaiting finality'}`}
              className={cn(
                'num flex h-8 flex-1 items-center justify-center rounded-md border text-[11px]',
                state === 'finalized' ? 'border-bid/30 bg-bid/10 text-bid' : state === 'current' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-warn/30 bg-warn/10 text-warn',
              )}
            >
              {e.toLocaleString()}
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Finalized through epoch <span className="num text-foreground">{finalizedEpoch.toLocaleString()}</span>
        {finalityLagEpochs != null && (
          <>
            {' '}
            · <span className="num text-foreground">{finalityLagEpochs}</span> epoch{finalityLagEpochs === 1 ? '' : 's'} behind the clock (
            {formatMs(finalityLagEpochs * epochMs(clock))})
          </>
        )}
      </p>
    </div>
  )
}

/** The block's place in time: when its slot started, from the slot clock. */
export function slotTimeOf(clock: SlotClock | null, block: Pick<ExplorerBlock, 'slot'> | null): number | null {
  return clock && block?.slot != null ? slotStartMs(clock, block.slot) / 1000 : null
}

/** The chain's head epoch and finality in one line, for headers. */
export function useFinalityOf(block: Pick<ExplorerBlock, 'epoch' | 'height'> | null): 'genesis' | 'finalized' | 'pending' | 'unknown' {
  const { finalizedEpoch } = useChain()
  if (!block) return 'unknown'
  if (block.height === 0) return 'genesis'
  if (finalizedEpoch == null || block.epoch == null) return 'unknown'
  return block.epoch <= finalizedEpoch ? 'finalized' : 'pending'
}
