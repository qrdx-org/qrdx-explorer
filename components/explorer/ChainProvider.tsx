'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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

interface ChainContextValue {
  network: NetworkConfig
  /** Latest known chain height (-1 until first observed). */
  height: number
  finalizedEpoch: number | null
  stream: StreamStatus
  /** Subscribe to per-block events; returns an unsubscribe function. */
  subscribeBlocks: (listener: (event: BlockEvent) => void) => () => void
}

const INITIAL_STREAM: StreamStatus = { state: 'connecting', transport: null, nodeVersion: null, lastEventAt: null, error: null }

const ChainContext = createContext<ChainContextValue | null>(null)

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<NetworkConfig>(() => getDefaultNetwork())
  const [height, setHeight] = useState(-1)
  const [finalizedEpoch, setFinalizedEpoch] = useState<number | null>(null)
  const [stream, setStream] = useState<StreamStatus>(INITIAL_STREAM)
  // Owned by the provider (not the stream) because child effects subscribe before this effect runs.
  const listenersRef = useRef(new Set<(event: BlockEvent) => void>())

  useEffect(() => {
    // localStorage is only readable after mount.
    const active = getActiveNetwork()
    setNetwork(active)

    const chainStream = new ChainStream(active.nodeApiUrl)
    const offStatus = chainStream.onStatus(setStream)
    const offBlock = chainStream.onBlock((event) => {
      noteChainTip(event.height)
      setHeight((prev) => Math.max(prev, event.height))
      if (event.finalizedEpoch != null && event.finalizedEpoch >= 0) setFinalizedEpoch(event.finalizedEpoch)
      for (const listener of listenersRef.current) listener(event)
    })
    chainStream.start()

    getChainStatus()
      .then((status) => setHeight((prev) => Math.max(prev, status.height)))
      .catch(() => undefined)

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
    }, 15_000)

    return () => {
      offStatus()
      offBlock()
      chainStream.stop()
      clearInterval(finalityTimer)
    }
  }, [])

  const subscribeBlocks = useCallback((listener: (event: BlockEvent) => void) => {
    const listeners = listenersRef.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const value = useMemo(
    () => ({ network, height, finalizedEpoch, stream, subscribeBlocks }),
    [network, height, finalizedEpoch, stream, subscribeBlocks],
  )

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext)
  if (!ctx) throw new Error('useChain must be used inside <ChainProvider>')
  return ctx
}

/**
 * Re-render on a fixed interval so relative timestamps ("12s ago") stay fresh.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
