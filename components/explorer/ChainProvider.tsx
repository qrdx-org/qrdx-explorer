'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ChainStream,
  getActiveNetwork,
  getDefaultNetwork,
  getChainStatus,
  getNodeMetrics,
  noteChainTip,
  type BlockEvent,
  type NetworkConfig,
  type StreamStatus,
} from '@/lib/qrdx'
import { getChainSpec, getGenesisTimeMs, type ChainSpec, type SlotClock } from '@/lib/qrdx/consensus'
import { LiveChain } from '@/lib/qrdx/live'

interface ChainContextValue {
  network: NetworkConfig
  finalizedEpoch: number | null
  stream: StreamStatus
  /** Subscribe to per-block events (four a second at 250 ms slots); returns an unsubscribe function. */
  subscribeBlocks: (listener: (event: BlockEvent) => void) => () => void
  /** Announced blocks and the headers views asked for. Read through useHead / useLive. */
  live: LiveChain
  /** The node's chain spec (null until read, or on a node that predates it). */
  spec: ChainSpec | null
  /** Genesis time and slot parameters (null until both the spec and genesis block are read). */
  clock: SlotClock | null
  /** Local clock minus the node's, ms (0 until the stream has timed a frame). */
  clockOffsetMs: number
}

const INITIAL_STREAM: StreamStatus = { state: 'connecting', transport: null, nodeVersion: null, lastEventAt: null, error: null }

const ChainContext = createContext<ChainContextValue | null>(null)

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<NetworkConfig>(() => getDefaultNetwork())
  const [finalizedEpoch, setFinalizedEpoch] = useState<number | null>(null)
  const [stream, setStream] = useState<StreamStatus>(INITIAL_STREAM)
  const [spec, setSpec] = useState<ChainSpec | null>(null)
  const [genesisMs, setGenesisMs] = useState<number | null>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [live] = useState(() => new LiveChain())
  // Owned by the provider (not the stream) because child effects subscribe before this effect runs.
  const listenersRef = useRef(new Set<(event: BlockEvent) => void>())

  useEffect(() => {
    // localStorage is only readable after mount.
    const active = getActiveNetwork()
    setNetwork(active)
    live.start()

    const chainStream = new ChainStream(active.nodeApiUrl)
    const offStatus = chainStream.onStatus(setStream)
    const offReorg = chainStream.onReorg((event) => live.reorg(event))
    const offBlock = chainStream.onBlock((event) => {
      noteChainTip(event.height)
      live.ingest(event)
      if (event.finalizedEpoch != null && event.finalizedEpoch >= 0) {
        const fin = event.finalizedEpoch
        setFinalizedEpoch((prev) => (prev === fin ? prev : fin))
      }
      for (const listener of listenersRef.current) listener(event)
    })
    chainStream.start()

    getChainStatus()
      .then((status) => live.setHead(status.height))
      .catch(() => undefined)
    getChainSpec(active.nodeApiUrl).then(setSpec)
    getGenesisTimeMs().then(setGenesisMs)

    // Stream frames carry finality, but only once a block arrives and never in polling
    // mode — seed and refresh it from the Prometheus exporter.
    const refreshFinality = () => {
      getNodeMetrics()
        .then((m) => {
          if (m.finalizedEpoch != null && m.finalizedEpoch >= 0) {
            setFinalizedEpoch((prev) => Math.max(prev ?? -1, m.finalizedEpoch!))
          }
        })
        .catch(() => undefined)
    }
    refreshFinality()
    const finalityTimer = setInterval(() => {
      if (chainStream.currentStatus.state !== 'live') refreshFinality()
    }, 8_000)
    // The skew estimate only shrinks; settle it into state now and then, not per frame.
    const skewTimer = setInterval(() => {
      const skew = chainStream.clockOffsetMs
      if (skew != null) setClockOffsetMs((prev) => (Math.abs(prev - skew) < 5 ? prev : skew))
    }, 2_000)

    return () => {
      offStatus()
      offBlock()
      offReorg()
      chainStream.stop()
      live.stop()
      clearInterval(finalityTimer)
      clearInterval(skewTimer)
    }
  }, [live])

  const subscribeBlocks = useCallback((listener: (event: BlockEvent) => void) => {
    const listeners = listenersRef.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const clock = useMemo<SlotClock | null>(() => {
    if (!spec || genesisMs == null) return null
    return { genesisMs, slotMs: Number(spec.params.SLOT_DURATION_MS), slotsPerEpoch: Number(spec.params.SLOTS_PER_EPOCH) }
  }, [spec, genesisMs])

  const value = useMemo(
    () => ({ network, finalizedEpoch, stream, subscribeBlocks, live, spec, clock, clockOffsetMs }),
    [network, finalizedEpoch, stream, subscribeBlocks, live, spec, clock, clockOffsetMs],
  )

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext)
  if (!ctx) throw new Error('useChain must be used inside <ChainProvider>')
  return ctx
}

/**
 * The chain head (-1 until known). Re-renders as blocks arrive, at most every 120 ms;
 * pass `throttleMs` where the exact head does not matter (confirmations, paging).
 */
export function useHead(throttleMs = 0): number {
  const { live } = useChain()
  const exact = useSyncExternalStore(live.subscribe, () => live.head, () => -1)
  const [sampled, setSampled] = useState(exact)
  useEffect(() => {
    if (!throttleMs) return
    setSampled(live.head)
    const id = setInterval(() => setSampled(live.head), throttleMs)
    return () => clearInterval(id)
  }, [live, throttleMs])
  return throttleMs ? (sampled < 0 ? exact : sampled) : exact
}

/** Derive something from the live store; recomputed when the store changes (at most every 120 ms). */
export function useLive<T>(select: (live: LiveChain) => T, deps: unknown[] = []): T {
  const { live } = useChain()
  const version = useSyncExternalStore(live.subscribe, live.getVersion, () => 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select(live), [live, version, ...deps])
}

// One timer per interval, shared by every clock on the page (a block list has dozens).
const tickers = new Map<number, { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null }>()

function ticker(intervalMs: number) {
  let t = tickers.get(intervalMs)
  if (!t) {
    t = { now: Date.now(), listeners: new Set(), timer: null }
    tickers.set(intervalMs, t)
  }
  return t
}

/** Re-render on a fixed interval so relative timestamps ("12s ago", "0.8s ago") stay fresh. */
export function useNow(intervalMs = 1000): number {
  const t = ticker(intervalMs)
  const subscribe = useCallback(
    (listener: () => void) => {
      t.listeners.add(listener)
      if (!t.timer) {
        t.now = Date.now()
        t.timer = setInterval(() => {
          t.now = Date.now()
          for (const l of t.listeners) l()
        }, intervalMs)
      }
      return () => {
        t.listeners.delete(listener)
        if (!t.listeners.size && t.timer) {
          clearInterval(t.timer)
          t.timer = null
        }
      }
    },
    [t, intervalMs],
  )
  return useSyncExternalStore(subscribe, () => t.now, () => 0)
}

/** The node's clock now, ms (local clock corrected by the stream's skew estimate). */
export function useNodeNow(intervalMs = 250): number {
  const { clockOffsetMs } = useChain()
  return useNow(intervalMs) - clockOffsetMs
}
