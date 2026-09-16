'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, Copy, Inbox, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import AddressAvatar from '@/components/AddressAvatar'
import { formatAddress, formatHash, timeAgo } from '@/lib/format'
import { getKnownAddress } from '@/lib/known-addresses'
import type { ExplorerTransaction } from '@/lib/qrdx'
import { useChain, useNow } from './ChainProvider'

export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-6 w-6 flex-shrink-0 ${className}`}
      aria-label="Copy to clipboard"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  )
}

export function AddressLink({
  address,
  full = false,
  avatar = false,
  copy = false,
  className = '',
}: {
  address: string | null | undefined
  full?: boolean
  avatar?: boolean
  copy?: boolean
  className?: string
}) {
  if (!address) return <span className="text-muted-foreground">—</span>
  const known = getKnownAddress(address)
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      {avatar && <AddressAvatar address={address} size={20} imageUrl={known?.image} />}
      <Link
        href={`/address/${address}`}
        className="font-mono text-sm text-primary hover:underline truncate"
        title={address}
      >
        {known ? known.name : full ? address : formatAddress(address, 8, 6)}
      </Link>
      {copy && <CopyButton value={address} />}
    </span>
  )
}

export function TxLink({ hash, full = false, className = '' }: { hash: string; full?: boolean; className?: string }) {
  return (
    <Link href={`/tx/${hash}`} className={`font-mono text-sm text-primary hover:underline truncate ${className}`} title={hash}>
      {full ? hash : formatHash(hash)}
    </Link>
  )
}

export function BlockLink({ height, className = '' }: { height: number | null | undefined; className?: string }) {
  if (height == null) return <span className="text-muted-foreground">Pending</span>
  return (
    <Link href={`/block/${height}`} className={`font-mono text-primary hover:underline ${className}`}>
      #{height.toLocaleString()}
    </Link>
  )
}

export function TimeAgo({ timestamp }: { timestamp: number | null | undefined }) {
  const now = useNow(1000)
  return (
    <span title={timestamp ? new Date(timestamp * 1000).toLocaleString() : undefined}>
      {timeAgo(timestamp, now)}
    </span>
  )
}

const KIND_STYLES: Record<ExplorerTransaction['kind'], { label: string; className: string }> = {
  evm: { label: 'EVM', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  contract: { label: 'Contract', className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30' },
  native: { label: 'Native', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  coinbase: { label: 'Reward', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  genesis: { label: 'Genesis', className: 'bg-gray-500/15 text-gray-600 dark:text-gray-300 border-gray-500/30' },
  exchange: { label: 'Exchange', className: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30' },
}

export function TxKindBadge({ kind }: { kind: ExplorerTransaction['kind'] }) {
  const style = KIND_STYLES[kind]
  return <span className={`px-2 py-0.5 text-xs rounded border whitespace-nowrap ${style.className}`}>{style.label}</span>
}

export function NetworkModeBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { network } = useChain()
  const sizing = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'
  if (network.type === 'testnet') {
    return <div className={`${sizing} rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30`}>Testnet</div>
  }
  if (network.type === 'local') {
    return <div className={`${sizing} rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30`}>Local Node</div>
  }
  return null
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export function ErrorState({ title, error, onRetry }: { title: string; error: string; onRetry?: () => void }) {
  const { network } = useChain()
  return (
    <Card className="border-red-500/50 bg-red-500/10">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-8 w-8 text-red-500 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-lg mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground break-words">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Connected node: <span className="font-mono">{network.nodeApiUrl}</span>
            </p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center py-12">
      <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-semibold mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>}
    </div>
  )
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-1 md:gap-4 py-3 border-b last:border-b-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{children}</div>
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
          {Icon && <Icon className="h-5 w-5 text-primary" />}
        </div>
        <div className="text-2xl font-bold truncate">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}
