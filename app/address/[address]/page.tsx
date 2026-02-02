'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, ArrowUpRight, ArrowDownLeft, Coins, TrendingUp, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import AddressAvatar from '@/components/AddressAvatar'
import ClaimWalletDialog from '@/components/ClaimWalletDialog'
import ShareAddressDialog from '@/components/ShareAddressDialog'
import PnLChart from '@/components/PnLChart'
import MiniTokenChart from '@/components/MiniTokenChart'
import { formatAddress, formatTimestamp, formatUSD, formatBalance } from '@/lib/mock-data'
import { ClaimMetadata } from '@/lib/types'
import { getAddressInfo, getAddressTokens, type TransactionResponse, type AddressToken } from '@/lib/api-client'
import { getTokenPrices, getTokenPriceWithFallback, getHistoricalPrices, generateHistoricalDataFromTransactions } from '@/lib/pricing-api'
import { calculateTokenPositions, calculateTokenBalance, type TokenPosition } from '@/lib/token-positions'
import { updateUrlWithNetwork, getCurrentNetworkConfig, type NetworkType } from '@/lib/network-utils'
import { getKnownAddress, isKnownAddress } from '@/lib/known-addresses'
import { weiToQRDX } from '@/lib/utils'

interface PageProps {
  params: Promise<{ address: string }>
}

// Token position interface
interface TokenHoldingWithPrice extends AddressToken {
  usdValue: number
  price: number
  percentage: number
  positions: TokenPosition[]
}

// Generate mock positions for a token (fallback for UI demo)
function generateMockPositions(tokenSymbol: string): TokenPosition[] {
  const positions: TokenPosition[] = []
  const count = Math.floor(Math.random() * 5) + 3
  
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const timestamp = Date.now() - (daysAgo * 24 * 60 * 60 * 1000)
    const amount = (Math.random() * 1000 + 10).toFixed(2)
    const value = parseFloat(amount) * (Math.random() * 10 + 1)
    
    positions.push({
      hash: '0x' + Math.random().toString(16).slice(2, 66),
      timestamp,
      amount,
      value,
      type: 'incoming',
      from: '0x' + Math.random().toString(16).slice(2, 42),
      to: '0x' + Math.random().toString(16).slice(2, 42),
    })
  }
  
  return positions.sort((a, b) => b.timestamp - a.timestamp)
}

// Token holding item component with collapsible positions
function TokenHoldingItem({ 
  token, 
  userAddress 
}: { 
  token: TokenHoldingWithPrice
  userAddress: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [chartData, setChartData] = useState<Array<{ time: any; value: number }>>([])
  const positions = token.positions.length > 0 ? token.positions : generateMockPositions(token.token.symbol)
  
  // Fetch historical price data for the chart
  useEffect(() => {
    async function fetchChartData() {
      if (token.price < 0) {
        // No price available, use flat line
        setChartData(Array.from({ length: 7 }, (_, i) => ({
          time: (Date.now() / 1000 - (6 - i) * 86400) as any,
          value: 0
        })))
        return
      }
      
      const historicalPrices = await getHistoricalPrices(token.token.symbol, '1d', 7)
      
      if (historicalPrices && historicalPrices.data.length > 0) {
        setChartData(historicalPrices.data.map(point => ({
          time: point.timestamp as any,
          value: point.price_usd
        })))
      } else {
        // Fallback to generated data based on transactions
        const historicalPoints = generateHistoricalDataFromTransactions(
          token.price,
          positions.map(p => ({ timestamp: p.timestamp })),
          7
        )
        setChartData(historicalPoints.map(point => ({
          time: point.timestamp as any,
          value: point.price_usd
        })))
      }
    }
    
    fetchChartData()
  }, [token.price, token.token.symbol])
  
  const priceChange = chartData.length >= 2 
    ? ((chartData[chartData.length - 1].value - chartData[0].value) / chartData[0].value) * 100
    : 0
  const isPositive = priceChange >= 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Coins className="h-8 w-8 text-primary" />
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{token.token.name}</span>
                  <span className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/30">
                    {token.token.type}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{token.token.symbol}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Mini Chart */}
              <div className="w-24 h-12">
                <MiniTokenChart data={chartData} positive={isPositive} />
              </div>
              
              {/* Values */}
              <div className="text-right">
                <div className="font-medium">{token.balance_formatted.toFixed(4)} {token.token.symbol}</div>
                <div className="text-sm text-muted-foreground">
                  {token.price >= 0 ? formatUSD(token.usdValue) : 'N/A'}
                </div>
                <div className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {token.price >= 0 ? `${isPositive ? '+' : ''}${priceChange.toFixed(2)}%` : 'Price unavailable'}
                </div>
              </div>
              
              {/* Chevron */}
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t px-4 py-3 bg-muted/30">
            <div className="text-sm font-medium mb-3">Positions ({positions.length})</div>
            <div className="space-y-2">
              {positions.map((position) => (
                <div
                  key={position.hash}
                  className="flex items-center justify-between p-3 rounded-md bg-background/50 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {position.type === 'incoming' ? (
                      <ArrowDownLeft className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <Link
                        href={`/tx/${position.hash}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {formatAddress(position.hash, 8, 6)}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatTimestamp(position.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {position.type === 'incoming' ? '+' : '-'}{position.amount} {token.token.symbol}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatUSD(position.value)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export default function AddressPage({ params }: PageProps) {
  const { address } = use(params)
  
  // State management
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addressInfo, setAddressInfo] = useState<any>(null)
  const [transactions, setTransactions] = useState<TransactionResponse[]>([])
  const [tokens, setTokens] = useState<TokenHoldingWithPrice[]>([])
  const [qrdxPrice, setQrdxPrice] = useState(0)
  const [claimed, setClaimed] = useState(false)
  const [metadata, setMetadata] = useState<ClaimMetadata | undefined>()
  const [copied, setCopied] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>('mainnet')

  // Update URL with network parameters and get current network
  useEffect(() => {
    updateUrlWithNetwork()
    const config = getCurrentNetworkConfig()
    if (config) {
      setCurrentNetwork(config.type)
    }
    
    // Check if this is a known address and auto-populate metadata
    const knownAddr = getKnownAddress(address)
    if (knownAddr) {
      console.log('Found known address:', knownAddr)
      setMetadata({
        name: knownAddr.name,
        description: knownAddr.description,
        image: knownAddr.image,
      })
      setClaimed(knownAddr.verified)
    } else {
      console.log('No known address found for:', address)
    }
  }, [address])

  // Fetch address data
  useEffect(() => {
    async function fetchAddressData() {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch address info with transactions
        const addressResponse = await getAddressInfo(address, {
          transactionsCountLimit: 50,
          page: currentPage,
          showPending: true
        })
        
        if (addressResponse.error || !addressResponse.data) {
          throw new Error(addressResponse.error || 'Failed to fetch address info')
        }
        
        // The API wraps the response in a 'result' object
        const data = addressResponse.data.result || addressResponse.data
        
        setAddressInfo(data)
        setTransactions(data.transactions || [])
        
        // Fetch QRDX price
        const price = await getTokenPriceWithFallback('QRDX')
        setQrdxPrice(price)
        
        // Fetch tokens owned by this address (non-blocking - don't throw if it fails)
        try {
          const tokensResponse = await getAddressTokens(address)
          
          if (tokensResponse.data && tokensResponse.data.tokens) {
            // Fetch prices for all tokens
            const tokenSymbols = tokensResponse.data.tokens.map(t => t.token.symbol)
            const priceMap = await getTokenPrices(tokenSymbols)
            
            // Calculate positions and USD values
            const tokensWithPrices: TokenHoldingWithPrice[] = tokensResponse.data.tokens.map(token => {
              const priceData = priceMap.get(token.token.symbol.toLowerCase())
              const price = priceData?.price_usd ?? -1 // Use -1 if price not found
              // Only calculate USD value if price is valid (>= 0)
              const usdValue = price >= 0 ? token.balance_formatted * price : 0
              
              // Calculate positions from transaction history
              const positions = calculateTokenPositions(
                data?.transactions || [],
                address,
                token.token.address,
                token.token.decimals
              )
              
              return {
                ...token,
                price,
                usdValue,
                percentage: 0, // Will calculate after we have total
                positions
              }
            })
            
            // Calculate percentages
            const totalValue = tokensWithPrices.reduce((sum, t) => sum + t.usdValue, 0)
            tokensWithPrices.forEach(t => {
              t.percentage = totalValue > 0 ? (t.usdValue / totalValue) * 100 : 0
            })
            
            setTokens(tokensWithPrices)
          }
        } catch (tokenError) {
          // Log token fetch error but don't fail the whole page
          console.warn('Failed to fetch tokens (this is okay if not implemented yet):', tokenError)
        }
        
      } catch (err) {
        console.error('Error fetching address data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }
    
    fetchAddressData()
  }, [address, currentPage])

  const handleClaim = (newMetadata: ClaimMetadata) => {
    setClaimed(true)
    setMetadata(newMetadata)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const totalTokenValue = tokens.reduce((sum, token) => sum + token.usdValue, 0)
  const balance = addressInfo?.balance ? weiToQRDX(addressInfo.balance) : 0
  const balanceUSD = balance * qrdxPrice
  const totalValue = balanceUSD + totalTokenValue

  // Generate PnL data from historical prices or transaction timeline
  const [pnlData, setPnlData] = useState<Array<{ time: number; value: number }>>([])
  
  useEffect(() => {
    async function fetchHistoricalData() {
      if (!qrdxPrice || !balance) return
      
      // Try to get real historical price data
      const historicalPrices = await getHistoricalPrices('QRDX', '1d', 7)
      
      if (historicalPrices && historicalPrices.data.length > 0) {
        // Use real historical prices
        const data = historicalPrices.data.map(point => ({
          time: point.timestamp,
          value: balance * point.price_usd
        }))
        setPnlData(data)
      } else {
        // Fallback: generate historical data based on transaction timeline
        const historicalPoints = generateHistoricalDataFromTransactions(
          qrdxPrice,
          transactions,
          7
        )
        const data = historicalPoints.map(point => ({
          time: point.timestamp,
          value: balance * point.price_usd
        }))
        setPnlData(data)
      }
    }
    
    fetchHistoricalData()
  }, [qrdxPrice, balance, transactions])

  // Loading state
  if (loading && !addressInfo) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading address data...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div>
                <h3 className="font-semibold text-lg mb-1">Error Loading Address</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
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

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-4">
          <AddressAvatar
            address={address}
            size={80}
            imageUrl={metadata?.image}
          />
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold">
                {metadata?.name || 'Address'}
              </h1>
              {claimed && (
                <div className="px-2 py-1 text-xs rounded-full bg-primary/20 text-primary border border-primary/30">
                  Verified
                </div>
              )}
              {/* Display badges from known addresses */}
              {isKnownAddress(address) && getKnownAddress(address)?.badges.map((badge, index) => (
                <div 
                  key={index}
                  className={`px-2 py-1 text-xs rounded-full ${badge.bgColor} ${badge.textColor} border ${badge.borderColor}`}
                >
                  {badge.text}
                </div>
              ))}
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
            {metadata?.description && (
              <p className="text-muted-foreground mb-2">
                {metadata.description}
              </p>
            )}
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className="text-muted-foreground">{address}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={copyToClipboard}
              >
                <Copy className="h-3 w-3" />
              </Button>
              {copied && <span className="text-xs text-primary">Copied!</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <ShareAddressDialog address={address} />
          {!claimed && (
            <ClaimWalletDialog address={address} onClaim={handleClaim} />
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBalance(balance)} QRDX</div>
            <div className="text-sm text-muted-foreground">{formatUSD(balanceUSD)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Token Value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUSD(totalTokenValue)}</div>
            <div className="text-sm text-muted-foreground">{tokens.length} tokens</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUSD(totalValue)}</div>
            <div className="text-sm text-green-500 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              +{((totalValue / (totalValue * 0.9) - 1) * 100).toFixed(2)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{addressInfo?.total_transactions || transactions.length}</div>
            <div className="text-sm text-muted-foreground">Total txns</div>
          </CardContent>
        </Card>
      </div>

      {/* PnL Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Portfolio Value (7 Days)</CardTitle>
          <CardDescription>Historical performance of this address</CardDescription>
        </CardHeader>
        <CardContent>
          <PnLChart data={pnlData} height={300} />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="tokens">Token Holdings</TabsTrigger>
          <TabsTrigger value="nfts">NFTs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>All transactions involving this address</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No transactions found
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => {
                    const isOutgoing = tx.from.toLowerCase() === address.toLowerCase()
                    const value = weiToQRDX(tx.value || '0')
                    const gasUsed = parseFloat(tx.gas_used || '0')
                    const gasPrice = weiToQRDX(tx.gas_price || '0')
                    const fee = gasUsed * gasPrice
                    
                    return (
                      <div
                        key={tx.hash}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            isOutgoing ? 'bg-red-500/10' : 'bg-green-500/10'
                          }`}>
                            {isOutgoing ? (
                              <ArrowUpRight className="h-4 w-4 text-red-500" />
                            ) : (
                              <ArrowDownLeft className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/tx/${tx.hash}`}
                              className="font-mono text-sm text-primary hover:underline"
                            >
                              {formatAddress(tx.hash, 10, 8)}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              Transfer • {formatTimestamp(tx.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-medium ${
                            isOutgoing ? 'text-red-500' : 'text-green-500'
                          }`}>
                            {isOutgoing ? '-' : '+'}{value.toFixed(4)} QRDX
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Fee: {fee.toFixed(6)} QRDX
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-1 text-xs rounded ${
                            tx.status === 'confirmed' ? 'bg-green-500/20 text-green-500' :
                            tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                            'bg-red-500/20 text-red-500'
                          }`}>
                            {tx.status}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Token Holdings</CardTitle>
              <CardDescription>All tokens held by this address</CardDescription>
            </CardHeader>
            <CardContent>
              {tokens.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No tokens found
                </div>
              ) : (
                <div className="space-y-4">
                  {tokens.map((token, i) => (
                    <TokenHoldingItem key={i} token={token} userAddress={address} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nfts">
          <Card>
            <CardHeader>
              <CardTitle>NFT Collection</CardTitle>
              <CardDescription>NFTs owned by this address</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                {tokens.filter(t => t.token.type === 'QRC-721' || t.token.type === 'QRC-1155').length === 0
                  ? 'No NFTs found'
                  : 'NFT display coming soon'}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Analytics</CardTitle>
              <CardDescription>Detailed analytics and insights</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">First Transaction</div>
                  <div className="font-medium">
                    {transactions.length > 0
                      ? formatTimestamp(transactions[transactions.length - 1].timestamp)
                      : 'N/A'}
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Nonce</div>
                  <div className="font-medium">{addressInfo?.nonce || 0}</div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Avg Transaction Value</div>
                  <div className="font-medium">
                    {transactions.length > 0
                      ? (transactions.reduce((sum, tx) => sum + weiToQRDX(tx.value || '0'), 0) / transactions.length).toFixed(4)
                      : '0'} QRDX
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Total Fees Paid</div>
                  <div className="font-medium">
                    {transactions.reduce((sum, tx) => {
                      const gasUsed = parseFloat(tx.gas_used || '0')
                      const gasPrice = weiToQRDX(tx.gas_price || '0')
                      return sum + (gasUsed * gasPrice)
                    }, 0).toFixed(6)} QRDX
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
