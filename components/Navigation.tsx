'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Activity, Blocks, Coins, Menu, Search, Server, ShieldCheck, X } from 'lucide-react'
import { Wordmark } from './chrome/Logo'
import { SearchDialog, openSearch } from './chrome/SearchDialog'
import { ThemeToggle } from './theme-toggle'
import NetworkSwitcher from './NetworkSwitcher'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/blocks', label: 'Blocks', icon: Blocks, match: ['/blocks', '/block/'] },
  { href: '/transactions', label: 'Transactions', icon: Activity, match: ['/transactions', '/tx/'] },
  { href: '/tokens', label: 'Tokens', icon: Coins, match: ['/tokens'] },
  { href: '/validators', label: 'Validators', icon: ShieldCheck, match: ['/validators'] },
  { href: '/network', label: 'Network', icon: Server, match: ['/network'] },
]

export default function Navigation() {
  const path = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [path])
  return (
    <>
      <nav className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
        <Link href="/" className="mr-4 flex items-center" aria-label="QRDX Explorer">
          <Wordmark />
        </Link>
        <div className="hidden h-full items-center lg:flex">
          {NAV_LINKS.map((l) => {
            const active = l.match.some((m) => path.startsWith(m))
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn('relative flex h-full items-center gap-1.5 px-3 text-sm transition-colors', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={openSearch}
            className="hidden h-8 w-60 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-auto rounded border bg-muted px-1.5 font-sans text-[10px]">⌘K</kbd>
          </button>
          <button onClick={openSearch} aria-label="Search" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:hidden">
            <Search className="h-4 w-4" />
          </button>
          <NetworkSwitcher />
          <ThemeToggle />
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent lg:hidden">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="grid grid-cols-3 gap-1 border-b bg-card p-2 lg:hidden">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex flex-col items-center gap-1 rounded-md py-2.5 text-xs text-muted-foreground hover:bg-accent">
              <l.icon className="h-4 w-4" />
              {l.label}
            </Link>
          ))}
        </div>
      )}
      <SearchDialog />
    </>
  )
}
