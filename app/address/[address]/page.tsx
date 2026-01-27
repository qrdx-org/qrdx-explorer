'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, ArrowUpRight, ArrowDownLeft, Coins, TrendingUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import AddressAvatar from '@/components/AddressAvatar'
import ClaimWalletDialog from '@/components/ClaimWalletDialog'
import PnLChart from '@/components/PnLChart'
import MiniTokenChart from '@/components/MiniTokenChart'
import { generateMockAddress, formatAddress, formatTimestamp, formatUSD, generateMockPnLData } from '@/lib/mock-data'
import { Address as AddressType, ClaimMetadata, Token } from '@/lib/types'

interface PageProps {
  params: Promise<{ address: string }>
}

// Token position interface
interface TokenPosition {
  hash: string
  timestamp: number
  amount: string
  value: number
}

// Generate mock positions for a token
function generateTokenPositions(tokenSymbol: string): TokenPosition[] {
  const positions: TokenPosition[] = []
  const count = Math.floor(Math.random() * 5) + 3 // 3-7 positions
  
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 90)
    const timestamp = Date.now() - (daysAgo * 24 * 60 * 60 * 1000)
    const amount = (Math.random() * 1000 + 10).toFixed(2)
    const value = parseFloat(amount) * (Math.random() * 10 + 1)
    
    positions.push({
      hash: '0x' + Math.random().toString(16).slice(2, 66),
      timestamp,
      amount,
      value
    })
  }
  
  return positions.sort((a, b) => b.timestamp - a.timestamp)
}

// Token holding item component with collapsible positions
function TokenHoldingItem({ token }: { token: Token }) {
  const [isOpen, setIsOpen] = useState(false)
  const positions = generateTokenPositions(token.symbol)
  
  // Generate mini chart data
  const miniChartData = Array.from({ length: 7 }, (_, i) => {
    const basePrice = token.usdValue / parseFloat(token.balance)
    const variance = (Math.random() - 0.5) * basePrice * 0.2
    return {
      time: (Date.now() / 1000 - (6 - i) * 86400) as any,
      value: basePrice + variance
    }
  })
  
  const priceChange = ((miniChartData[6].value - miniChartData[0].value) / miniChartData[0].value) * 100
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
                  <span className="font-medium">{token.name}</span>
                  <span className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/30">
                    {token.type}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{token.symbol}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Mini Chart */}
              <div className="w-24 h-12">
                <MiniTokenChart data={miniChartData} positive={isPositive} />
              </div>
              
              {/* Values */}
              <div className="text-right">
                <div className="font-medium">{token.balance} {token.symbol}</div>
                <div className="text-sm text-muted-foreground">{formatUSD(token.usdValue)}</div>
                <div className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
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
                    <ArrowDownLeft className="h-4 w-4 text-green-500" />
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
                    <div className="font-medium">+{position.amount} {token.symbol}</div>
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
  const [addressData, setAddressData] = useState<AddressType>(() => generateMockAddress(address))
  const [copied, setCopied] = useState(false)
  const pnlData = generateMockPnLData(7)

  const handleClaim = (metadata: ClaimMetadata) => {
    setAddressData(prev => ({
      ...prev,
      claimed: true,
      metadata
    }))
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const totalTokenValue = addressData.tokens.reduce((sum, token) => sum + token.usdValue, 0)
  const totalValue = addressData.usdValue + totalTokenValue

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-4">
          <AddressAvatar
            address={address}
            size={80}
            imageUrl={addressData.metadata?.image}
          />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold">
                {addressData.metadata?.name || 'Address'}
              </h1>
              {addressData.claimed && (
                <div className="px-2 py-1 text-xs rounded-full bg-primary/20 text-primary border border-primary/30">
                  Verified
                </div>
              )}
            </div>
            {addressData.metadata?.description && (
              <p className="text-muted-foreground mb-2">
                {addressData.metadata.description}
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
          {!addressData.claimed && (
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
            <div className="text-2xl font-bold">{addressData.balance} QRDX</div>
            <div className="text-sm text-muted-foreground">{formatUSD(addressData.usdValue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Token Value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUSD(totalTokenValue)}</div>
            <div className="text-sm text-muted-foreground">{addressData.tokens.length} tokens</div>
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
              +12.5%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{addressData.transactions.length}</div>
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
              <div className="space-y-2">
                {addressData.transactions.map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        tx.from === address ? 'bg-red-500/10' : 'bg-green-500/10'
                      }`}>
                        {tx.from === address ? (
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
                          {tx.method} • {formatTimestamp(tx.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${
                        tx.from === address ? 'text-red-500' : 'text-green-500'
                      }`}>
                        {tx.from === address ? '-' : '+'}{tx.value} QRDX
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Fee: {tx.fee} QRDX
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
                ))}
              </div>
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
              <div className="space-y-4">
                {addressData.tokens.map((token, i) => (
                  <TokenHoldingItem key={i} token={token} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nfts">
          <Card>
            <CardHeader>
              <CardTitle>NFT Collection</CardTitle>
              <CardDescription>Coming soon - NFTs owned by this address</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                NFT support coming soon
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
                  <div className="font-medium">{formatTimestamp(addressData.createdAt)}</div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Nonce</div>
                  <div className="font-medium">{addressData.nonce}</div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Avg Transaction Value</div>
                  <div className="font-medium">
                    {(addressData.transactions.reduce((sum, tx) => sum + parseFloat(tx.value), 0) / addressData.transactions.length).toFixed(4)} QRDX
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Total Fees Paid</div>
                  <div className="font-medium">
                    {addressData.transactions.reduce((sum, tx) => sum + parseFloat(tx.fee), 0).toFixed(6)} QRDX
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
