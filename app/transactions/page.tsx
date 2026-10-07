'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3 } from 'lucide-react'
import { Bars, type Bar } from '@/components/charts/Bars'
import { HistoryTable, opLabel } from '@/components/explorer/HistoryTable'
import { Panel, Tile } from '@/components/explorer/ui'
import { getLatestTransactions, isOracleVote, type IndexedTx } from '@/lib/qrdx/indexed'

/** The chain's latest transactions from the node's index, with a day of activity by hour. */
export default function TransactionsPage() {
  const [sample, setSample] = useState<IndexedTx[] | null>(null)
  useEffect(() => {
    getLatestTransactions({ limit: 500 })
      .then((p) => setSample(p.transactions))
      .catch(() => setSample([]))
  }, [])
  const load = useCallback((q: { limit: number; cursor: string | null; kinds: string | null }) => getLatestTransactions(q), [])

  const { bars, users, votes, ops, failed } = useMemo(() => {
    const hours = 24
    const now = Math.floor(Date.now() / 1000 / 3600)
    const buckets = Array.from({ length: hours }, (_, i) => ({ h: now - hours + 1 + i, user: 0, votes: 0 }))
    const ops = new Map<string, number>()
    let users = 0
    let votes = 0
    let failed = 0
    for (const t of sample ?? []) {
      const b = buckets.find((x) => x.h === Math.floor(t.timestamp / 3600))
      if (isOracleVote(t)) {
        votes++
        if (b) b.votes++
        continue
      }
      users++
      if (t.status === 'failed') failed++
      if (b) b.user++
      const k = opLabel(t)
      ops.set(k, (ops.get(k) ?? 0) + 1)
    }
    const bars: Bar[] = buckets.map((b) => ({
      key: b.h,
      values: [
        { value: b.votes, className: 'fill-[hsl(var(--chart-3))]', label: 'Validator votes' },
        { value: b.user, className: 'fill-[hsl(var(--chart-1))]', label: 'Transactions' },
      ],
      tooltip: `${new Date(b.h * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${b.user} transactions · ${b.votes} validator votes`,
    }))
    return { bars, users, votes, failed, ops: [...ops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) }
  }, [sample])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <section className="hero-glow -mx-4 border-b px-4 pb-6 pt-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Transaction index</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every canonical block&apos;s transactions: transfers, exchange operations (swaps, orders, pools, perps, tokens) and EVM calls, as the
          node indexes them.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Transactions" value={sample ? users : '—'} sub="in the latest 500 indexed" />
          <Tile label="Validator votes" value={sample ? votes : '—'} sub="oracle prices, hidden by default" />
          <Tile label="Failed" value={sample ? failed : '—'} sub="executed, refused, fee burned" />
          <Tile label="Busiest type" value={ops[0]?.[0] ?? '—'} sub={ops[0] ? `${ops[0][1]} times` : ''} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Last 24 hours" icon={<BarChart3 className="h-4 w-4" />} bodyClassName="p-4">
          {sample === null ? <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p> : <Bars bars={bars} height={140} unit="an hour" />}
        </Panel>
        <Panel title="By type" icon={<Activity className="h-4 w-4" />} bodyClassName="p-4 space-y-2">
          {ops.map(([k, n]) => (
            <div key={k} className="text-sm">
              <div className="flex justify-between">
                <span>{k}</span>
                <span className="num text-muted-foreground">{n}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(n / Math.max(1, ops[0][1])) * 100}%` }} />
              </div>
            </div>
          ))}
          {sample && !ops.length && <p className="text-sm text-muted-foreground">Only validator votes recently.</p>}
        </Panel>
      </div>

      <Panel className="mt-6">
        <HistoryTable load={load} />
      </Panel>
    </div>
  )
}
