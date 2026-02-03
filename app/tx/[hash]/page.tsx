'use client'

export const runtime = 'edge'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, ArrowRight, CheckCircle, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AddressAvatar from '@/components/AddressAvatar'
import { formatAddress, formatTimestamp, formatUSD } from '@/lib/mock-data'
import { getTransaction, type TransactionResponse } from '@/lib/api-client'
import { getTokenPriceWithFallback } from '@/lib/pricing-api'
import { updateUrlWithNetwork, getCurrentNetworkConfig, type NetworkType } from '@/lib/network-utils'
import { weiToQRDX } from '@/lib/utils'

interface PageProps {
  params: Promise<{ hash: string }>
}

export default function TransactionPage({ params }: PageProps) {
  const { hash } = use(params)
  const [transaction, setTransaction] = useState<TransactionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrdxPrice, setQrdxPrice] = useState(0)
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
    async function fetchTransaction() {
      setLoading(true)
      setError(null)

      try {
        const response = await getTransaction(hash)
        
        if (response.error || !response.data) {
          throw new Error(response.error || 'Transaction not found')
        }

        setTransaction(response.data)

        // Fetch QRDX price for USD conversion
        const price = await getTokenPriceWithFallback('QRDX')
        setQrdxPrice(price)
      } catch (err) {
        console.error('Error fetching transaction:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTransaction()
  }, [hash])

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
            <p className="text-muted-foreground">Loading transaction...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !transaction) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div>
                <h3 className="font-semibold text-lg mb-1">Transaction Not Found</h3>
                <p className="text-sm text-muted-foreground">{error || 'Transaction not found'}</p>
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

  const value = weiToQRDX(transaction.value || '0')
  const gasUsed = parseFloat(transaction.gas_used || '0')
  const gasPrice = weiToQRDX(transaction.gas_price || '0')
  const gasLimit = parseFloat(transaction.gas_limit || '0')
  const fee = gasUsed * gasPrice
  const valueUSD = value * qrdxPrice
  const feeUSD = fee * qrdxPrice

  const StatusIcon = transaction.status === 'confirmed' ? CheckCircle :
                      transaction.status === 'pending' ? Clock : XCircle

  const statusColor = transaction.status === 'confirmed' ? 'text-green-500' :
                      transaction.status === 'pending' ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">Transaction Details</h1>
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
          <span className="font-mono text-muted-foreground">{hash}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copyToClipboard(hash, 'hash')}
          >
            <Copy className="h-3 w-3" />
          </Button>
          {copiedField === 'hash' && <span className="text-xs text-primary">Copied!</span>}
        </div>
      </div>

      {/* Status Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <StatusIcon className={`h-8 w-8 ${statusColor}`} />
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className={`text-xl font-bold capitalize ${statusColor}`}>
                {transaction.status}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Transaction Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {transaction.block_number && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Block Number</div>
                <Link href={`/block/${transaction.block_number}`} className="text-primary hover:underline font-medium">
                  {transaction.block_number.toLocaleString()}
                </Link>
              </div>
            )}

            <div>
              <div className="text-sm text-muted-foreground mb-1">Timestamp</div>
              <div className="font-medium">{formatTimestamp(transaction.timestamp)}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(transaction.timestamp).toLocaleString()}
              </div>
            </div>

            {transaction.nonce !== undefined && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Nonce</div>
                <div className="font-medium">{transaction.nonce}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Value & Fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Value</div>
              <div className="text-2xl font-bold">{value.toFixed(4)} QRDX</div>
              {qrdxPrice > 0 && (
                <div className="text-sm text-muted-foreground">
                  ≈ {formatUSD(valueUSD)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Transaction Fee</div>
                <div className="font-medium">{fee.toFixed(6)} QRDX</div>
                {qrdxPrice > 0 && (
                  <div className="text-xs text-muted-foreground">≈ {formatUSD(feeUSD)}</div>
                )}
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gas Price</div>
                <div className="font-medium">{(gasPrice / 1e9).toFixed(2)} Gwei</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gas Used</div>
                <div className="font-medium">{gasUsed.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gas Limit</div>
                <div className="font-medium">{gasLimit.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* From & To */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Transaction Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* From */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <AddressAvatar address={transaction.from} size={40} />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">From</div>
                  <Link
                    href={`/address/${transaction.from}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {formatAddress(transaction.from)}
                  </Link>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => copyToClipboard(transaction.from, 'from')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="p-2 rounded-full bg-primary/20">
                <ArrowRight className="h-5 w-5 text-primary" />
              </div>
            </div>

            {/* To */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <AddressAvatar address={transaction.to} size={40} />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">To</div>
                  <Link
                    href={`/address/${transaction.to}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {formatAddress(transaction.to)}
                  </Link>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => copyToClipboard(transaction.to, 'to')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Details */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-1">Transaction Hash</div>
              <div className="font-mono text-xs break-all">{transaction.hash}</div>
            </div>
            {transaction.block_hash && (
              <div className="p-3 rounded-lg border">
                <div className="text-sm text-muted-foreground mb-1">Block Hash</div>
                <div className="font-mono text-xs break-all">{transaction.block_hash}</div>
              </div>
            )}
          </div>

          {transaction.data && transaction.data !== '0x' && (
            <div className="p-3 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-2">Input Data</div>
              <div className="font-mono text-xs bg-muted p-3 rounded overflow-x-auto break-all">
                {transaction.data}
              </div>
            </div>
          )}

          {transaction.logs && transaction.logs.length > 0 && (
            <div className="p-3 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-2">Event Logs ({transaction.logs.length})</div>
              <div className="space-y-2">
                {transaction.logs.slice(0, 5).map((log, i) => (
                  <div key={i} className="p-2 bg-muted rounded text-xs">
                    <div className="font-medium mb-1">Log {i}</div>
                    <div className="text-muted-foreground">Address: {formatAddress(log.address)}</div>
                    <div className="text-muted-foreground">Topics: {log.topics.length}</div>
                  </div>
                ))}
                {transaction.logs.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center">
                    + {transaction.logs.length - 5} more logs
                  </div>
                )}
              </div>
            </div>
          )}

          {transaction.contract_address && (
            <div className="p-3 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-1">Contract Created</div>
              <Link
                href={`/address/${transaction.contract_address}`}
                className="font-mono text-xs text-primary hover:underline break-all"
              >
                {transaction.contract_address}
              </Link>
            </div>
          )}

          {transaction.signature && (
            <div className="p-3 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-1">Signature</div>
              <div className="font-mono text-xs break-all bg-muted p-2 rounded">
                {transaction.signature}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
