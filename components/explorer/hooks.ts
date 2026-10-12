'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExplorerBlock } from '@/lib/qrdx'
import { epochOf, slotAt, type SlotClock } from '@/lib/qrdx/consensus'
import { quantile, slotIntervals, spanBlockTimeMs, type LiveBlock, type SlotInterval } from '@/lib/qrdx/live'
import { useChain, useHead, useLive, useNodeNow } from './ChainProvider'

/**
 * The newest `count` blocks as the stream announces them (height, hash, time), with each
 * one's header once read. Headers are read for the newest `details` rows (default: all).
 * `paused` freezes the list where it is, so it can be read at four blocks a second.
 */
export function useLiveBlocks(count: number, options: { paused?: boolean; details?: number } = {}) {
  const { live } = useChain()
  const [owner] = useState(() => Symbol('live-blocks'))
  const head = useHead()
  const [frozen, setFrozen] = useState<number | null>(null)
  useEffect(() => {
    setFrozen(options.paused ? live.head : null)
  }, [options.paused, live])
  const top = frozen ?? head
  const detailRows = Math.min(count, options.details ?? count)

  useEffect(() => {
    if (top < 0) return
    live.want(
      owner,
      Array.from({ length: detailRows }, (_, i) => top - i).filter((h) => h >= 0),
    )
  }, [live, owner, top, detailRows])
  useEffect(() => () => live.release(owner), [live, owner])

  const blocks = useLive<LiveBlock[]>(
    (l) => {
      const out: LiveBlock[] = []
      for (let h = top; h >= 0 && out.length < count; h--) out.push(l.get(h))
      return out
    },
    [top, count],
  )
  return { blocks, loading: top < 0, head: top }
}

/** Headers for specific heights, read through the live store; returns those read so far. */
export function useHeaders(heights: number[], priority = 0): Map<number, ExplorerBlock> {
  const { live } = useChain()
  const [owner] = useState(() => Symbol('headers'))
  const key = heights.join(',')
  useEffect(() => {
    live.want(owner, key ? key.split(',').map(Number) : [], priority)
  }, [live, owner, key, priority])
  useEffect(() => () => live.release(owner), [live, owner])
  return useLive(
    (l) => {
      const out = new Map<number, ExplorerBlock>()
      for (const h of key ? key.split(',').map(Number) : []) {
        const d = l.detail(h)
        if (d) out.set(h, d)
      }
      return out
    },
    [key],
  )
}

export interface ChainStats {
  head: number
  /** The newest header read (the head's, a moment after it is announced). */
  headBlock: ExplorerBlock | null
  clock: SlotClock | null
  /** The slot the node's clock is in now. */
  currentSlot: number | null
  currentEpoch: number | null
  /** 0 … slotsPerEpoch−1 */
  slotInEpoch: number | null
  /** Slots since genesis with no block. */
  missedSinceGenesis: number | null
  /** Blocks ÷ slots since genesis. */
  fillSinceGenesis: number | null
  avgSinceGenesisMs: number | null
  /** Mean block time over about the latest 100 and 1,000 blocks (slot difference ÷ height difference). */
  avg100Ms: number | null
  avg1000Ms: number | null
  /** Per-block times between consecutive headers held, oldest first. */
  intervals: SlotInterval[]
  p50Ms: number | null
  p95Ms: number | null
  /** Slots missed between the consecutive headers held. */
  recentMissed: number
  finalizedEpoch: number | null
  /** Epochs from the finalized one to the current one. */
  finalityLagEpochs: number | null
}

/** Round down to a hundred, so an anchor height (and its fetch) changes every 25 seconds, not per block. */
const anchor = (h: number) => Math.max(0, Math.floor(h / 100) * 100)

/**
 * The chain's timing: the slot clock, block times measured from slots (exact; block
 * timestamps are whole seconds), missed slots and finality. Two extra header reads give
 * the 100- and 1,000-block averages. Following the head reads about four headers a second;
 * `window = 0` reads none and gives the clock and finality alone.
 */
export function useChainStats(window = 64): ChainStats {
  const { clock, finalizedEpoch } = useChain()
  const head = useHead()
  const now = useNodeNow(250)
  // window 0: the slot clock and finality only, no header reads.
  const a100 = window > 0 && head >= 0 ? anchor(head - 100) : -1
  const a1000 = window > 0 && head >= 1000 ? anchor(head - 1000) : -1
  // Ahead of the newest blocks in the queue: two reads give the window averages.
  const anchors = useHeaders([a100, a1000].filter((h) => h > 0), 1)
  const recent = useLiveBlocks(window)
  const headers = useMemo(() => recent.blocks.map((b) => b.block).filter((b): b is ExplorerBlock => !!b), [recent.blocks])
  const headBlock = headers[0] ?? null

  return useMemo(() => {
    const slotMs = clock?.slotMs ?? null
    const currentSlot = clock ? slotAt(clock, now) : null
    const currentEpoch = clock && currentSlot != null ? epochOf(clock, currentSlot) : null
    const intervals = slotMs ? slotIntervals(headers, slotMs) : []
    const sorted = intervals.map((i) => i.ms).sort((x, y) => x - y)
    const fromGenesis = headBlock && headBlock.slot != null && headBlock.height > 0 ? headBlock : null
    return {
      head,
      headBlock,
      clock,
      currentSlot,
      currentEpoch,
      slotInEpoch: clock && currentSlot != null ? currentSlot % clock.slotsPerEpoch : null,
      missedSinceGenesis: fromGenesis ? fromGenesis.slot! - fromGenesis.height : null,
      fillSinceGenesis: fromGenesis && fromGenesis.slot! > 0 ? fromGenesis.height / fromGenesis.slot! : null,
      avgSinceGenesisMs: fromGenesis && slotMs ? (fromGenesis.slot! * slotMs) / fromGenesis.height : null,
      avg100Ms: slotMs ? spanBlockTimeMs(anchors.get(a100) ?? null, headBlock, slotMs) : null,
      avg1000Ms: slotMs ? spanBlockTimeMs(anchors.get(a1000) ?? null, headBlock, slotMs) : null,
      intervals,
      p50Ms: quantile(sorted, 0.5),
      p95Ms: quantile(sorted, 0.95),
      recentMissed: intervals.reduce((s, i) => s + i.slots - 1, 0),
      finalizedEpoch,
      finalityLagEpochs: currentEpoch != null && finalizedEpoch != null ? Math.max(0, currentEpoch - finalizedEpoch) : null,
    }
  }, [clock, now, headers, headBlock, head, anchors, a100, a1000, finalizedEpoch])
}

/** Run an async loader when deps change, exposing loading/error state and a reload handle. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loader()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, reload, setData }
}

/** Poll a loader every `intervalMs` (and when deps change); keeps the last good result. */
export function usePolled<T>(loader: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    const run = () =>
      loader()
        .then((r) => !cancelled && (setData(r), setError(null)))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => !cancelled && setLoaded(true))
    run()
    const id = setInterval(run, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])
  return { data, error, loading: !loaded }
}
