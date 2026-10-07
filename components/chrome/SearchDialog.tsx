'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Blocks, Coins, Hash, Loader2, Search, Wallet } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { detectAddressFormat, resolveSearch } from '@/lib/qrdx'
import { getTokens, type NativeToken } from '@/lib/qrdx/indexed'
import { cn } from '@/lib/utils'

export const OPEN_SEARCH = 'qrdx-explorer:search'
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH))

let tokenCache: Promise<NativeToken[]> | null = null
const tokens = () => (tokenCache ??= getTokens().catch(() => ((tokenCache = null), [] as NativeToken[])))

/** Search anything: a block number or hash, a transaction, an address, or a token by name. ⌘K / Ctrl+K / "/". */
export function SearchDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [list, setList] = useState<NativeToken[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    const show = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener(OPEN_SEARCH, show)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(OPEN_SEARCH, show)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  useEffect(() => {
    if (open) void tokens().then(setList)
    else {
      setQ('')
      setMsg(null)
    }
  }, [open])

  const needle = q.trim().toLowerCase()
  const kind = !needle ? null : /^\d+$/.test(needle) ? 'block' : detectAddressFormat(q.trim()) ? 'address' : /^(0x)?[0-9a-f]{64}$/.test(needle) ? 'hash' : null
  const matches = useMemo(
    () =>
      needle && !kind
        ? list.filter((t) => t.symbol.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle)).slice(0, 8)
        : [],
    [list, needle, kind]
  )
  useEffect(() => setCursor(0), [needle])

  const go = (path: string) => {
    setOpen(false)
    router.push(path)
  }
  const submit = async () => {
    if (matches[cursor] && !kind) return go(`/address/${matches[cursor].token_address}`)
    if (!needle) return
    setBusy(true)
    setMsg(null)
    try {
      const target = await resolveSearch(q)
      if (target.type === 'none') setMsg('Enter a block number, a 64-character hash, an address (0x…, 0xPQ…), or a token name.')
      else go(target.path)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose className="top-[14vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(matches.length - 1, c + 1))
            if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1))
          }}
          className="flex items-center gap-3 border-b px-4"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Block, transaction, address or token"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </form>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {kind && (
            <button type="button" onClick={() => void submit()} className="flex w-full items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-left text-sm">
              {kind === 'block' ? <Blocks className="h-4 w-4" /> : kind === 'address' ? <Wallet className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
              <span className="flex-1 truncate">
                {kind === 'block' ? `Block #${Number(needle).toLocaleString()}` : kind === 'address' ? 'Address' : 'Block or transaction'}{' '}
                <span className="font-mono text-xs text-muted-foreground">{kind === 'block' ? '' : q.trim().slice(0, 24) + (q.trim().length > 24 ? '…' : '')}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {matches.map((t, i) => (
            <button
              key={t.token_address}
              type="button"
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(`/address/${t.token_address}`)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === cursor && 'bg-accent')}
            >
              <Coins className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t.symbol}</span>
              <span className="truncate text-muted-foreground">{t.name}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{t.token_address.slice(0, 10)}…</span>
            </button>
          ))}
          {needle && !kind && !matches.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No token matches. Press Enter to search.</p>}
          {!needle && (
            <div className="grid grid-cols-2 gap-1 p-1 text-xs text-muted-foreground">
              {['Block number: 52000', 'Transaction hash: 64 hex', 'Address: 0xPQ… or 0x…', 'Token: USDC, PEPE…'].map((x) => (
                <span key={x} className="rounded-md border px-2.5 py-2">
                  {x}
                </span>
              ))}
            </div>
          )}
          {msg && <p className="px-3 py-3 text-sm text-ask">{msg}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
