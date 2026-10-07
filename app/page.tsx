'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, Blocks, Clock, Coins, Layers, Radio, Search, ShieldCheck, TrendingUp } from 'lucide-react'
import { Bars, type Bar } from '@/components/charts/Bars'
import { openSearch } from '@/components/chrome/SearchDialog'
import { useChain } from '@/components/explorer/ChainProvider'
import { AddressLink, BlockLink, TimeAgo, TxLink } from '@/components/explorer/common'
import { useTokenMap, useUsdPrices, usdOf } from '@/components/explorer/data'
import { opLabel } from '@/components/explorer/HistoryTable'
import { useLiveBlocks } from '@/components/explorer/hooks'
import { Panel, Pill, Tile, fmtCompact, fmtNum, fmtPct, fmtUsd, toneOf } from '@/components/explorer/ui'
import { blockTxCount, getValidators, type ValidatorInfo } from '@/lib/qrdx'
import { assetSymbol, getLatestTransactions, getMarkets, isOracleVote, type IndexedTx, type Ticker } from '@/lib/qrdx/indexed'
import { n18 } from '@/lib/math/decimal'
import { cn } from '@/lib/utils'

export default function HomePage() {
  const { height, finalizedEpoch, stream, network } = useChain()
  const { blocks } = useLiveBlocks(30)
  const tokens = useTokenMap()
  const [validators, setValidators] = useState<ValidatorInfo[] | null>(null)
  const [txs, setTxs] = useState<IndexedTx[] | null>(null)
  const [markets, setMarkets] = useState<Ticker[] | null>(null)
  const prices = useUsdPrices(['QRDX'])
  const qrdx = usdOf(prices, 'QRDX')

  useEffect(() => {
    getValidators().then(setValidators).catch(() => setValidators([]))
    const load = () => {
      getLatestTransactions({ limit: 500 }).then((p) => setTxs(p.transactions)).catch(() => setTxs([]))
      getMarkets().then(setMarkets).catch(() => setMarkets([]))
    }
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [])

  const blockTimes = useMemo<Bar[]>(() => {
    const sorted = [...blocks].filter((b) => b.timestamp).sort((a, b) => a.height - b.height)
    return sorted.slice(1).map((b, i) => {
      const dt = Math.max(0, b.timestamp! - sorted[i].timestamp!)
      return {
        key: b.height,
        values: [{ value: dt, className: 'fill-[hsl(var(--chart-1))]', label: 'seconds' }],
        tooltip: `#${b.height.toLocaleString()}: ${dt.toFixed(1)}s after the previous block · ${blockTxCount(b)} txns`,
      }
    })
  }, [blocks])
  const avgBlock = blockTimes.length ? blockTimes.reduce((s, b) => s + b.values[0].value, 0) / blockTimes.length : null

  const activity = useMemo<Bar[]>(() => {
    const now = Math.floor(Date.now() / 1000 / 3600)
    const buckets = Array.from({ length: 24 }, (_, i) => ({ h: now - 23 + i, user: 0, votes: 0 }))
    for (const t of txs ?? []) {
      const b = buckets.find((x) => x.h === Math.floor(t.timestamp / 3600))
      if (!b) continue
      if (isOracleVote(t)) b.votes++
      else b.user++
    }
    return buckets.map((b) => ({
      key: b.h,
      values: [
        { value: b.votes, className: 'fill-[hsl(var(--chart-3))]', label: 'votes' },
        { value: b.user, className: 'fill-[hsl(var(--chart-1))]', label: 'transactions' },
      ],
      tooltip: `${new Date(b.h * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${b.user} transactions · ${b.votes} validator votes`,
    }))
  }, [txs])
  const userTxs = (txs ?? []).filter((t) => !isOracleVote(t))
  const active = (validators ?? []).filter((v) => v.status === 'active')
  const stake = active.reduce((s, v) => s + Number(v.effectiveStake), 0)
  const topMarkets = [...(markets ?? [])].sort((a, b) => b.trades_24h - a.trades_24h || Number(b.quote_volume_24h) - Number(a.quote_volume_24h)).slice(0, 8)
  const sym = (a: string) => (a.includes('-PERP') ? a : assetSymbol(a, tokens))

  return (
    <div>
      <section className="hero-glow border-b">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', stream.state === 'live' ? 'pulse-dot bg-bid text-bid' : 'bg-muted-foreground')} />
              {network.name}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">The QRDX chain, live</h1>
            <p className="mt-3 text-base text-muted-foreground">Blocks, transactions, tokens and markets, read from the node as they happen.</p>
            <button
              onClick={openSearch}
              className="mx-auto mt-7 flex h-12 w-full max-w-2xl items-center gap-3 rounded-xl border bg-card px-4 text-left text-muted-foreground shadow-sm transition-colors hover:border-foreground/25"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-sm">Search a block, transaction, address or token</span>
              <kbd className="rounded border bg-muted px-1.5 text-[11px]">⌘K</kbd>
            </button>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Block height" icon={<Blocks className="h-4 w-4" />} value={height >= 0 ? `#${height.toLocaleString()}` : '—'} sub={stream.state === 'live' ? 'live' : stream.state} />
            <Tile label="Finalized epoch" icon={<Layers className="h-4 w-4" />} value={finalizedEpoch ?? '—'} />
            <Tile label="Block time" icon={<Clock className="h-4 w-4" />} value={avgBlock !== null ? `${avgBlock.toFixed(1)}s` : '—'} sub="average, last 30 blocks" />
            <Tile label="Validators" icon={<ShieldCheck className="h-4 w-4" />} value={validators ? active.length : '—'} sub={validators ? `${fmtCompact(stake)} QRDX staked` : ''} />
            <Tile label="Transactions" icon={<Radio className="h-4 w-4" />} value={txs ? userTxs.length : '—'} sub="in the latest 500 indexed" />
            <Tile
              label="QRDX"
              icon={<TrendingUp className="h-4 w-4" />}
              value={qrdx ? fmtUsd(Number(qrdx.price)) : '—'}
              sub={qrdx ? <span className={toneOf(qrdx.change24h)}>{qrdx.change24h !== null ? `${fmtPct(qrdx.change24h)} 24h` : `via ${qrdx.source === 'route' ? 'pools' : qrdx.source}`}</span> : 'no USD price'}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Block times" icon={<Clock className="h-4 w-4" />} bodyClassName="p-4" right={<span className="text-xs text-muted-foreground">seconds between blocks</span>}>
            {blockTimes.length ? <Bars bars={blockTimes} height={130} unit="s" /> : <p className="py-10 text-center text-sm text-muted-foreground">Loading blocks…</p>}
          </Panel>
          <Panel title="Activity, 24 hours" icon={<BarChart3 className="h-4 w-4" />} bodyClassName="p-4" right={<Link href="/transactions" className="text-xs text-primary hover:underline">All transactions</Link>}>
            {txs ? <Bars bars={activity} height={130} unit="an hour" /> : <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
          </Panel>
        </div>

        {topMarkets.length > 0 && (
          <Panel title="Markets" icon={<Coins className="h-4 w-4" />} right={<Link href="/tokens" className="text-xs text-primary hover:underline">All tokens</Link>}>
            <div className="overflow-x-auto">
              <table className="num w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b text-left">
                    <th className="px-4 py-2.5 font-medium">Market</th>
                    <th className="px-3 py-2.5 text-right font-medium">Last</th>
                    <th className="px-3 py-2.5 text-right font-medium">24h</th>
                    <th className="px-3 py-2.5 text-right font-medium">Volume 24h</th>
                    <th className="px-4 py-2.5 text-right font-medium">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {topMarkets.map((m) => (
                    <tr key={m.market} className="border-b last:border-b-0 hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-medium">
                          {m.type === 'perp' ? (
                            m.market
                          ) : (
                            <>
                              {m.base.startsWith('0x') ? <Link href={`/address/${m.base}`} className="text-primary hover:underline">{sym(m.base)}</Link> : sym(m.base)}
                              <span className="text-muted-foreground">/</span>
                              {m.quote.startsWith('0x') ? <Link href={`/address/${m.quote}`} className="text-primary hover:underline">{sym(m.quote)}</Link> : sym(m.quote)}
                            </>
                          )}
                          <Pill>{m.type === 'perp' ? 'perp' : 'spot'}</Pill>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{m.last_price ? fmtNum(n18(m.last_price), 8) : m.mark_price ? fmtNum(n18(m.mark_price), 4) : '—'}</td>
                      <td className={cn('px-3 py-2.5 text-right', toneOf(m.change_pct_24h))}>{fmtPct(m.change_pct_24h)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {fmtCompact(n18(m.quote_volume_24h))} <span className="text-xs text-muted-foreground">{m.type === 'perp' ? m.quote : sym(m.quote)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">{m.trades_24h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Latest blocks" icon={<Blocks className="h-4 w-4" />} right={<Link href="/blocks" className="flex items-center gap-1 text-xs text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>}>
            {blocks.slice(0, 10).map((b) => (
              <div key={b.height} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Blocks className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <BlockLink height={b.height} className="font-medium" />
                  <span className="block text-xs text-muted-foreground">
                    <TimeAgo timestamp={b.timestamp} /> · slot {b.slot ?? '—'}
                  </span>
                </span>
                <span className="min-w-0 text-right text-xs text-muted-foreground">
                  <span className="block">
                    <span className="num text-foreground">{blockTxCount(b)}</span> txns · {b.attestationCount} att.
                  </span>
                  <span className="block truncate">
                    by <AddressLink address={b.proposer} className="text-xs" />
                  </span>
                </span>
              </div>
            ))}
            {!blocks.length && <p className="py-10 text-center text-sm text-muted-foreground">Loading blocks…</p>}
          </Panel>
          <Panel title="Latest transactions" icon={<Radio className="h-4 w-4" />} right={<Link href="/transactions" className="flex items-center gap-1 text-xs text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>}>
            {userTxs.slice(0, 10).map((t) => (
              <div key={`${t.tx_hash}:${t.position}`} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', t.status === 'failed' ? 'bg-ask/10' : 'bg-muted')}>
                  <Radio className={cn('h-4 w-4', t.status === 'failed' ? 'text-ask' : 'text-muted-foreground')} />
                </span>
                <span className="min-w-0 flex-1">
                  <TxLink hash={t.tx_hash} />
                  <span className="block text-xs text-muted-foreground">
                    {opLabel(t)} · <TimeAgo timestamp={t.timestamp} />
                  </span>
                </span>
                <span className="min-w-0 text-right text-xs text-muted-foreground">
                  <span className="block">
                    from <AddressLink address={t.sender} className="text-xs" />
                  </span>
                  {t.amount && (
                    <span className="num block text-foreground">
                      {fmtNum(t.amount, 4)} {t.asset ? (t.asset.toUpperCase() === 'QRDX' ? 'QRDX' : t.asset.startsWith('0x') ? assetSymbol(t.asset, tokens) : t.asset) : ''}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {txs && !userTxs.length && <p className="py-10 text-center text-sm text-muted-foreground">Only validator votes recently.</p>}
            {!txs && <p className="py-10 text-center text-sm text-muted-foreground">Loading transactions…</p>}
          </Panel>
        </div>
      </div>
    </div>
  )
}
