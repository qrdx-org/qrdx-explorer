/**
 * USD prices for the explorer: trade.qrdx.org's /prices for the active network
 * (index prices from public exchanges, or routed through the network's pools).
 * Reference data only; null when nothing prices the asset.
 */

import { getUsdPrices } from './qrdx/indexed'

export interface TokenPrice {
  token: string
  price_usd: number
  change_24h?: number
  last_updated: number
}

/** "QRDX" (native) or a token address. */
export async function getTokenPrice(token: string): Promise<TokenPrice | null> {
  const prices = await getUsdPrices([token])
  const p = prices[token.toUpperCase() === 'QRDX' ? 'QRDX' : token.toLowerCase()]
  if (!p) return null
  return {
    token,
    price_usd: Number(p.price),
    change_24h: p.change24h === null ? undefined : Number(p.change24h),
    last_updated: Date.now(),
  }
}
