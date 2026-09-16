'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getBlockRange, getChainStatus, type ExplorerBlock } from '@/lib/qrdx'
import { useChain } from './ChainProvider'

/**
 * The newest `count` blocks, kept current from the realtime feed. New heights
 * are fetched in coalesced batches so a burst of block events costs one request.
 */
export function useLiveBlocks(count: number, options: { paused?: boolean } = {}) {
  const { subscribeBlocks } = useChain()
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tipRef = useRef(-1)
  const pendingRef = useRef(-1)
  const inflightRef = useRef(false)

  const merge = useCallback(
    (incoming: ExplorerBlock[]) => {
      setBlocks((prev) => {
        const byHeight = new Map(prev.map((b) => [b.height, b]))
        for (const block of incoming) byHeight.set(block.height, block)
        return Array.from(byHeight.values())
          .sort((a, b) => b.height - a.height)
          .slice(0, count)
      })
    },
    [count],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await getChainStatus()
      tipRef.current = status.height
      merge(await getBlockRange(status.height - count + 1, status.height))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blocks')
    } finally {
      setLoading(false)
    }
  }, [count, merge])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (options.paused) return
    const flush = async () => {
      if (inflightRef.current || pendingRef.current <= tipRef.current || tipRef.current < 0) return
      inflightRef.current = true
      const target = pendingRef.current
      try {
        const from = Math.max(tipRef.current + 1, target - count + 1)
        const fresh = await getBlockRange(from, target)
        tipRef.current = Math.max(tipRef.current, target)
        merge(fresh)
        setError(null)
      } catch {
        // transient; the next event retries
      } finally {
        inflightRef.current = false
        if (pendingRef.current > tipRef.current) setTimeout(flush, 500)
      }
    }
    return subscribeBlocks((event) => {
      pendingRef.current = Math.max(pendingRef.current, event.height)
      void flush()
    })
  }, [subscribeBlocks, merge, count, options.paused])

  return { blocks, loading, error, reload: load }
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
