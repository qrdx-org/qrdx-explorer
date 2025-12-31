'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, ArrowUpRight, ArrowDownLeft, Coins, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AddressAvatar from '@/components/AddressAvatar'
import ClaimWalletDialog from '@/components/ClaimWalletDialog'
import SignMessageButton from '@/components/SignMessageButton'
import PnLChart from '@/components/PnLChart'
import { generateMockAddress, formatAddress, formatTimestamp, formatUSD, generateMockPnLData } from '@/lib/mock-data'
import { Address as AddressType, ClaimMetadata } from '@/lib/types'

interface PageProps {
  params: Promise<{ address: string }>
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
          <SignMessageButton address={address} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{addressData.balance} qETH</div>
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
                        {tx.from === address ? '-' : '+'}{tx.value} qETH
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Fee: {tx.fee} qETH
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
              <div className="space-y-2">
                {addressData.tokens.map((token, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Coins className="h-8 w-8 text-primary" />
                      <div>
                        <div className="font-medium">{token.name}</div>
                        <div className="text-sm text-muted-foreground">{token.symbol}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{token.balance} {token.symbol}</div>
                      <div className="text-sm text-muted-foreground">{formatUSD(token.usdValue)}</div>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="text-sm font-medium">{token.percentage.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">of portfolio</div>
                    </div>
                  </div>
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
                    {(addressData.transactions.reduce((sum, tx) => sum + parseFloat(tx.value), 0) / addressData.transactions.length).toFixed(4)} qETH
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Total Fees Paid</div>
                  <div className="font-medium">
                    {addressData.transactions.reduce((sum, tx) => sum + parseFloat(tx.fee), 0).toFixed(6)} qETH
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
