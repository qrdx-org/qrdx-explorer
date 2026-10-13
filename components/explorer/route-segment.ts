'use client'

import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'

const noop = () => () => undefined

/**
 * The URL segment after `prefix` ("/address/" → "0xPQ…"), for routes served as one
 * prerendered shell (next.config.mjs rewrites /address/:address to /address/_).
 *
 * The server never renders a particular address, block or transaction: every one of them
 * is the same static page, so the Worker spends no CPU on it (a server render of these
 * pages cost 7–13 ms, against Cloudflare's 10 ms limit: error 1102). The page reads which
 * one it is from the browser's URL once mounted, and null until then (the shell renders
 * its loading state). The router's pathname follows client-side navigation; on the first
 * load it can still name the rewrite target, so the real URL comes from window.location.
 */
export function useRouteSegment(prefix: string): string | null {
  const pathname = usePathname()
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  if (!mounted) return null
  const fromRouter = pathname?.startsWith(prefix) ? pathname.slice(prefix.length) : ''
  const raw = fromRouter && fromRouter !== '_' ? fromRouter : window.location.pathname.startsWith(prefix) ? window.location.pathname.slice(prefix.length) : ''
  const segment = raw.split('/')[0]
  if (!segment || segment === '_') return null
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
