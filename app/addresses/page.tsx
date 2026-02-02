'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import AddressAvatar from '@/components/AddressAvatar'
import { formatAddress, formatUSD, formatBalance, formatLargeNumber } from '@/lib/mock-data'
import { getAllKnownAddresses, type KnownAddress, getKnownAddress } from '@/lib/known-addresses'
import { getTopAddresses } from '@/lib/api-client'
import { getTokenPriceWithFallback } from '@/lib/pricing-api'
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, Users, Award, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { updateUrlWithNetwork, getCurrentNetworkConfig, type NetworkType } from '@/lib/network-utils'
import { weiToQRDX } from '@/lib/utils'

interface AddressData {
  address: string
  balance: number
  transactionCount: number
  knownAddress?: KnownAddress
}

type SortField = 'balance' | 'transactions' | 'address'
type SortDirection = 'asc' | 'desc'

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<AddressData[]>([])
  const [filteredAddresses, setFilteredAddresses] = useState<AddressData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrdxPrice, setQrdxPrice] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('balance')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [activeTab, setActiveTab] = useState<'all' | 'known'>('all')
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>('mainnet')
  
  const itemsPerPage = 20

  // Update URL with network parameters and get current network
  useEffect(() => {
    updateUrlWithNetwork()
    const config = getCurrentNetworkConfig()
    if (config) {
      setCurrentNetwork(config.type)
    }
  }, [])

  // Fetch addresses data
  useEffect(() => {
    async function fetchAddresses() {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch QRDX price
        const price = await getTokenPriceWithFallback('QRDX')
        setQrdxPrice(price)
        
        // Fetch top addresses from API
        const response = await getTopAddresses(1000, 'balance')
        
        if (response.error || !response.data) {
          throw new Error(response.error || 'Failed to fetch addresses')
        }
        
        // The API wraps response in 'result'
        const result = response.data.result || response.data
        
        // Map API response to AddressData format
        const addressList: AddressData[] = result.addresses.map((item) => {
          // Parse balance from string (in smallest unit) to QRDX number
          const balance = weiToQRDX(item.balance)
          
          // Check if this is a known address
          const knownAddr = getKnownAddress(item.address)
          
          return {
            address: item.address,
            balance: balance,
            transactionCount: item.output_count,
            knownAddress: knownAddr || undefined
          }
        })
        
        setAddresses(addressList)
      } catch (err) {
        console.error('Error fetching addresses:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }
    
    fetchAddresses()
  }, [])

  // Filter and sort addresses
  useEffect(() => {
    let filtered = [...addresses]
    
    // Filter by tab
    if (activeTab === 'known') {
      filtered = filtered.filter(addr => addr.knownAddress)
    }
    
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(addr => 
        addr.address.toLowerCase().includes(query) ||
        addr.knownAddress?.name.toLowerCase().includes(query) ||
        addr.knownAddress?.description.toLowerCase().includes(query)
      )
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'balance':
          comparison = a.balance - b.balance
          break
        case 'transactions':
          comparison = a.transactionCount - b.transactionCount
          break
        case 'address':
          comparison = a.address.localeCompare(b.address)
          break
      }
      
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    setFilteredAddresses(filtered)
    setCurrentPage(1) // Reset to first page when filters change
  }, [addresses, searchQuery, sortField, sortDirection, activeTab])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Pagination
  const totalPages = Math.ceil(filteredAddresses.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentAddresses = filteredAddresses.slice(startIndex, endIndex)

  const SortButton = ({ field, children }: { field: SortField, children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-primary transition-colors"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
    </button>
  )

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Network Badge */}
      {currentNetwork !== 'mainnet' && (
        <div className="mb-4">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            currentNetwork === 'testnet' 
              ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-500/30'
              : 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/30'
          }`}>
            {currentNetwork === 'testnet' ? 'Testnet Mode' : 'Local Mode'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Addresses</h1>
        <p className="text-muted-foreground">
          Browse all addresses on the QRDX blockchain
        </p>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-500/50 bg-red-500/10 mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div>
                <h3 className="font-semibold text-lg mb-1">Error Loading Addresses</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Addresses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{addresses.length.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Known Addresses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {addresses.filter(a => a.knownAddress).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Value Locked</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBalance(addresses.reduce((sum, a) => sum + a.balance, 0), 0)} QRDX
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle>Address List</CardTitle>
              <CardDescription>
                {filteredAddresses.length.toLocaleString()} addresses found
              </CardDescription>
            </div>
            
            {/* Search */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'known')} className="mb-6">
            <TabsList>
              <TabsTrigger value="all" className="gap-2">
                <Users className="h-4 w-4" />
                All Addresses
              </TabsTrigger>
              <TabsTrigger value="known" className="gap-2">
                <Award className="h-4 w-4" />
                Known Addresses
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 border-b font-medium text-sm">
            <div className="col-span-1 text-muted-foreground">#</div>
            <div className="col-span-4 text-muted-foreground">
              <SortButton field="address">Address</SortButton>
            </div>
            <div className="col-span-2 text-muted-foreground text-right">
              <SortButton field="balance">Balance</SortButton>
            </div>
            <div className="col-span-3 text-muted-foreground text-right">
              Value
            </div>
            <div className="col-span-2 text-muted-foreground text-right">
              <SortButton field="transactions">Txns</SortButton>
            </div>
          </div>

          {/* Address List */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading addresses...
            </div>
          ) : currentAddresses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No addresses found
            </div>
          ) : (
            <div className="space-y-2">
              {currentAddresses.map((addr, index) => {
                const usdValue = addr.balance * qrdxPrice
                // Mock 24h change (replace with real data when available)
                const priceChange = (Math.random() - 0.5) * 20
                const isPositive = priceChange >= 0
                
                return (
                <Link
                  key={addr.address}
                  href={`/address/${addr.address}`}
                  className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Rank */}
                  <div className="hidden md:flex col-span-1 items-center text-muted-foreground font-mono text-sm">
                    {startIndex + index + 1}
                  </div>
                  
                  {/* Address Info */}
                  <div className="col-span-12 md:col-span-4 flex items-center gap-3">
                    <AddressAvatar
                      address={addr.address}
                      size={40}
                      imageUrl={addr.knownAddress?.image}
                    />
                    <div className="min-w-0 flex-1">
                      {addr.knownAddress ? (
                        <>
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            {addr.knownAddress.name}
                            {addr.knownAddress.verified && (
                              <span className="text-primary text-xs">✓</span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground font-mono truncate">
                            {formatAddress(addr.address)}
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {addr.knownAddress.badges.map((badge, i) => (
                              <span
                                key={i}
                                className={`text-xs px-2 py-0.5 rounded border ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}
                              >
                                {badge.text}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="font-mono text-sm truncate">
                          {addr.address}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Balance */}
                  <div className="col-span-4 md:col-span-2 flex md:justify-end items-center">
                    <div className="text-right">
                      <div className="font-medium">{formatLargeNumber(addr.balance)} QRDX</div>
                      <div className="text-sm text-muted-foreground md:hidden">Balance</div>
                    </div>
                  </div>
                  
                  {/* Value */}
                  <div className="col-span-4 md:col-span-3 flex md:justify-end items-center">
                    <div className="text-right">
                      <div className="font-medium">{formatUSD(usdValue)}</div>
                      <div className={`text-xs flex items-center gap-1 justify-end ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
                      </div>
                      <div className="text-sm text-muted-foreground md:hidden">Value (24h)</div>
                    </div>
                  </div>
                  
                  {/* Transactions */}
                  <div className="col-span-4 md:col-span-2 flex md:justify-end items-center">
                    <div className="text-right">
                      <div className="font-medium">{addr.transactionCount.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground md:hidden">Transactions</div>
                    </div>
                  </div>
                </Link>
              )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredAddresses.length)} of {filteredAddresses.length} addresses
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-9"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
