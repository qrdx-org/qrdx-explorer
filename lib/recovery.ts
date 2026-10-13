/**
 * Getting the explorer out of a crash without clearing the browser's data.
 *
 * A client-side exception used to leave Next's bare "Application error" screen, and when
 * the cause was something this site had saved (a network choice, a phone wallet session),
 * every reload crashed again until the user cleared Safari's website data. The error
 * screens (app/error.tsx, app/global-error.tsx) offer to clear exactly what the explorer
 * saves, and reload once by themselves when the page's code was replaced by a deploy.
 */

/** Everything the explorer keeps in localStorage. The theme stays: it cannot break a page. */
export const SAVED_KEYS = [
  'qrdx-network', // lib/qrdx/client.ts NETWORK_STORAGE_KEY
  'qrdx-custom-configs', // components/NetworkSwitcher.tsx
  'qrdx-explorer:connected', // lib/wallet/WalletContext.tsx
  'qrdx-explorer:connect', // lib/wallet/remote.ts (phone wallet session)
]

export async function resetSavedState(): Promise<void> {
  try {
    for (const key of SAVED_KEYS) localStorage.removeItem(key)
    for (const key of Object.keys(localStorage)) if (key.startsWith('qrdx-explorer')) localStorage.removeItem(key)
  } catch {
    /* storage unavailable: nothing to clear */
  }
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } catch {
    /* none */
  }
}

/**
 * A chunk of the page's code failed to load: a deploy replaced it while this page (or one
 * the browser restored) still referred to the old build. A fresh load fixes it.
 */
export function isStaleBuild(error: unknown): boolean {
  const text = `${(error as Error)?.name ?? ''} ${(error as Error)?.message ?? error}`
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load chunk/i.test(text)
}

const RELOADED = 'qrdx-explorer:reloaded-for-build'

/** Reload for a stale build, at most once a minute in a tab (so a lasting failure cannot loop). */
export function reloadForStaleBuild(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 60_000) return false
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
