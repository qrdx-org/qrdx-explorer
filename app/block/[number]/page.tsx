'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, ArrowRight, Clock, Loader2, AlertCircle, Blocks as BlocksIcon, Activity, Database, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AddressAvatar from '@/components/AddressAvatar'
import { formatAddress, formatTimestamp, formatLargeNumber } from '@/lib/mock-data'
import { getBlock, type BlockResponse, type TransactionResponse } from '@/lib/api-client'
import { updateUrlWithNetwork, getCurrentNetworkConfig, type NetworkType } from '@/lib/network-utils'
import { weiToQRDX } from '@/lib/utils'

interface PageProps {
  params: Promise<{ number: string }>
}

export default function BlockPage({ params }: PageProps) {
  const { number } = use(params)
  const [block, setBlock] = useState<BlockResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>('mainnet')

  // Update URL with network parameters and get current network
  useEffect(() => {
    updateUrlWithNetwork()
    const config = getCurrentNetworkConfig()
    if (config) {
      setCurrentNetwork(config.type)
    }
  }, [])

  useEffect(() => {
    async function fetchBlock() {
      setLoading(true)
      setError(null)

      try {
        // Fetch block with full transaction details
        const response = await getBlock(number, true)
        
        if (response.error || !response.data) {
          throw new Error(response.error || 'Block not found')
        }

        setBlock(response.data)
      } catch (err) {
        console.error('Error fetching block:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchBlock()
  }, [number])

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading block...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !block) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div>
                <h3 className="font-semibold text-lg mb-1">Block Not Found</h3>
                <p className="text-sm text-muted-foreground">{error || 'Block not found'}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Make sure the QRDX node is running at {process.env.NEXT_PUBLIC_QRDX_NODE_URL || 'http://127.0.0.1:3007'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0
  const gasUsed = parseFloat(block.gas_used || '0')
  const gasLimit = parseFloat(block.gas_limit || '0')
  const gasUtilization = gasLimit > 0 ? (gasUsed / gasLimit) * 100 : 0
  const transactions = Array.isArray(block.transactions) && block.transactions.length > 0 && typeof block.transactions[0] === 'object'
    ? block.transactions as TransactionResponse[]
    : []

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/blocks" className="text-muted-foreground hover:text-primary transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-3xl font-bold">Block #{block.number.toLocaleString()}</h1>
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
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{block.hash}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copyToClipboard(block.hash, 'hash')}
          >
            <Copy className="h-3 w-3" />
          </Button>
          {copiedField === 'hash' && <span className="text-xs text-primary">Copied!</span>}
        </div>
      </div>

      {/* Block Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/block/${block.number - 1}`}>
          <Button variant="outline" disabled={block.number <= 0}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous Block
          </Button>
        </Link>
        <Link href={`/block/${block.number + 1}`}>
          <Button variant="outline">
            Next Block
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Transactions</h3>
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{txCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Gas Used</h3>
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatLargeNumber(gasUsed)}</p>
            <p className="text-xs text-muted-foreground">{gasUtilization.toFixed(1)}% utilized</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Gas Limit</h3>
              <Database className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatLargeNumber(gasLimit)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Block Size</h3>
              <BlocksIcon className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatLargeNumber(block.size)} bytes</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Block Information */}
        <Card>
          <CardHeader>
            <CardTitle>Block Information</CardTitle>
            <CardDescription>Essential block details and metadata</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Block Height</div>
              <div className="font-mono text-lg font-bold">{block.number.toLocaleString()}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Timestamp</div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">
                  {new Date(block.timestamp * 1000).toLocaleString()} ({formatTimestamp(block.timestamp)})
                </span>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Block Hash</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm break-all">{block.hash}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => copyToClipboard(block.hash, 'block-hash')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Parent Hash</div>
              <div className="flex items-center gap-2">
                <Link 
                  href={`/block/${block.number - 1}`}
                  className="font-mono text-sm break-all hover:text-primary transition-colors"
                >
                  {block.parent_hash}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => copyToClipboard(block.parent_hash, 'parent-hash')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Miner/Validator</div>
              <div className="flex items-center gap-2">
                <AddressAvatar address={block.miner} size={24} />
                <Link 
                  href={`/address/${block.miner}`}
                  className="font-mono text-sm hover:text-primary transition-colors"
                >
                  {formatAddress(block.miner, 12, 12)}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => copyToClipboard(block.miner, 'miner')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Details</CardTitle>
            <CardDescription>Block execution and consensus data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Difficulty</div>
              <div className="font-mono">{block.difficulty}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Difficulty</div>
              <div className="font-mono">{block.total_difficulty}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Nonce</div>
              <div className="font-mono">{block.nonce}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">State Root</div>
              <div className="font-mono text-sm break-all">{block.state_root}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Transactions Root</div>
              <div className="font-mono text-sm break-all">{block.transactions_root}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Receipts Root</div>
              <div className="font-mono text-sm break-all">{block.receipts_root}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              {txCount} transaction{txCount !== 1 ? 's' : ''} in this block
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {transactions.map((tx, index) => {
                const value = weiToQRDX(tx.value || '0')
                const fee = tx.gas_used && tx.gas_price 
                  ? parseFloat(tx.gas_used) * weiToQRDX(tx.gas_price)
                  : 0

                return (
                  <Link
                    key={tx.hash}
                    href={`/tx/${tx.hash}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm text-primary truncate">
                          {formatAddress(tx.hash, 10, 10)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>From: {formatAddress(tx.from, 6, 4)}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>To: {formatAddress(tx.to, 6, 4)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-medium">{value.toFixed(4)} QRDX</div>
                      <div className="text-xs text-muted-foreground">
                        Fee: {fee.toFixed(6)} QRDX
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty Transactions State */}
      {txCount === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Transactions</h3>
              <p className="text-sm text-muted-foreground">
                This block contains no transactions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
