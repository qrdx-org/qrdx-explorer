'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from './theme-toggle'
import NetworkSwitcher from './NetworkSwitcher'
import LiveIndicator from './explorer/LiveIndicator'
import { Activity, Blocks, Server, ShieldCheck, Wallet } from 'lucide-react'

const NAV_LINKS = [
  { href: '/blocks', label: 'Blocks', icon: Blocks },
  { href: '/transactions', label: 'Transactions', icon: Activity },
  { href: '/validators', label: 'Validators', icon: ShieldCheck },
  { href: '/addresses', label: 'Addresses', icon: Wallet },
  { href: '/network', label: 'Network', icon: Server },
]

export default function Navigation() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="QRDX" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-bold">QRDX Explorer</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-6">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center space-x-1 text-sm hover:text-primary transition-colors">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            ))}
          </div>

          {/* Right side: Network Switcher + Theme Toggle */}
          <div className="flex items-center gap-2">
            <LiveIndicator />
            <NetworkSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex md:hidden items-center gap-4 overflow-x-auto pb-3 -mt-1 text-sm">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="whitespace-nowrap text-muted-foreground hover:text-primary">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
