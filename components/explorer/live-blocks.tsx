'use client'

import { Blocks } from 'lucide-react'
import type { ExplorerBlock } from '@/lib/qrdx'
import type { LiveBlock } from '@/lib/qrdx/live'
import { formatHash, formatMs, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChain, useNow } from './ChainProvider'
import { AddressLink, BlockLink, formatPreciseTime } from './common'
import { slotTimeOf } from './consensus'
import { indexedCount, useRecentIndex } from './data'
import { Pill } from './ui'

/**
 * When a block happened, in node time: its slot's start (exact) once its header is read,
 * else when the stream announced it. Shown against the local clock, corrected for skew.
 */
export function useBlockTime(row: LiveBlock): number | null {
  const { clock, clockOffsetMs } = useChain()
  const nodeSeconds = slotTimeOf(clock, row.block) ?? row.observedAt ?? row.block?.timestamp ?? null
  return nodeSeconds == null ? null : nodeSeconds + clockOffsetMs / 1000
}

export function BlockAge({ row }: { row: LiveBlock }) {
  const at = useBlockTime(row)
  const now = useNow(250)
  return (
    <span className="num" title={at ? formatPreciseTime(at) : undefined}>
      {now ? timeAgo(at, now, true) : '—'}
    </span>
  )
}

/** Milliseconds from the parent block, from slots; null without both headers. */
export function intervalMs(block: ExplorerBlock | null, parent: ExplorerBlock | null | undefined, slotMs: number | undefined): { ms: number; missed: number } | null {
  if (!block || !parent || block.slot == null || parent.slot == null || !slotMs || block.height !== parent.height + 1) return null
  const slots = block.slot - parent.slot
  return { ms: slots * slotMs, missed: Math.max(0, slots - 1) }
}

export function Interval({ value }: { value: { ms: number; missed: number } | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn('num', value.missed ? 'text-ask' : '')} title={value.missed ? `${value.missed} slot${value.missed === 1 ? '' : 's'} with no block before this one` : 'The next slot after its parent'}>
      {formatMs(value.ms)}
    </span>
  )
}

export function TxCount({ height, block }: { height: number; block: ExplorerBlock | null }) {
  const index = useRecentIndex()
  const counted = indexedCount(index, height)
  if (counted != null) return <span className={cn('num', counted ? 'text-foreground' : 'text-muted-foreground')}>{counted}</span>
  // Not indexed yet (or older than the index page): the header's native transactions at least.
  if (block?.nativeTxCount) return <span className="num" title="Native transactions; the index has not reached this block">{block.nativeTxCount}+</span>
  return <span className="text-muted-foreground" title="The transaction index has not reached this block yet">…</span>
}

/** Compact rows for the home page. */
export function LatestBlocksList({ rows, limit = rows.length }: { rows: LiveBlock[]; limit?: number }) {
  const { clock } = useChain()
  return (
    <div>
      {rows.slice(0, limit).map((row, i) => {
        const b = row.block
        return (
          <div key={row.height} className={cn('flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0', i === 0 && 'flash-in')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Blocks className="h-4 w-4 text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <BlockLink height={row.height} className="font-medium" />
              <span className="block truncate text-xs text-muted-foreground">
                <BlockAge row={row} /> · {b?.slot != null ? `slot ${b.slot.toLocaleString()}` : row.hash ? formatHash(row.hash, 8, 4) : 'reading…'}
              </span>
            </span>
            <span className="min-w-0 text-right text-xs text-muted-foreground">
              <span className="block">
                <TxCount height={row.height} block={b} /> txns · <Interval value={intervalMs(b, rows[i + 1]?.block, clock?.slotMs)} />
              </span>
              <span className="block truncate">{b?.proposer ? <AddressLink address={b.proposer} className="text-xs" /> : <span>&nbsp;</span>}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The full table for /blocks. `rows` newest first; the row after each is its parent when
 * consecutive. Shows the first `limit` rows (pass one row more, so the last shown has a parent).
 */
export function BlocksTable({ rows, live, limit = rows.length }: { rows: LiveBlock[]; live: boolean; limit?: number }) {
  const { clock, finalizedEpoch } = useChain()
  return (
    <div className="overflow-x-auto">
      <table className="num w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr className="border-b text-left">
            <th className="px-4 py-2.5 font-medium">Block</th>
            <th className="px-3 py-2.5 font-medium">Age</th>
            <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Slot</th>
            <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Epoch</th>
            <th className="px-3 py-2.5 text-right font-medium">Block time</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Proposer</th>
            <th className="px-3 py-2.5 text-right font-medium">Txns</th>
            <th className="hidden px-3 py-2.5 text-right font-medium xl:table-cell">Att.</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Finality</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((row, i) => {
            const b = row.block
            const finalized = b && finalizedEpoch != null && b.epoch != null && b.epoch <= finalizedEpoch
            return (
              <tr key={row.height} className={cn('border-b last:border-b-0 hover:bg-accent/40', live && i === 0 && 'flash-in')}>
                <td className="px-4 py-2">
                  <BlockLink height={row.height} className="font-medium" />
                  <div className="hidden font-mono text-[11px] text-muted-foreground sm:block">{row.hash ? formatHash(row.hash, 8, 6) : '—'}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  <BlockAge row={row} />
                </td>
                <td className="hidden px-3 py-2 text-right md:table-cell">{b?.slot != null ? b.slot.toLocaleString() : <span className="text-muted-foreground">—</span>}</td>
                <td className="hidden px-3 py-2 text-right lg:table-cell">
                  {b?.epoch != null && clock && b.slot != null ? (
                    <>
                      {b.epoch.toLocaleString()} <span className="text-[11px] text-muted-foreground">· {(b.slot % clock.slotsPerEpoch) + 1}/{clock.slotsPerEpoch}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Interval value={intervalMs(b, rows[i + 1]?.block, clock?.slotMs)} />
                </td>
                <td className="hidden max-w-[220px] px-3 py-2 md:table-cell">
                  {b ? b.proposer ? <AddressLink address={b.proposer} avatar /> : <span className="text-muted-foreground">Genesis</span> : <span className="text-muted-foreground">reading…</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <TxCount height={row.height} block={b} />
                </td>
                <td className="hidden px-3 py-2 text-right xl:table-cell">{b ? b.attestationCount : '—'}</td>
                <td className="hidden px-4 py-2 text-right sm:table-cell">
                  {row.height === 0 ? (
                    <Pill>genesis</Pill>
                  ) : !b || finalizedEpoch == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : finalized ? (
                    <Pill tone="bid">finalized</Pill>
                  ) : (
                    <Pill tone="warn">pending</Pill>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
