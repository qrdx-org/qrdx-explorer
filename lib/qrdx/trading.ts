/**
 * Reads of the 2026-10 node's trading features (qrdx-node docs/TRADING_FEATURES.md,
 * HYPERLIQUID_PARITY.md): the leaderboard, user vaults, deployer markets and the unique-ticker
 * auction. Each answers null on a node that predates them.
 */

import { rpcCallOptional } from './client'

export interface LeaderRow {
  account: string
  pnl: number
  volume: number
  trades: number
}

export const getLeaderboard = (window: 'day' | 'week' | 'month' | 'all', metric: 'pnl' | 'volume', limit = 100) =>
  rpcCallOptional<LeaderRow[]>('history_getLeaderboard', [window, metric, limit])

export interface UserVault {
  vault: string
  leader: string
  name: string
  profit_share: string
  created: string
  /** A market's liquidity vault: quoted on its book by the protocol. */
  managed: string | null
  nav: string
  total_shares: string
  share_value: string | null
  holders: number
  positions: Record<string, { size: string; entry_price: string }>
}

export const getUserVaults = () => rpcCallOptional<UserVault[]>('perp_getUserVaults', [])

export interface PerpMarketRow {
  market_id: string
  base: string
  quote: string
  oracle_price: string | null
  oracle_time: string | null
  mark_price: string | null
  open_interest: string | null
  max_leverage: string | null
  deployer?: string | null
  deployer_fee_share?: string | null
  liquidity_vault?: string | null
  sz_decimals?: number | null
  [k: string]: unknown
}

export const getPerpMarkets = () => rpcCallOptional<PerpMarketRow[]>('perp_getMarkets', [])

export interface Deployer {
  address: string
  dex: string
  bond: string
  unbonding: string
  unlock: string | null
  markets: string[]
}

export const getDeployer = (who: string) => rpcCallOptional<Deployer>('perp_getDeployer', [who])

export interface TickerAuction {
  price: string
  floor: string
  opening_price: string
  auction_seconds: number
  last_sale: { price: string; time: string } | null
  tickers: number
  reserved: string[]
}

export const getTickerAuction = () => rpcCallOptional<TickerAuction>('exchange_getTickerAuction', [])
