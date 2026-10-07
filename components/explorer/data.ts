'use client'

import { useEffect, useState } from 'react'
import { getTokens, getUsdPrices, type NativeToken, type UsdPrice } from '@/lib/qrdx/indexed'
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
