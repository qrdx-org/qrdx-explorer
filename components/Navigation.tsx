'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from './theme-toggle'
import { Search, Database, Activity, FileText, Blocks } from 'lucide-react'

export default function Navigation() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="QRDX" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-bold gradient-text">QRDX Explorer</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/blocks" className="flex items-center space-x-1 text-sm hover:text-primary transition-colors">
              <Blocks className="h-4 w-4" />
              <span>Blocks</span>
            </Link>
            <Link href="/transactions" className="flex items-center space-x-1 text-sm hover:text-primary transition-colors">
              <Activity className="h-4 w-4" />
              <span>Transactions</span>
            </Link>
            <Link href="/addresses" className="flex items-center space-x-1 text-sm hover:text-primary transition-colors">
              <Search className="h-4 w-4" />
              <span>Addresses</span>
            </Link>
            <Link href="/contracts" className="flex items-center space-x-1 text-sm hover:text-primary transition-colors">
              <FileText className="h-4 w-4" />
              <span>Contracts</span>
            </Link>
          </div>

          {/* Theme Toggle */}
          <div className="flex items-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  )
}
