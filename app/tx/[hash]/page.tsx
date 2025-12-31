'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, ArrowRight, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AddressAvatar from '@/components/AddressAvatar'
import { generateMockTransactions, formatAddress, formatTimestamp, formatUSD } from '@/lib/mock-data'

interface PageProps {
  params: Promise<{ hash: string }>
}

export default function TransactionPage({ params }: PageProps) {
  const { hash } = use(params)
  const [transaction] = useState(() => generateMockTransactions('0x0', 1)[0])
  const [copiedField, setCopiedField] = useState<string | null>(null)

  transaction.hash = hash // Use the actual hash from URL

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const StatusIcon = transaction.status === 'confirmed' ? CheckCircle :
                      transaction.status === 'pending' ? Clock : XCircle

  const statusColor = transaction.status === 'confirmed' ? 'text-green-500' :
                      transaction.status === 'pending' ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Transaction Details</h1>
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
            <div>
              <div className="text-sm text-muted-foreground mb-1">Block Number</div>
              <Link href={`/block/${transaction.blockNumber}`} className="text-primary hover:underline font-medium">
                {transaction.blockNumber.toLocaleString()}
              </Link>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Timestamp</div>
              <div className="font-medium">{formatTimestamp(transaction.timestamp)}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(transaction.timestamp).toLocaleString()}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Method</div>
              <div className="inline-flex px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
                {transaction.method}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Value & Fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Value</div>
              <div className="text-2xl font-bold">{transaction.value} qETH</div>
              <div className="text-sm text-muted-foreground">
                ≈ {formatUSD(parseFloat(transaction.value) * 3500)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Transaction Fee</div>
                <div className="font-medium">{transaction.fee} qETH</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gas Price</div>
                <div className="font-medium">{transaction.gasPrice} Gwei</div>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-1">Gas Used</div>
              <div className="font-medium">{parseInt(transaction.gasUsed).toLocaleString()}</div>
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
              <div className="font-mono text-xs break-all">{hash}</div>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-1">Block Hash</div>
              <div className="font-mono text-xs break-all">
                0x{Math.random().toString(16).slice(2)}...
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border">
            <div className="text-sm text-muted-foreground mb-2">Input Data</div>
            <div className="font-mono text-xs bg-muted p-3 rounded overflow-x-auto">
              0x{Math.random().toString(16).slice(2).repeat(20).slice(0, 200)}...
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded-lg border text-center">
              <div className="text-sm text-muted-foreground mb-1">Position</div>
              <div className="font-medium">{Math.floor(Math.random() * 50)}</div>
            </div>
            <div className="p-3 rounded-lg border text-center">
              <div className="text-sm text-muted-foreground mb-1">Nonce</div>
              <div className="font-medium">{Math.floor(Math.random() * 1000)}</div>
            </div>
            <div className="p-3 rounded-lg border text-center">
              <div className="text-sm text-muted-foreground mb-1">Gas Limit</div>
              <div className="font-medium">{(parseInt(transaction.gasUsed) * 1.2).toFixed(0)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
