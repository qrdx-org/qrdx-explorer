/**
 * The chain as it happens, at four blocks a second.
 *
 * The node's stream announces every block (height, hash, the node's time). That is all a
 * list of the latest blocks needs to keep up. Headers (proposer, slot, epoch,
 * attestations) cost a `/get_block` each, which the node allows 8 times a second per IP:
 * this store fetches them only for heights a view has asked for, newest first, at most
 * RATE a second, and not while the tab is hidden. Views subscribe and re-render at most
 * every NOTIFY_MS, never once per block.
 */

import { getBlockHeader, type ExplorerBlock } from './api'
import type { BlockEvent, ReorgEvent } from './stream'

export interface LiveBlock {
  height: number
  hash: string | null
  /** Node wall-clock seconds when the stream announced it (null: known only from a fetch). */
  observedAt: number | null
  /** The fetched header, once it has been read. */
  block: ExplorerBlock | null
}

/** Heights kept: five minutes of 250 ms blocks. Heights a view still wants are kept regardless. */
const KEEP = 1200
/** Header fetches a second at most: the client paces /get_block at 6 a second (the node allows 8). */
const RATE = 5.5
/**
 * At least this many a second. The node's limit is per client IP, and a node behind a proxy
 * that does not pass the visitor's IP on counts every visitor as one: the pump halves its
 * rate on each refused or failed read and climbs back while reads succeed.
 */
const MIN_RATE = 0.5
const RECOVER_PER_SEC = 0.5
const BURST = 4
const CONCURRENCY = 4
const NOTIFY_MS = 120
const RETRY_MS = 5000

export class LiveChain {
  private readonly announced = new Map<number, { hash: string | null; observedAt: number }>()
  private readonly details = new Map<number, ExplorerBlock>()
  private readonly wants = new Map<symbol, { heights: number[]; priority: number }>()
  private readonly inflight = new Set<number>()
  private readonly failedAt = new Map<number, number>()
  private readonly listeners = new Set<() => void>()
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  private pumpTimer: ReturnType<typeof setInterval> | null = null
  private tokens = BURST
  private refilledAt = Date.now()
  private rate = RATE
  private backedOffAt = 0
  private epoch = 0

  /** Highest height announced or reported. */
  head = -1
  /** Bumped on every change; the snapshot views subscribe to. */
  version = 0

  start() {
    if (this.pumpTimer) return
    this.pumpTimer = setInterval(() => this.pump(), 100)
  }

  stop() {
    if (this.pumpTimer) clearInterval(this.pumpTimer)
    this.pumpTimer = null
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    this.notifyTimer = null
    this.epoch++
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = () => this.version

  private changed() {
    this.version++
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      for (const listener of this.listeners) listener()
    }, NOTIFY_MS)
  }

  ingest(event: BlockEvent) {
    const prev = this.announced.get(event.height)
    this.announced.set(event.height, { hash: event.hash ?? prev?.hash ?? null, observedAt: event.observedAt })
    // A different hash at a height already read: that header belonged to another branch.
    const detail = this.details.get(event.height)
    if (detail && event.hash && detail.hash !== event.hash) this.details.delete(event.height)
    this.setHead(event.height)
  }

  reorg(event: ReorgEvent) {
    for (const h of [...this.announced.keys()]) if (h > event.ancestor) this.announced.delete(h)
    for (const h of [...this.details.keys()]) if (h > event.ancestor) this.details.delete(h)
    this.head = Math.min(this.head, event.ancestor)
    this.changed()
  }

  setHead(height: number) {
    if (height > this.head) this.head = height
    this.evict()
    this.changed()
  }

  /**
   * Ask for these heights' headers; replaces what `owner` asked for before. Higher
   * `priority` is read first (a page of history the reader is looking at), then newest first.
   */
  want(owner: symbol, heights: number[], priority = 0) {
    this.wants.set(owner, { heights, priority })
  }

  release(owner: symbol) {
    this.wants.delete(owner)
  }

  /** A header read elsewhere (a block page, history paging) joins the store. */
  remember(block: ExplorerBlock) {
    this.details.set(block.height, block)
    this.changed()
  }

  get(height: number): LiveBlock {
    const a = this.announced.get(height)
    const block = this.details.get(height) ?? null
    return { height, hash: block?.hash ?? a?.hash ?? null, observedAt: a?.observedAt ?? null, block }
  }

  detail(height: number): ExplorerBlock | null {
    return this.details.get(height) ?? null
  }

  /** The newest `count` heights, newest first. */
  latest(count: number): LiveBlock[] {
    const out: LiveBlock[] = []
    for (let h = this.head; h >= 0 && out.length < count; h--) out.push(this.get(h))
    return out
  }

  /** Every header held, ascending by height. */
  headers(): ExplorerBlock[] {
    return [...this.details.values()].sort((a, b) => a.height - b.height)
  }

  /** The newest height whose header is held. */
  latestDetailed(): ExplorerBlock | null {
    let best: ExplorerBlock | null = null
    for (const b of this.details.values()) if (!best || b.height > best.height) best = b
    return best
  }

  /** Every wanted height with the highest priority it was asked at. */
  private wanted(): Map<number, number> {
    const all = new Map<number, number>()
    for (const { heights, priority } of this.wants.values()) for (const h of heights) all.set(h, Math.max(priority, all.get(h) ?? -Infinity))
    return all
  }

  private evict() {
    const floor = this.head - KEEP
    if (floor <= 0) return
    const keep = this.wanted()
    for (const h of this.announced.keys()) if (h < floor && !keep.has(h)) this.announced.delete(h)
    for (const h of this.details.keys()) if (h < floor && !keep.has(h)) this.details.delete(h)
  }

  private pump() {
    const now = Date.now()
    const elapsed = (now - this.refilledAt) / 1000
    // Climb back towards the full rate a second after the last refusal.
    if (now - this.backedOffAt > 1000) this.rate = Math.min(RATE, this.rate + elapsed * RECOVER_PER_SEC)
    this.tokens = Math.min(BURST, this.tokens + elapsed * this.rate)
    this.refilledAt = now
    if (typeof document !== 'undefined' && document.hidden) return
    if (this.tokens < 1 || this.inflight.size >= CONCURRENCY) return
    const due = [...this.wanted()]
      .filter(([h]) => h >= 0 && h <= this.head && !this.details.has(h) && !this.inflight.has(h) && now - (this.failedAt.get(h) ?? 0) > RETRY_MS)
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    for (const [h] of due) {
      if (this.tokens < 1 || this.inflight.size >= CONCURRENCY) break
      this.tokens -= 1
      this.fetch(h)
    }
  }

  /** A read was refused (429) or failed: halve the rate, at most once a second. */
  private backOff() {
    const now = Date.now()
    if (now - this.backedOffAt < 1000) return
    this.backedOffAt = now
    this.rate = Math.max(MIN_RATE, this.rate / 2)
    this.tokens = Math.min(this.tokens, 0)
  }

  /** Header reads a second the store is allowed now (for the network page). */
  get readRate(): number {
    return this.rate
  }

  private fetch(height: number) {
    const epoch = this.epoch
    this.inflight.add(height)
    getBlockHeader(height)
      .then((block) => {
        if (epoch !== this.epoch) return
        if (!block) {
          this.failedAt.set(height, Date.now())
          return
        }
        const announced = this.announced.get(height)
        // Read after a reorg replaced the announced block: keep the announcement, read again.
        if (announced?.hash && announced.hash !== block.hash) {
          this.failedAt.set(height, Date.now() - RETRY_MS + 500)
          return
        }
        this.failedAt.delete(height)
        this.details.set(height, block)
        this.changed()
      })
      .catch(() => {
        if (epoch !== this.epoch) return
        this.failedAt.set(height, Date.now())
        this.backOff()
      })
      .finally(() => this.inflight.delete(height))
  }
}

// ─── Derived measures ───────────────────────────────────────────────────────────

export interface SlotInterval {
  height: number
  /** Slots from the parent block's slot to this block's (1: no slot missed). */
  slots: number
  /** The block time: slots × slot length. */
  ms: number
  block: ExplorerBlock
}

/** Block times between consecutive headers held (heights h−1 and h both read, both with a slot). */
export function slotIntervals(headers: ExplorerBlock[], slotMs: number): SlotInterval[] {
  const byHeight = new Map(headers.map((b) => [b.height, b]))
  const out: SlotInterval[] = []
  for (const b of headers) {
    const parent = byHeight.get(b.height - 1)
    if (!parent || b.slot == null || parent.slot == null) continue
    const slots = b.slot - parent.slot
    if (slots <= 0) continue
    out.push({ height: b.height, slots, ms: slots * slotMs, block: b })
  }
  return out.sort((a, b) => a.height - b.height)
}

/** Mean block time over a span of headers: (slot difference × slot length) ÷ height difference. */
export function spanBlockTimeMs(from: ExplorerBlock | null, to: ExplorerBlock | null, slotMs: number): number | null {
  if (!from || !to || from.slot == null || to.slot == null || to.height <= from.height) return null
  return ((to.slot - from.slot) * slotMs) / (to.height - from.height)
}

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[i]
}
