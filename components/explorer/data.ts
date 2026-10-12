'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { getLatestTransactions, getTokens, getUsdPrices, type IndexedTx, type NativeToken, type UsdPrice } from '@/lib/qrdx/indexed'
import { getActiveNetwork } from '@/lib/qrdx'

let tokenList: { node: string; at: number; list: Promise<NativeToken[]> } | null = null

/** Every native token, by lower-case address (cached a minute per node). */
export function useTokenMap(): Map<string, NativeToken> {
  const [map, setMap] = useState<Map<string, NativeToken>>(new Map())
  useEffect(() => {
    const node = getActiveNetwork().nodeApiUrl
    if (!tokenList || tokenList.node !== node || Date.now() - tokenList.at > 60_000) {
      tokenList = { node, at: Date.now(), list: getTokens().catch(() => [] as NativeToken[]) }
    }
    let live = true
    tokenList.list.then((l) => live && setMap(new Map(l.map((t) => [t.token_address.toLowerCase(), t]))))
    return () => {
      live = false
    }
  }, [])
  return map
}

/** USD prices for assets ("QRDX" or token addresses), refreshed every minute. */
export function useUsdPrices(assets: string[]): Record<string, UsdPrice | null> {
  const key = [...new Set(assets)].sort().join(',')
  const [prices, setPrices] = useState<Record<string, UsdPrice | null>>({})
  useEffect(() => {
    if (!key) return
    let live = true
    const load = () => getUsdPrices(key.split(',')).then((p) => live && setPrices(p))
    void load()
    const t = setInterval(load, 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [key])
  return prices
}

export const usdOf = (prices: Record<string, UsdPrice | null>, asset: string) =>
  prices[asset.toUpperCase() === 'QRDX' ? 'QRDX' : asset.toLowerCase()] ?? null

// ─── The index's newest transactions, shared ────────────────────────────────────

export interface RecentIndex {
  txs: IndexedTx[]
  /** The highest block the index has processed: heights at or below it with no entry hold no transactions. */
  indexedHeight: number
  /** Transactions per block height, for the heights covered by `txs`. */
  perBlock: Map<number, IndexedTx[]>
}

const RECENT_POLL_MS = 2000
const recent = {
  value: null as RecentIndex | null,
  listeners: new Set<() => void>(),
  timer: null as ReturnType<typeof setInterval> | null,
}

function loadRecent() {
  getLatestTransactions({ limit: 200 })
    .then((page) => {
      const perBlock = new Map<number, IndexedTx[]>()
      for (const t of page.transactions) {
        const list = perBlock.get(t.block_height) ?? []
        list.push(t)
        perBlock.set(t.block_height, list)
      }
      recent.value = { txs: page.transactions, indexedHeight: page.indexed_height, perBlock }
      for (const l of recent.listeners) l()
    })
    .catch(() => undefined)
}

function subscribeRecent(listener: () => void) {
  recent.listeners.add(listener)
  if (!recent.timer) {
    loadRecent()
    recent.timer = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) loadRecent()
    }, RECENT_POLL_MS)
  }
  return () => {
    recent.listeners.delete(listener)
    if (!recent.listeners.size && recent.timer) {
      clearInterval(recent.timer)
      recent.timer = null
    }
  }
}

/**
 * The newest 200 indexed transactions, polled every two seconds and shared by every view
 * on the page. Per-block transaction counts come from here: a block header from
 * /get_block lists native transactions only.
 */
export function useRecentIndex(): RecentIndex | null {
  return useSyncExternalStore(subscribeRecent, () => recent.value, () => null)
}

/**
 * Transactions in a block according to the index: a number when the index covers the
 * height (0 if it lists none there), null when it has not reached it or the height is
 * older than the transactions it returned.
 */
export function indexedCount(index: RecentIndex | null, height: number): number | null {
  if (!index || height > index.indexedHeight) return null
  const oldest = index.txs.length ? index.txs[index.txs.length - 1].block_height : -1
  // A full page stops somewhere, maybe part way through its oldest block: from there down it says nothing.
  if (index.txs.length >= 200 && height <= oldest) return null
  return index.perBlock.get(height)?.length ?? 0
}
