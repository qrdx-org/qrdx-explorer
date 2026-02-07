'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatAddress, formatTimestamp, formatLargeNumber } from '@/lib/mock-data'
import { getBlocks, getStatus, type BlockResponse } from '@/lib/api-client'
import { updateUrlWithNetwork, getCurrentNetworkConfig, type NetworkType } from '@/lib/network-utils'
import { ChevronLeft, ChevronRight, Search, Blocks, Clock, Database, Activity, Loader2, AlertCircle, TrendingUp } from 'lucide-react'
import { weiToQRDX } from '@/lib/utils'

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<BlockResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>('mainnet')
  const [latestBlockHeight, setLatestBlockHeight] = useState(0)
  const [totalBlocks, setTotalBlocks] = useState(0)
  
  const itemsPerPage = 20

  // Update URL with network parameters and get current network
  useEffect(() => {
    updateUrlWithNetwork()
    const config = getCurrentNetworkConfig()
    if (config) {
      setCurrentNetwork(config.type)
    }
  }, [])

  // Fetch blockchain status to get current height
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await getStatus()
        if (response.data) {
          setLatestBlockHeight(response.data.height)
          setTotalBlocks(response.data.height)
        }
      } catch (err) {
        console.error('Error fetching status:', err)
      }
    }
    
    fetchStatus()
    // Update status every 10 seconds
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch blocks data
  useEffect(() => {
    async function fetchBlocks() {
      setLoading(true)
      setError(null)
      
      try {
        // Calculate offset for pagination (newest blocks first)
        const offset = (currentPage - 1) * itemsPerPage
        
        // Fetch blocks from API
        const response = await getBlocks(offset, itemsPerPage)
        
        if (response.error || !response.data) {
          throw new Error(response.error || 'Failed to fetch blocks')
        }
        
        setBlocks(response.data)
      } catch (err) {
        console.error('Error fetching blocks:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }
    
    fetchBlocks()
  }, [currentPage])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery) return

    // If it's a number, navigate to that block
    if (!isNaN(Number(searchQuery))) {
      window.location.href = `/block/${searchQuery}`
    } else if (searchQuery.startsWith('0x') && searchQuery.length === 66) {
      // If it's a hash, search for block by hash
      window.location.href = `/block/${searchQuery}`
    }
  }

  const totalPages = totalBlocks > 0 ? Math.ceil(totalBlocks / itemsPerPage) : 1
  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  // Calculate average block time from recent blocks
  const avgBlockTime = blocks.length >= 2 
    ? (blocks[0].timestamp - blocks[blocks.length - 1].timestamp) / (blocks.length - 1)
    : 3

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold">Blocks</h1>
          {currentNetwork === 'testnet' && (
            <div className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">
              Testnet Mode
            </div>
          )}
          {currentNetwork === 'local' && (
            <div className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30">
              Local Mode
            </div>
          )}
        </div>
        <p className="text-muted-foreground mb-6">
          Explore all blocks on the QRDX blockchain
        </p>

        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Latest Block</h3>
                <Blocks className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold">{(latestBlockHeight || 0).toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Avg Block Time</h3>
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold">{(avgBlockTime || 0).toFixed(1)}s</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Total Blocks</h3>
                <Database className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold">{formatLargeNumber(totalBlocks || 0)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Showing Page</h3>
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold">{currentPage} / {(totalPages || 1).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            type="text"
            placeholder="Search by block number or block hash"
            className="w-full pl-12 pr-24 py-6 text-lg rounded-xl border-2"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            type="submit"
            className="absolute right-2 top-1/2 transform -translate-y-1/2"
          >
            Search
          </Button>
        </form>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-500/50 bg-red-500/10 mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div>
                <h3 className="font-semibold text-lg mb-1">Error Loading Blocks</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Make sure the QRDX node is running at {process.env.NEXT_PUBLIC_QRDX_NODE_URL || 'http://127.0.0.1:3007'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading blocks...</p>
          </div>
        </div>
      )}

      {/* Blocks Table */}
      {!loading && !error && blocks.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Recent Blocks</CardTitle>
              <CardDescription>
                Showing {blocks.length} blocks (Page {currentPage} of {totalPages.toLocaleString()})
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium text-muted-foreground">Block</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Age</th>
                      <th className="text-left p-4 font-medium text-muted-foreground hidden md:table-cell">Miner</th>
                      <th className="text-right p-4 font-medium text-muted-foreground">Txns</th>
                      <th className="text-right p-4 font-medium text-muted-foreground hidden lg:table-cell">Gas Used</th>
                      <th className="text-right p-4 font-medium text-muted-foreground hidden xl:table-cell">Gas Limit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {blocks.map((block) => {
                      const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0
                      const gasUsed = parseFloat(block.gas_used || '0')
                      const gasLimit = parseFloat(block.gas_limit || '0')
                      const gasUtilization = gasLimit > 0 ? (gasUsed / gasLimit) * 100 : 0
                      
                      return (
                        <tr key={block.hash} className="hover:bg-muted/50 transition-colors">
                          <td className="p-4">
                            <Link 
                              href={`/block/${block.number}`}
                              className="flex items-center gap-2 hover:text-primary transition-colors"
                            >
                              <div className="p-2 rounded-lg bg-primary/10">
                                <Blocks className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <div className="font-mono font-bold text-primary">
                                  {block.number.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono hidden sm:block">
                                  {formatAddress(block.hash, 6, 4)}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {formatTimestamp(block.timestamp)}
                            </div>
                          </td>
                          <td className="p-4 hidden md:table-cell">
                            <Link 
                              href={`/address/${block.miner}`}
                              className="font-mono text-sm hover:text-primary transition-colors"
                            >
                              {formatAddress(block.miner, 6, 4)}
                            </Link>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Activity className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{txCount}</span>
                            </div>
                          </td>
                          <td className="p-4 text-right hidden lg:table-cell">
                            <div className="text-sm">
                              <div className="font-mono">{formatLargeNumber(gasUsed)}</div>
                              <div className="text-xs text-muted-foreground">
                                {gasUtilization.toFixed(1)}%
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-right hidden xl:table-cell">
                            <div className="text-sm font-mono text-muted-foreground">
                              {formatLargeNumber(gasLimit)}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={!canGoPrevious}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {currentPage.toLocaleString()} of {(totalPages || 1).toLocaleString()}
              </span>
            </div>

            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={!canGoNext}
              className="gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* Empty State */}
      {!loading && !error && blocks.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Blocks className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Blocks Found</h3>
              <p className="text-sm text-muted-foreground">
                No blocks are available at the moment.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
