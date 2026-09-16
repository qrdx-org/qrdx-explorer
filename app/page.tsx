'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, Blocks, CheckCircle2, Clock, Layers, Radio, ShieldCheck, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import SearchBar from '@/components/explorer/SearchBar'
import { useChain } from '@/components/explorer/ChainProvider'
import { useLiveBlocks } from '@/components/explorer/hooks'
import {
  AddressLink,
  BlockLink,
  EmptyState,
  ErrorState,
  LoadingState,
  NetworkModeBadge,
  StatCard,
  TimeAgo,
  TxKindBadge,
  TxLink,
} from '@/components/explorer/common'
import { blockTxCount, getNodeMetrics, getValidators, type NodeMetrics, type ValidatorInfo } from '@/lib/qrdx'
import { formatAmount, formatInteger, formatQrdx } from '@/lib/format'

export default function Home() {
  const { height, finalizedEpoch, stream } = useChain()
  const { blocks, loading, error, reload } = useLiveBlocks(25)
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null)
  const [validators, setValidators] = useState<ValidatorInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getNodeMetrics().then((m) => !cancelled && setMetrics(m)).catch(() => undefined)
    }
    refresh()
    getValidators().then((v) => !cancelled && setValidators(v)).catch(() => undefined)
    const id = setInterval(refresh, 10_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const stats = useMemo(() => {
    const timed = blocks.filter((b) => b.timestamp != null && b.height > 0)
    let avgBlockTime: number | null = null
    if (timed.length >= 2) {
      const newest = timed[0]
      const oldest = timed[timed.length - 1]
      avgBlockTime = (newest.timestamp! - oldest.timestamp!) / Math.max(1, newest.height - oldest.height)
    }
    const txCount = blocks.reduce((sum, b) => sum + blockTxCount(b), 0)
    return { avgBlockTime, txCount }
  }, [blocks])

  const latestTransactions = useMemo(
    () => blocks.flatMap((b) => [...b.transactions].reverse()).filter((t) => t.kind !== 'genesis').slice(0, 10),
    [blocks],
  )

  const activeValidators = validators?.filter((v) => v.status === 'active') ?? []
  const totalStake = activeValidators.reduce((sum, v) => sum + Number(v.effectiveStake || 0), 0)
  const epoch = blocks.find((b) => b.epoch != null)?.epoch ?? null
  const shownFinalized = finalizedEpoch ?? (metrics?.finalizedEpoch != null && metrics.finalizedEpoch >= 0 ? metrics.finalizedEpoch : null)

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background" />
        <div className="container mx-auto px-4 py-14 relative">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <h1 className="text-4xl md:text-5xl font-bold">QRDX Explorer</h1>
              <NetworkModeBadge size="md" />
            </div>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Explore the quantum-resistant blockchain in real time
            </p>
            <div className="max-w-3xl mx-auto">
              <SearchBar />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="glass p-4 rounded-lg border text-center">
              <Blocks className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono">{height >= 0 ? height.toLocaleString() : '—'}</div>
              <div className="text-xs text-muted-foreground">Block Height</div>
            </div>
            <div className="glass p-4 rounded-lg border text-center">
              <Layers className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono">{epoch ?? '—'}</div>
              <div className="text-xs text-muted-foreground">Current Epoch</div>
            </div>
            <div className="glass p-4 rounded-lg border text-center">
              <CheckCircle2 className="h-6 w-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold font-mono">{shownFinalized ?? '—'}</div>
              <div className="text-xs text-muted-foreground">Finalized Epoch</div>
            </div>
            <div className="glass p-4 rounded-lg border text-center">
              <Radio className={`h-6 w-6 mx-auto mb-2 ${stream.state === 'live' ? 'text-green-500' : stream.state === 'offline' ? 'text-red-500' : 'text-yellow-500'}`} />
              <div className="text-2xl font-bold capitalize">{stream.state}</div>
              <div className="text-xs text-muted-foreground">
                {stream.transport === 'websocket' ? 'WebSocket feed' : stream.transport === 'sse' ? 'SSE feed' : stream.transport === 'polling' ? 'HTTP polling' : 'Realtime feed'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Avg Block Time"
            icon={Clock}
            value={stats.avgBlockTime != null ? `${stats.avgBlockTime.toFixed(2)}s` : '—'}
            hint={`Over the last ${blocks.length} blocks`}
          />
          <StatCard
            label="Recent Transactions"
            icon={Activity}
            value={formatInteger(stats.txCount)}
            hint={metrics?.mempoolPending != null ? `${metrics.mempoolPending} pending in mempool` : `In the last ${blocks.length} blocks`}
          />
          <StatCard
            label="Active Validators"
            icon={ShieldCheck}
            value={validators ? activeValidators.length : '—'}
            hint={validators ? `${formatAmount(String(totalStake), 2)} QRDX effective stake` : undefined}
          />
          <StatCard
            label="Connected Peers"
            icon={Users}
            value={metrics?.peerCount ?? '—'}
            hint={metrics?.finalityLagEpochs != null ? `Finality lag: ${metrics.finalityLagEpochs} epoch(s)` : undefined}
          />
        </div>

        {error && blocks.length === 0 && (
          <div className="mb-8">
            <ErrorState title="Unable to load chain data" error={error} onRetry={reload} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Latest Blocks</h2>
              <Link href="/blocks" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <CardContent className="p-0">
              {loading && blocks.length === 0 ? (
                <LoadingState label="Loading blocks…" />
              ) : blocks.length === 0 ? (
                <EmptyState title="No blocks yet" />
              ) : (
                <div className="divide-y">
                  {blocks.slice(0, 8).map((block) => (
                    <div key={block.hash} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Blocks className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <BlockLink height={block.height} className="font-bold" />
                          <div className="text-xs text-muted-foreground">
                            <TimeAgo timestamp={block.timestamp} />
                            {block.slot != null && <> · slot {block.slot}</>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right min-w-0">
                        <div className="text-sm font-medium">
                          {blockTxCount(block)} txn{blockTxCount(block) === 1 ? '' : 's'}
                          {block.attestationCount > 0 && (
                            <span className="text-muted-foreground font-normal"> · {block.attestationCount} att.</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                          {block.proposer ? <>Proposer <AddressLink address={block.proposer} /></> : 'Genesis'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Latest Transactions</h2>
              <Link href="/transactions" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <CardContent className="p-0">
              {loading && blocks.length === 0 ? (
                <LoadingState label="Loading transactions…" />
              ) : latestTransactions.length === 0 ? (
                <EmptyState
                  title="No recent transactions"
                  description={`No transactions were included in the last ${blocks.length} blocks.`}
                />
              ) : (
                <div className="divide-y">
                  {latestTransactions.map((tx) => (
                    <div key={tx.hash} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <TxKindBadge kind={tx.kind} />
                          <TxLink hash={tx.hash} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                          <AddressLink address={tx.from} /> <ArrowRight className="h-3 w-3" /> <AddressLink address={tx.to} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-medium">{formatQrdx(tx.value, 4)}</div>
                        <div className="text-xs text-muted-foreground">
                          <BlockLink height={tx.blockHeight} /> · <TimeAgo timestamp={tx.timestamp} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
