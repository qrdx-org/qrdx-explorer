'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Layers, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
} from '@/components/explorer/common'
import { getNodeMetrics, getValidators, type NodeMetrics, type ValidatorInfo } from '@/lib/qrdx'
import { formatAmount, formatQrdx } from '@/lib/format'

const RECENT_WINDOW = 100
const STATUSES = ['all', 'active', 'pending', 'exiting', 'exited'] as const

export default function ValidatorsPage() {
  const { finalizedEpoch } = useChain()
  const [validators, setValidators] = useState<ValidatorInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null)
  const { blocks } = useLiveBlocks(RECENT_WINDOW)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getValidators()
        .then((v) => !cancelled && (setValidators(v), setError(null)))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load validators'))
      getNodeMetrics().then((m) => !cancelled && setMetrics(m)).catch(() => undefined)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const performance = useMemo(() => {
    const map = new Map<string, { proposed: number; lastBlock: number | null; lastTimestamp: number | null; attestations: number }>()
    for (const block of blocks) {
      if (block.proposer) {
        const key = block.proposer.toLowerCase()
        const entry = map.get(key) ?? { proposed: 0, lastBlock: null, lastTimestamp: null, attestations: 0 }
        entry.proposed++
        if (entry.lastBlock == null || block.height > entry.lastBlock) {
          entry.lastBlock = block.height
          entry.lastTimestamp = block.timestamp
        }
        map.set(key, entry)
      }
      if (block.header.kind === 'pos') {
        for (const att of block.header.attestations) {
          const key = att.validatorAddress.toLowerCase()
          const entry = map.get(key) ?? { proposed: 0, lastBlock: null, lastTimestamp: null, attestations: 0 }
          entry.attestations++
          map.set(key, entry)
        }
      }
    }
    return map
  }, [blocks])

  const filtered = (validators ?? []).filter((v) => status === 'all' || v.status === status)
  const active = (validators ?? []).filter((v) => v.status === 'active')
  const totalEffective = active.reduce((sum, v) => sum + Number(v.effectiveStake || 0), 0)
  const slashed = (validators ?? []).filter((v) => v.slashed).length
  const range = blocks.length ? `#${blocks[blocks.length - 1].height}–#${blocks[0].height}` : null

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">Validators</h1>
          <NetworkModeBadge />
        </div>
        <p className="text-muted-foreground mb-6">Proof-of-Stake validator set secured by ML-DSA-65 post-quantum signatures</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Active Validators" icon={ShieldCheck} value={validators ? active.length : '—'} hint={validators ? `${validators.length} total registered` : undefined} />
          <StatCard label="Effective Stake" icon={Layers} value={validators ? `${formatAmount(String(totalEffective), 2)}` : '—'} hint="QRDX across active validators" />
          <StatCard
            label="Finality"
            icon={CheckCircle2}
            value={finalizedEpoch ?? (metrics?.finalizedEpoch != null && metrics.finalizedEpoch >= 0 ? metrics.finalizedEpoch : '—')}
            hint={metrics ? `Justified epoch ${metrics.justifiedEpoch ?? '—'} · lag ${metrics.finalityLagEpochs ?? '—'}` : 'Finalized epoch'}
          />
          <StatCard label="Slashed" icon={ShieldAlert} value={validators ? slashed : '—'} hint={metrics?.slashingEvents != null ? `${metrics.slashingEvents} slashing events recorded` : undefined} />
        </div>
      </div>

      {error && !validators && (
        <div className="mb-6">
          <ErrorState title="Unable to load validators" error={error} />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Validator Set</CardTitle>
              <CardDescription>Proposals and attestations counted over the latest {RECENT_WINDOW} blocks{range ? ` (${range})` : ''}</CardDescription>
            </div>
            <div className="flex gap-1 flex-wrap">
              {STATUSES.map((s) => (
                <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="capitalize" onClick={() => setStatus(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!validators && !error ? (
            <LoadingState label="Loading validators…" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No validators" description={status === 'all' ? undefined : `No validators with status "${status}".`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50 text-sm">
                    <th className="text-left p-4 font-medium text-muted-foreground">Validator</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Effective Stake</th>
                    <th className="text-right p-4 font-medium text-muted-foreground hidden md:table-cell">Share</th>
                    <th className="text-right p-4 font-medium text-muted-foreground hidden lg:table-cell">Proposed</th>
                    <th className="text-right p-4 font-medium text-muted-foreground hidden lg:table-cell">Attestations</th>
                    <th className="text-right p-4 font-medium text-muted-foreground hidden sm:table-cell">Last Proposal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((v) => {
                    const perf = performance.get(v.address.toLowerCase())
                    const share = totalEffective > 0 && v.status === 'active' ? (Number(v.effectiveStake) / totalEffective) * 100 : 0
                    return (
                      <tr key={v.address} className="hover:bg-muted/50 transition-colors">
                        <td className="p-4"><AddressLink address={v.address} avatar /></td>
                        <td className="p-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded capitalize ${
                              v.slashed
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                : v.status === 'active'
                                  ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                  : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                            }`}
                          >
                            {v.slashed ? 'slashed' : v.status}
                          </span>
                          <div className="text-xs text-muted-foreground mt-1">since epoch {v.activationEpoch ?? '—'}</div>
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <div className="font-medium">{formatQrdx(v.effectiveStake, 4)}</div>
                          <div className="text-xs text-muted-foreground">bonded {formatAmount(v.stake, 2)}</div>
                        </td>
                        <td className="p-4 text-right hidden md:table-cell text-sm">{share.toFixed(2)}%</td>
                        <td className="p-4 text-right hidden lg:table-cell font-mono">{perf?.proposed ?? 0}</td>
                        <td className="p-4 text-right hidden lg:table-cell font-mono">{perf?.attestations ?? 0}</td>
                        <td className="p-4 text-right hidden sm:table-cell text-sm">
                          {perf?.lastBlock != null ? (
                            <>
                              <BlockLink height={perf.lastBlock} />
                              <div className="text-xs text-muted-foreground"><TimeAgo timestamp={perf.lastTimestamp} /></div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
