/**
 * Every kind of address the chain keeps balances at, and the reads that say what each one is.
 *
 * Besides keys (0xPQ…, 0x…) and multisigs (0xPQMS…), the node holds funds at protocol
 * addresses no key can sign for: `0x` + a four-letter tag + 36 hex (qrdx-node
 * qrdx/crypto/account_id.py SYNTHETIC_HOLDER_PREFIXES). A sub-account is acted for by its
 * master's signature, a vault by its leader's; the rest belong to the protocol itself. All of
 * them have balances, history and (where it applies) a perps account, read like any other.
 */

import { rpcCallOptional } from './client'

export type ProtocolTag = 'SUBA' | 'UVLT' | 'HLPV' | 'PROT' | 'POOL' | 'CLOB' | 'PERP' | 'VETO' | 'BRDG' | 'QNSA' | 'FEES'

export interface ProtocolKind {
  tag: ProtocolTag
  /** What it is, as a title. */
  label: string
  /** One sentence: what it holds and who acts for it. */
  about: string
}

export const PROTOCOL_KINDS: Record<ProtocolTag, ProtocolKind> = {
  SUBA: { tag: 'SUBA', label: 'Sub-account', about: 'Its own balances and margin, acted for only by its master account’s signature. No key of its own.' },
  UVLT: { tag: 'UVLT', label: 'Vault', about: 'A perps margin account its leader trades for the depositors, who hold shares of its value.' },
  HLPV: { tag: 'HLPV', label: 'Backstop vault', about: 'The perps backstop vault: it takes over positions liquidations leave, earns perps fees, and is owned by its depositors’ shares.' },
  PROT: { tag: 'PROT', label: 'Protocol vault shares', about: 'Holds the protocol’s own shares of the backstop vault.' },
  POOL: { tag: 'POOL', label: 'AMM pool', about: 'A spot pool’s reserves. Only swaps and liquidity operations move them.' },
  CLOB: { tag: 'CLOB', label: 'Order book escrow', about: 'What resting orders on a spot order book have locked, until they fill or are cancelled.' },
  PERP: { tag: 'PERP', label: 'Perps clearinghouse', about: 'All collateral deposited for perpetuals, across every trader and market.' },
  VETO: { tag: 'VETO', label: 'Veto escrow', about: 'QRDX locked to veto governance proposals, returned when the vote ends.' },
  BRDG: { tag: 'BRDG', label: 'Bridge authority', about: 'The bridge’s mint authority: bridged tokens are minted only on proven or attested deposits. No key can mint.' },
  QNSA: { tag: 'QNSA', label: 'QNS authority', about: 'The mint authority of QNS names. No key can mint a name.' },
  FEES: { tag: 'FEES', label: 'Staker fees', about: 'The stakers’ share of trading fees, held until an epoch pays it out.' },
}

const PROTOCOL_RE = /^0x(SUBA|UVLT|HLPV|PROT|POOL|CLOB|PERP|VETO|BRDG|QNSA|FEES)[0-9a-f]{36}$/i

/** The protocol kind of an address, or null for a key, a multisig or anything else. */
export function protocolKind(address: string | null | undefined): ProtocolKind | null {
  const m = address ? PROTOCOL_RE.exec(address) : null
  return m ? PROTOCOL_KINDS[m[1].toUpperCase() as ProtocolTag] : null
}

/** 0xPQMS + 38 hex (qrdx-node qrdx/crypto/threshold_dilithium.py derive_multisig_address). */
export const isMultisigAddress = (a: string | null | undefined) => !!a && /^0xPQMS[0-9a-f]{38}$/i.test(a)

/** Whether this is an address the explorer has a page for (keys, multisigs, protocol holders). */
export function isAccountAddress(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    (/^0xPQ[0-9a-fA-F]{64}$/.test(v) || /^0x[0-9a-fA-F]{40}$/.test(v) || isMultisigAddress(v) || PROTOCOL_RE.test(v))
  )
}

/** Whether something can sign for itself: a key or a multisig. Protocol holders cannot. */
export const canSign = (address: string) => !protocolKind(address)

// ─── reads ──────────────────────────────────────────────────────────────────

/** account_getControlled: what an address may sign for or leads. */
export interface Controlled {
  address: string
  controls: string[]
  subaccounts: string[]
  vaults_led: string[]
  agent_for: string[]
  multisigs: string[]
  guardian_of: string[]
  names?: string[]
}

export const getControlled = (address: string) => rpcCallOptional<Controlled>('account_getControlled', [address])

export interface Subaccount {
  subaccount: string
  index: number
  name: string
}

export const getSubaccounts = (master: string) => rpcCallOptional<Subaccount[]>('exchange_getSubaccounts', [master])

/** perp_getUserVault (qrdx-node exchange/views.py user_vault). */
export interface UserVaultDetail {
  vault: string
  leader: string
  name: string
  profit_share: string
  created: string
  /** A market's liquidity vault: the market it quotes. */
  managed: string | null
  nav: string
  total_shares: string
  share_value: string | null
  leader_shares: string
  holders: number
  withdrawable: string
  lockup_seconds: string
  positions: Record<string, { size: string; entry_price: string }>
}

export const getUserVault = (vault: string) => rpcCallOptional<UserVaultDetail | null>('perp_getUserVault', [vault])

/** perp_getVault: the backstop vault. */
export interface BackstopVault {
  nav: string
  collateral: string
  total_shares: string
  share_value: string | null
  protocol_shares: string
  depositors: number
  positions: Record<string, { size: string; entry_price?: string }>
  lockup_seconds: number
}

export const getBackstopVault = () => rpcCallOptional<BackstopVault>('perp_getVault', [])

/** exchange_getProtocolAddresses: every address the protocol holds balances at. */
export interface ProtocolAddresses {
  perps_holder: string
  backstop_vault: string
  protocol_vault_shares: string
  veto_escrow: string
  bridge_mint_authority: string
  qns_mint_authority?: string
  staker_fees?: string
  system_wallets: Record<string, string>
  pools: { pool_id: string; holder: string }[]
  order_books: { pair: string; escrow: string }[]
  vaults: { vault: string; name?: string }[] | string[]
}

export const getProtocolAddresses = () => rpcCallOptional<ProtocolAddresses>('exchange_getProtocolAddresses', [])

/** exchange_getPool, the fields shown here. */
export interface PoolDetail {
  pool_id: string
  token0: string
  token1: string
  fee_rate: string
  creator: string
  stake: string
  price: string
  liquidity: string
  positions: number
  volume: [string, string]
  protocol_fees?: [string, string]
  paused: boolean
  holder_address: string
}

export const getPool = (poolId: string) => rpcCallOptional<PoolDetail>('exchange_getPool', [poolId])

export interface BookSummary {
  pair: string
  base: string
  quote: string
  best_bid: string | null
  best_ask: string | null
  bids: [string, string][] | { price: string; amount: string }[]
  asks: [string, string][] | { price: string; amount: string }[]
}

export const getSpotBook = (pair: string) => rpcCallOptional<BookSummary>('exchange_getOrderBook', [pair, 10])

/**
 * What a protocol holder belongs to: the pool whose reserves it holds, the book whose orders it
 * escrows. Found in exchange_getProtocolAddresses, the node's own list.
 */
export async function holderOwner(address: string): Promise<{ poolId?: string; pair?: string } | null> {
  const all = await getProtocolAddresses()
  if (!all) return null
  const a = address.toLowerCase()
  const pool = all.pools.find((p) => p.holder.toLowerCase() === a)
  if (pool) return { poolId: pool.pool_id }
  const book = all.order_books.find((b) => b.escrow.toLowerCase() === a)
  if (book) return { pair: book.pair }
  return {}
}
