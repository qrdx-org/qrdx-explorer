/**
 * The node's newer read surfaces (qrdx-node docs/PERPS_API.md §7–§9, NATIVE_TOKENS.md §4):
 * the transaction index (every account's history), native tokens, spot pools,
 * market data (tickers, candles, trades) and accounts on the exchange. Plus USD
 * prices from trade.qrdx.org's API for the active network.
 *
 * These replace scanning blocks one by one: the index answers "what did this
 * address do" in one paginated request.
 */

import { getActiveNetwork, nodeRequest } from './client'
import { isAccountAddress } from './accounts'

// ─── transaction index (PERPS_API.md §9) ───────────────────────────────────────

export type IndexedKind = 'genesis' | 'transfer' | 'coinbase' | 'exchange' | 'evm'

export interface IndexedTx {
  block_height: number
  position: number
  tx_hash: string
  block_hash: string | null
  timestamp: number
  kind: IndexedKind | string
  /** Exchange op name (SWAP, PERP_ORDER, TOKEN_TRANSFER, ORACLE_VOTE, …) or the EVM call kind. */
  op: string | null
  sender: string | null
  target: string | null
  asset: string | null
  amount: string | null
  status: 'success' | 'failed' | 'unknown'
  fee: string | null
  error: string | null
  detail: Record<string, unknown> | null
  /** In an address's history: what the address was to it (sender, to, maker, …). */
  roles?: string[]
  cursor: string
}

export interface IndexedPage {
  transactions: IndexedTx[]
  next_cursor: string | null
  indexed_height: number
}

export interface HistoryQuery {
  limit?: number
  cursor?: string | null
  /** Comma-separated kinds, e.g. "exchange,evm". */
  kinds?: string | null
}

/**
 * The node's index fills a row's target, asset and amount for the common operations only
 * (qrdx-node qrdx/tx_index.py _exchange_summary). For the ones that act on a sub-account, a
 * user vault or an agent, they are still in the signed params: read them from there.
 */
export function withParamSummary(t: IndexedTx): IndexedTx {
  if (t.kind !== 'exchange' || (t.target && t.amount)) return t
  const p = ((t.detail?.params ?? {}) as Record<string, unknown>) || {}
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null)
  switch (t.op) {
    case 'SUBACCOUNT_TRANSFER':
      return { ...t, target: t.target ?? s(p.subaccount), asset: t.asset ?? s(p.asset), amount: t.amount ?? s(p.amount) }
    case 'VAULT_DEPOSIT':
    case 'VAULT_WITHDRAW':
      return { ...t, target: t.target ?? s(p.vault), amount: t.amount ?? s(p.amount ?? p.shares) }
    case 'VAULT_CREATE':
      return { ...t, amount: t.amount ?? s(p.amount) }
    case 'AGENT_APPROVE':
    case 'AGENT_REVOKE':
      return { ...t, target: t.target ?? s(p.agent) }
    default:
      return t
  }
}

const summarized = <P extends IndexedPage>(page: P): P => ({ ...page, transactions: page.transactions.map(withParamSummary) })

export function getLatestTransactions(q: HistoryQuery = {}): Promise<IndexedPage> {
  return nodeRequest<IndexedPage>('get_latest_transactions', { query: { limit: q.limit ?? 50, cursor: q.cursor, kinds: q.kinds } }).then(summarized)
}

/**
 * One block's transactions from the index: the page that starts just above the block
 * (cursor "height+1:0" returns rows at or below `height`), kept to that block. `complete`
 * is false when the block alone filled the page.
 */
export async function getBlockTransactions(height: number, limit = 200): Promise<{ transactions: IndexedTx[]; indexedHeight: number; complete: boolean }> {
  const page = await getLatestTransactions({ cursor: `${height + 1}:0`, limit })
  const transactions = page.transactions.filter((t) => t.block_height === height).sort((a, b) => a.position - b.position)
  return { transactions, indexedHeight: page.indexed_height, complete: transactions.length < limit }
}

export function getAddressHistory(address: string, q: HistoryQuery = {}): Promise<IndexedPage & { address: string; account: string }> {
  return nodeRequest<IndexedPage & { address: string; account: string }>('get_address_history', {
    query: { address, limit: q.limit ?? 50, cursor: q.cursor, kinds: q.kinds },
  }).then(summarized)
}

/**
 * A sub-account's transfers with its master. The node's index files SUBACCOUNT_TRANSFER under
 * the master only (it does not treat `subaccount` as a party), so they are read from the
 * master's history: its exchange operations, newest first, up to `pages` pages of 500.
 */
export async function getSubaccountTransfers(master: string, subaccount: string, pages = 4): Promise<IndexedTx[]> {
  const sub = subaccount.toLowerCase()
  const out: IndexedTx[] = []
  let cursor: string | null = null
  for (let i = 0; i < pages; i++) {
    const page: IndexedPage = await getAddressHistory(master, { limit: 500, cursor, kinds: 'exchange' })
    for (const t of page.transactions) {
      const p = (t.detail?.params ?? {}) as Record<string, unknown>
      // Its role as the sub-account sees it: funds in (to_sub) or out (from_sub).
      if (t.op === 'SUBACCOUNT_TRANSFER' && String(p.subaccount ?? '').toLowerCase() === sub)
        out.push({ ...t, roles: [p.direction === 'from_sub' ? 'sender' : 'to'] })
    }
    if (!page.next_cursor) break
    cursor = page.next_cursor
  }
  return out
}

/** Params naming an account the node's index does not file the operation under. */
const PARTY_PARAMS = ['subaccount', 'vault', 'agent', 'leader', 'controller', 'new_controller', 'guardian']

export interface IndexedTxDetail extends IndexedTx {
  /** Every account the transaction touched, with its roles. */
  accounts?: { address: string; roles: string[] }[]
}

export async function getIndexedTransaction(hash: string): Promise<IndexedTxDetail | null> {
  try {
    const r = await nodeRequest<IndexedTx & { accounts?: Record<string, string[]> | { address: string; roles: string[] }[] }>('get_indexed_transaction', {
      query: { tx_hash: hash.replace(/^0x/, '') },
    })
    if (!r) return null
    // The node maps address → roles.
    const accounts = Array.isArray(r.accounts) ? r.accounts : Object.entries(r.accounts ?? {}).map(([address, roles]) => ({ address, roles }))
    // Its index does not count the sub-account, vault or agent an operation names as a party
    // (qrdx-node tx_index.py ACCOUNT_PARAMS): add them from the params.
    const params = (r.detail?.params ?? {}) as Record<string, unknown>
    for (const key of PARTY_PARAMS) {
      const v = params[key]
      if (isAccountAddress(v) && !accounts.some((x) => x.address.toLowerCase() === v.toLowerCase())) accounts.push({ address: v, roles: [key] })
    }
    return { ...withParamSummary(r), accounts }
  } catch {
    return null
  }
}

/** Validator oracle votes are most of a quiet chain's transactions; lists hide them unless asked. */
export const isOracleVote = (t: IndexedTx) => t.op === 'ORACLE_VOTE'

// ─── native tokens (NATIVE_TOKENS.md) ──────────────────────────────────────────

export interface NativeToken {
  token_address: string
  name: string
  symbol: string
  decimals: number
  total_supply: string
  max_supply: string | null
  mint_authority: string | null
  freeze_authority: string | null
  creator: string
  created_height: number
  extensions?: Record<string, unknown>
  frozen_accounts?: number
  /** The ticker this token holds through a TICKER_CLAIM, if any (node 3.0.0+). */
  ticker?: string | null
  /** What its issuer can still do to holders, as the node states it (node 3.0.0+). */
  issuer_powers?: IssuerPower[]
}

export interface IssuerPower {
  power: string
  by: string | string[]
  what: string
}

export function getTokens(): Promise<NativeToken[]> {
  return nodeRequest<NativeToken[]>('get_tokens')
}

/** The token at an address, or null when the address is not a token. */
export async function getToken(address: string): Promise<NativeToken | null> {
  try {
    return await nodeRequest<NativeToken>('get_token', { query: { token_address: address.toLowerCase() } })
  } catch {
    return null
  }
}

export async function getTokenBalance(token: string, address: string): Promise<string> {
  const r = await nodeRequest<string | { balance: string }>('get_token_balance', { query: { token_address: token, address } })
  return typeof r === 'string' ? r : r.balance
}

// ─── market data (PERPS_API.md §8) ─────────────────────────────────────────────

export interface Ticker {
  market: string
  type: 'spot' | 'perp'
  base: string
  quote: string
  best_bid: string | null
  best_ask: string | null
  last_price: string | null
  open_24h: string | null
  high_24h: string | null
  low_24h: string | null
  change_pct_24h: string | null
  volume_24h: string
  quote_volume_24h: string
  trades_24h: number
  amm_price?: string | null
  pools?: number
  base_info?: { symbol: string | null; name: string | null; decimals: number | null }
  quote_info?: { symbol: string | null; name: string | null; decimals: number | null }
  mark_price?: string | null
  oracle_price?: string | null
  open_interest?: string | null
  funding_rate?: string | null
}

export function getMarkets(kind?: 'spot' | 'perp'): Promise<Ticker[]> {
  return nodeRequest<Ticker[]>('get_markets', { query: { kind } })
}

export interface MarketCandle {
  time: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  quote_volume: string
  trades: number
}

export async function getCandles(market: string, interval: string, limit = 300): Promise<MarketCandle[]> {
  const r = await nodeRequest<{ candles: MarketCandle[] }>('get_candles', { query: { market, interval, limit } })
  return r?.candles ?? []
}

export interface MarketTrade {
  seq: number
  market: string
  price: string
  amount: string
  quote_amount: string
  side: 'buy' | 'sell'
  venue: 'clob' | 'amm' | 'perp' | string
  block_height: number
  block_time: number
  tx_hash: string | null
  maker: string | null
  taker: string | null
  pool_id: string | null
}

export async function getTrades(market: string, limit = 100): Promise<MarketTrade[]> {
  const r = await nodeRequest<{ trades: MarketTrade[] }>('get_trades', { query: { market, limit } })
  return (r?.trades ?? []).slice().reverse()
}

// ─── spot pools and exchange accounts (PERPS_API.md §2, §7) ────────────────────

export interface SpotPool {
  pool_id: string
  token0: string
  token1: string
  fee_tier: number
  fee_rate: string
  price: string
  liquidity: string
  positions: number
  volume: [string, string]
  paused: boolean
  creator: string
  holder_address: string
}

export function getPools(tokenA?: string, tokenB?: string): Promise<SpotPool[]> {
  return nodeRequest<SpotPool[]>('get_pools', { query: { token_a: tokenA, token_b: tokenB } })
}

export interface LpPosition {
  position_id: string
  pool_id: string
  token0: string
  token1: string
  liquidity: string
  in_range: boolean
  amount0: string
  amount1: string
  fees0: string
  fees1: string
}

export const getLpPositions = (address: string) => nodeRequest<LpPosition[]>('get_lp_positions', { query: { address } }).catch(() => [] as LpPosition[])

export interface SpotOrder {
  order_id: string
  pair: string
  side: 'buy' | 'sell'
  price: string
  amount: string
  filled: string
  remaining: string
}

export const getSpotOrders = (address: string) => nodeRequest<SpotOrder[]>('get_spot_orders', { query: { address } }).catch(() => [] as SpotOrder[])

export interface PerpAccount {
  collateral: string
  withdrawable: string
  equity: string
  maintenance_margin: string
  collateral_token: string
  positions: Record<string, { size: string; entry_price: string; mark_price: string; unrealized_pnl: string; leverage: string; liquidation_price: string | null }>
  orders: { market_id: string; order_id: string; side: string; price: string; size: string }[]
}

export const getPerpAccount = (address: string) => nodeRequest<PerpAccount>('get_perp_account', { query: { address } }).catch(() => null)

// ─── assets ────────────────────────────────────────────────────────────────────

/** Spot names native QRDX "QRDX"; everything else is a token address. */
export const isNativeAsset = (a: string | null | undefined) => !!a && a.toUpperCase() === 'QRDX'

/** symbol for an asset id, given the token list. */
export function assetSymbol(asset: string | null | undefined, tokens: Map<string, NativeToken>): string {
  if (!asset) return '—'
  if (isNativeAsset(asset)) return 'QRDX'
  return tokens.get(asset.toLowerCase())?.symbol ?? `${asset.slice(0, 6)}…${asset.slice(-4)}`
}

// ─── USD prices (trade.qrdx.org /prices) ───────────────────────────────────────

export interface UsdPrice {
  price: string
  change24h: string | null
  source: string
  route?: string[]
}

/**
 * USD prices for assets (a verified slug such as "qrdx", or token addresses), from the
 * trade API of the active network: index prices, or routed through its pools. Empty when
 * the network has no trade API or it is unreachable; prices are reference data.
 */
export async function getUsdPrices(assets: string[]): Promise<Record<string, UsdPrice | null>> {
  const api = getActiveNetwork().tradeApiUrl
  const ids = [...new Set(assets.map((a) => (isNativeAsset(a) ? 'qrdx' : a.toLowerCase())))].slice(0, 100)
  if (!api || !ids.length) return {}
  try {
    const res = await fetch(`${api}/prices?assets=${ids.join(',')}`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return {}
    const body = (await res.json()) as { prices: Record<string, UsdPrice | null> }
    const out: Record<string, UsdPrice | null> = {}
    for (const [k, v] of Object.entries(body.prices)) out[k === 'qrdx' ? 'QRDX' : k.toLowerCase()] = v
    return out
  } catch {
    return {}
  }
}

/** A trade.qrdx.org page for this network, e.g. tradeLink('/trade/0x…/qrdx'). */
export function tradeLink(path: string): string | null {
  const net = getActiveNetwork()
  if (!net.tradeUrl) return null
  // trade.qrdx.org serves mainnet and testnet; name the one this page reads.
  const network = net.type === 'local' ? null : net.type
  return net.tradeUrl + path + (network ? `${path.includes('?') ? '&' : '?'}network=${network}` : '')
}
