/**
 * QNS names (qrdx-node docs/QNS.md) and who may sign for an address (docs/ACCOUNT_CONTROL.md).
 * Nodes before the 2026-10 release have neither: every read here answers null on them.
 */

import { rpcCallOptional } from './client'

/** label.qrdx: 3–59 of a-z, 0-9 and "-", not starting or ending with "-". */
export const QNS_NAME = /^[a-z0-9](?:[a-z0-9-]{1,57}[a-z0-9])\.qrdx$/

export const isQnsName = (q: string) => QNS_NAME.test(q.trim().toLowerCase())

/** Where a name points now; null if unregistered, expired, without an address record, or no QNS. */
export const resolveName = (name: string) => rpcCallOptional<string | null>('qns_resolve', [name.trim().toLowerCase()])

/** An address's primary name, while it still points back to the address. */
export const primaryName = (address: string) => rpcCallOptional<string | null>('qns_reverse', [address])

/** The names an address holds (their NFTs). */
export const namesOf = (address: string) => rpcCallOptional<string[]>('qns_namesOf', [address])

export interface QnsName {
  name: string
  owner: string
  token_id: string
  expires: string
  grace_ends?: string
  records: Record<string, string>
  [k: string]: unknown
}

export const getName = (name: string) => rpcCallOptional<QnsName | null>('qns_getName', [name.trim().toLowerCase()])

/** account_getAuthority: everyone who may sign for an address, and how. */
export interface Authority {
  address: string
  controllers: { address: string; members: { threshold: number; members: string[] } | null }[]
  own_key: boolean
  delay: number
  guardians?: { addresses: string[]; threshold: number; recovery_delay: number }
  pending_changes: { change_id: string; action: string; value: unknown; due: string }[]
  agents: { agent: string; name: string; valid_until: string; max_notional_per_day?: string }[]
  subaccount_of?: string
  vault?: { leader: string | null; creator: string; market_maker_for: string | null }
  multisig?: { threshold: number; members: string[] }
  protocol_holder: boolean
}

export const getAuthority = (address: string) => rpcCallOptional<Authority>('account_getAuthority', [address])
