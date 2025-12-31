'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, TrendingUp, Database, Activity, Zap, Shield, Blocks, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatTimestamp, formatAddress } from '@/lib/mock-data'

export default function Home() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery) return

    // Detect search type and route accordingly
    if (searchQuery.startsWith('0x')) {
      if (searchQuery.length === 66) {
        router.push(`/tx/${searchQuery}`)
      } else if (searchQuery.length === 42) {
        router.push(`/address/${searchQuery}`)
      }
    } else if (!isNaN(Number(searchQuery))) {
      router.push(`/block/${searchQuery}`)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background" />
        <div className="container mx-auto px-4 py-16 relative">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold mb-4">
              <span className="gradient-text">QRDX Explorer</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Explore the quantum-resistant blockchain with confidence
            </p>
            
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <Input
                  type="text"
                  placeholder="Search by Address / Txn Hash / Block / Token"
                  className="w-full pl-12 pr-32 py-6 text-lg rounded-xl border-2"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                  size="lg"
                >
                  Search
                </Button>
              </div>
            </form>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="glass p-4 rounded-lg border text-center">
              <Shield className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">100%</div>
              <div className="text-xs text-muted-foreground">Quantum Safe</div>
            </div>
            <div className="glass p-4 rounded-lg border text-center">
              <Zap className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">2,450</div>
              <div className="text-xs text-muted-foreground">TPS</div>
            </div>
            <div className="glass p-4 rounded-lg border text-center">
              <Database className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">12.3M</div>
              <div className="text-xs text-muted-foreground">Blocks</div>
            </div>
            <div className="glass p-4 rounded-lg border text-center">
              <Activity className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">987.6M</div>
              <div className="text-xs text-muted-foreground">Transactions</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Stats */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Latest Block</h3>
                <Blocks className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-bold mb-1">12,345,678</p>
              <p className="text-xs text-muted-foreground">3 seconds ago</p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Avg Block Time</h3>
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-bold mb-1">3.2s</p>
              <p className="text-xs text-green-500">-0.2s from average</p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Network TPS</h3>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-bold mb-1">2,450</p>
              <p className="text-xs text-green-500">+12% from 1h ago</p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Active Addresses</h3>
                <Search className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-bold mb-1">1.2M</p>
              <p className="text-xs text-muted-foreground">Last 24h</p>
            </CardContent>
          </Card>
        </div>

        {/* Latest Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Latest Blocks */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Latest Blocks</h2>
                <Link href="/blocks" className="text-sm text-primary hover:underline">
                  View all blocks →
                </Link>
              </div>
            </div>
            <CardContent className="p-0">
              <div className="divide-y">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Link
                    key={i}
                    href={`/block/${12345678 - i}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Blocks className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-mono font-bold text-primary">
                          {(12345678 - i).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">{i * 3} seconds ago</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{20 + Math.floor(Math.random() * 30)} txns</div>
                      <div className="text-xs text-muted-foreground">
                        Validator: {formatAddress(`0x${(i * 12345).toString(16)}...`, 4, 4)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Latest Transactions */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Latest Transactions</h2>
                <Link href="/transactions" className="text-sm text-primary hover:underline">
                  View all txns →
                </Link>
              </div>
            </div>
            <CardContent className="p-0">
              <div className="divide-y">
                {[1, 2, 3, 4, 5, 6].map((i) => {
                  const isOut = i % 2 === 0
                  return (
                    <Link
                      key={i}
                      href={`/tx/0x${i}abc${Math.random().toString(16).slice(2, 62)}`}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isOut ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                          {isOut ? (
                            <ArrowUpRight className="h-5 w-5 text-red-500" />
                          ) : (
                            <ArrowDownLeft className="h-5 w-5 text-green-500" />
                          )}
                        </div>
                        <div>
                          <div className="font-mono text-sm text-primary">
                            {formatAddress(`0x${i}abc...def${i}`, 6, 4)}
                          </div>
                          <div className="text-xs text-muted-foreground">{i * 2} seconds ago</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{(Math.random() * 5).toFixed(3)} qETH</div>
                        <div className="text-xs text-muted-foreground">Transfer</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

