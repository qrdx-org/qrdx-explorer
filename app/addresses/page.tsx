'use client'

import { useEffect, useMemo, useState } from 'react'
import { Award, Search, Users, Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AddressLink,
  EmptyState,
  ErrorState,
  LoadingState,
  NetworkModeBadge,
  StatCard,
} from '@/components/explorer/common'
import { getAddressBalance, getTopAddresses, type TopAddress } from '@/lib/qrdx'
import { formatAmount, formatQrdx } from '@/lib/format'
import { getAllKnownAddresses, getKnownAddress } from '@/lib/known-addresses'

interface KnownRow {
  address: string
  name: string
  description: string
  category: string
  balance: string | null
  error: boolean
}

function sumBalances(values: Array<string | null>): string {
  // Sum as scaled integers (6 dp is enough for display) to avoid float drift.
  const scale = BigInt(1_000_000)
  let total = BigInt(0)
  for (const v of values) {
    if (!v) continue
    const [whole, fraction = ''] = v.split('.')
    total += BigInt(whole || '0') * scale + BigInt((fraction + '000000').slice(0, 6))
  }
  const fraction = (total % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return `${total / scale}${fraction ? `.${fraction}` : ''}`
}

export default function AddressesPage() {
  const [rich, setRich] = useState<TopAddress[] | null>(null)
  const [richError, setRichError] = useState<string | null>(null)
  const [knownRows, setKnownRows] = useState<KnownRow[]>(() =>
    Object.entries(getAllKnownAddresses()).map(([address, meta]) => ({
      address,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      balance: null,
      error: false,
    })),
  )
  const [filter, setFilter] = useState('')

  useEffect(() => {
    getTopAddresses(100)
      .then(setRich)
      .catch((err) => setRichError(err instanceof Error ? err.message : 'Failed to load rich list'))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const row of knownRows) {
        try {
          const balance = await getAddressBalance(row.address)
          if (cancelled) return
          setKnownRows((prev) => prev.map((r) => (r.address === row.address ? { ...r, balance } : r)))
        } catch {
          if (cancelled) return
          setKnownRows((prev) => prev.map((r) => (r.address === row.address ? { ...r, error: true } : r)))
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = filter.trim().toLowerCase()
  const filteredRich = useMemo(
    () => (rich ?? []).filter((r) => !q || r.address.toLowerCase().includes(q) || getKnownAddress(r.address)?.name.toLowerCase().includes(q)),
    [rich, q],
  )
  const filteredKnown = useMemo(
    () => knownRows.filter((r) => !q || r.address.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
    [knownRows, q],
  )
  const richTotal = useMemo(() => sumBalances((rich ?? []).map((r) => r.balance)), [rich])
  const knownTotal = useMemo(() => sumBalances(knownRows.map((r) => r.balance)), [knownRows])

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">Addresses</h1>
          <NetworkModeBadge />
        </div>
        <p className="text-muted-foreground mb-6">Largest holders and protocol system wallets</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Ranked Holders" icon={Users} value={rich ? rich.length : '—'} hint="Top UTXO balances reported by the node" />
          <StatCard label="Held by Top Holders" icon={Wallet} value={rich ? `${formatAmount(richTotal, 2)} QRDX` : '—'} />
          <StatCard label="System Wallets" icon={Award} value={`${formatAmount(knownTotal, 2)} QRDX`} hint={`${knownRows.length} known addresses`} />
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            placeholder="Filter by address or name"
            className="pl-12 py-5 rounded-xl border-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <Tabs defaultValue="rich" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rich">Rich List</TabsTrigger>
          <TabsTrigger value="known">System &amp; Known Wallets</TabsTrigger>
        </TabsList>

        <TabsContent value="rich">
          <Card>
            <CardHeader>
              <CardTitle>Top Holders</CardTitle>
              <CardDescription>
                Ranked by the node from the UTXO set (<code>/get_top_addresses</code>). Account-model balances (EVM and
                post-quantum accounts) are not included in the node&apos;s ranking — open an address to see its full balance.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {richError ? (
                <div className="p-4">
                  <ErrorState title="Unable to load rich list" error={richError} />
                </div>
              ) : !rich ? (
                <LoadingState label="Loading rich list…" />
              ) : filteredRich.length === 0 ? (
                <EmptyState title="No addresses found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50 text-sm">
                        <th className="text-left p-4 font-medium text-muted-foreground w-16">Rank</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Address</th>
                        <th className="text-right p-4 font-medium text-muted-foreground">Balance</th>
                        <th className="text-right p-4 font-medium text-muted-foreground hidden md:table-cell">Share</th>
                        <th className="text-right p-4 font-medium text-muted-foreground hidden sm:table-cell">UTXOs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredRich.map((row) => {
                        const rank = rich.indexOf(row) + 1
                        const share = Number(richTotal) > 0 ? (Number(row.balance) / Number(richTotal)) * 100 : 0
                        return (
                          <tr key={row.address} className="hover:bg-muted/50 transition-colors">
                            <td className="p-4 font-mono text-muted-foreground">{rank}</td>
                            <td className="p-4"><AddressLink address={row.address} avatar /></td>
                            <td className="p-4 text-right font-medium whitespace-nowrap">{formatQrdx(row.balance, 4)}</td>
                            <td className="p-4 text-right hidden md:table-cell text-sm text-muted-foreground">{share.toFixed(2)}%</td>
                            <td className="p-4 text-right hidden sm:table-cell font-mono text-sm">{row.outputCount}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="known">
          <Card>
            <CardHeader>
              <CardTitle>System &amp; Known Wallets</CardTitle>
              <CardDescription>Live balances from the connected node</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {filteredKnown.length === 0 ? (
                <EmptyState title="No matching wallets" />
              ) : (
                <div className="divide-y">
                  {filteredKnown.map((row) => (
                    <div key={row.address} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
                      <div className="min-w-0">
                        <AddressLink address={row.address} avatar />
                        <div className="text-xs text-muted-foreground mt-1 truncate">{row.description}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-medium">
                          {row.error ? <span className="text-muted-foreground">Unavailable</span> : row.balance == null ? <span className="text-muted-foreground">Loading…</span> : formatQrdx(row.balance, 4)}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">{row.category}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
