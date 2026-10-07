'use client'

/**
 * Public profiles (docs/PROFILES.md), read from and published to trade.qrdx.org's
 * profile service. Reads are batched (every address on a page in one request) and
 * cached for the session; a publish updates every view of that address at once.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { getActiveNetwork } from '@/lib/qrdx/client'
import { ProfileKind, PublicProfile, addressKey, isAddress } from './claim'

const BASE = (process.env.NEXT_PUBLIC_QRDX_PROFILES_URL || 'https://trade.qrdx.org/api/profiles').replace(/\/$/, '')
const TTL_MS = 5 * 60_000

/** The profile service's name for the active network; null where it has none (a local node). */
export function profileNetwork(): string | null {
  const t = getActiveNetwork().type
  return t === 'mainnet' || t === 'testnet' ? t : null
}

const api = (network: string) => `${BASE}/v1/${network}`

/** The relay's copy of a profile image (never the owner's host). */
export function profileImage(p: PublicProfile | null | undefined): string | null {
  const network = profileNetwork()
  if (!p?.profile.image || !network) return null
  return `${api(network)}/image/${p.kind}/${p.address}?v=${p.issuedAt}`
}

// ─── cache ───────────────────────────────────────────────────────────────────

type Entry = { value: PublicProfile | null; at: number }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const keyOf = (network: string, kind: ProfileKind, address: string) => `${network}:${kind}:${addressKey(address)}`

function emit() {
  version++
  for (const l of listeners) l()
}

function set(network: string, kind: ProfileKind, address: string, value: PublicProfile | null) {
  cache.set(keyOf(network, kind, address), { value, at: Date.now() })
}

// Account lookups queue for one tick and go out as one ?ids= request (the relay caps it at 100).
const queued = new Map<string, Set<string>>()
let timer: ReturnType<typeof setTimeout> | null = null
const inflight = new Set<string>()

function flush() {
  timer = null
  for (const [key, set_] of queued) {
    queued.delete(key)
    const [network, kind] = key.split(':') as [string, ProfileKind]
    const ids = [...set_]
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      fetch(`${api(network)}/${kind}s?ids=${chunk.join(',')}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((body: { profiles: Record<string, PublicProfile> }) => {
          for (const id of chunk) set(network, kind, id, body.profiles[id] ?? null)
        })
        .catch(() => {
          // Unreachable service: remember "none" briefly rather than retrying on every render.
          for (const id of chunk) cache.set(keyOf(network, kind, id), { value: null, at: Date.now() - TTL_MS + 30_000 })
        })
        .finally(() => {
          for (const id of chunk) inflight.delete(keyOf(network, kind, id))
          emit()
        })
    }
  }
}

function request(network: string, kind: ProfileKind, address: string) {
  const k = keyOf(network, kind, address)
  const hit = cache.get(k)
  if ((hit && Date.now() - hit.at < TTL_MS) || inflight.has(k)) return
  inflight.add(k)
  const q = `${network}:${kind}`
  if (!queued.has(q)) queued.set(q, new Set())
  queued.get(q)!.add(addressKey(address))
  if (!timer) timer = setTimeout(flush, 25)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const never = () => () => {}

/**
 * The published profile of an account or token: undefined while loading, null when
 * there is none (or on a network without the profile service).
 */
export function useProfile(kind: ProfileKind, address: string | null | undefined): PublicProfile | null | undefined {
  // The server and the hydrating client both render "loading", so their HTML matches.
  const hydrated = useSyncExternalStore(never, () => true, () => false)
  const network = hydrated ? profileNetwork() : null
  const valid = !!address && (kind === 'token' ? /^0x[0-9a-fA-F]{40}$/.test(address) : isAddress(address))
  useEffect(() => {
    if (network && valid) request(network, kind, address!)
  }, [network, valid, kind, address])
  useSyncExternalStore(subscribe, () => version, () => 0)
  if (!hydrated) return undefined
  if (!network || !valid) return null
  const hit = cache.get(keyOf(network, kind, address!))
  return hit ? hit.value : undefined
}

// ─── publishing ──────────────────────────────────────────────────────────────

export class PublishError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** Send a signed claim. Returns the stored profile, or null after a removal. */
export async function publishProfile(
  network: string,
  kind: ProfileKind,
  subject: string,
  body: { message: string; signature: string; publicKey?: string }
): Promise<PublicProfile | null> {
  let res: Response
  try {
    res = await fetch(`${api(network)}/${kind}s`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new PublishError('The profile service is unreachable. Try again in a moment.', 0)
  }
  const out = (await res.json().catch(() => null)) as { profile?: PublicProfile; removed?: boolean; error?: string } | null
  if (!res.ok) throw new PublishError(out?.error ?? `The profile service refused it (HTTP ${res.status}).`, res.status)
  const value = out?.profile ?? null
  set(network, kind, subject, value)
  emit()
  return value
}
