'use client'

import { useState } from 'react'
import { BarChart3, Landmark, Tag, Trophy, Vault } from 'lucide-react'
import { AddressLink } from '@/components/explorer/common'
import { usePolled } from '@/components/explorer/hooks'
import { Panel, Tile, fmtCompact, fmtNum } from '@/components/explorer/ui'
import { getLeaderboard, getPerpMarkets, getTickerAuction, getUserVaults } from '@/lib/qrdx/trading'
import { cn } from '@/lib/utils'

type Tab = 'leaders' | 'vaults' | 'deployers' | 'tickers'
const WINDOWS = [
  { id: 'day', label: '24H' },
  { id: 'week', label: '7D' },
  { id: 'month', label: '30D' },
  { id: 'all', label: 'All' },
] as const

const Missing = () => <p className="p-8 text-center text-sm text-muted-foreground">This network&apos;s node does not report this (qrdx-node&apos;s 2026-10 release adds it).</p>

/**
 * The exchange's trading layer from the chain: perps traders ranked by profit or volume, user
 * vaults (copy trading) and markets' liquidity vaults, deployer markets (perps a bonded
 * deployer lists and prices itself), and the unique-ticker auction.
 */
export default function TradingPage() {
  const [tab, setTab] = useState<Tab>('leaders')
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'leaders', label: 'Leaderboard', icon: <Trophy className="h-3.5 w-3.5" /> },
    { id: 'vaults', label: 'Vaults', icon: <Vault className="h-3.5 w-3.5" /> },
    { id: 'deployers', label: 'Deployer markets', icon: <Landmark className="h-3.5 w-3.5" /> },
    { id: 'tickers', label: 'Tickers', icon: <Tag className="h-3.5 w-3.5" /> },
  ]
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="h-6 w-6 text-muted-foreground" /> Trading
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Traders, vaults, deployer markets and tickers on the native exchange.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', tab === t.id ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'leaders' && <Leaders />}
      {tab === 'vaults' && <Vaults />}
      {tab === 'deployers' && <Deployers />}
      {tab === 'tickers' && <Tickers />}
    </div>
  )
}

function Leaders() {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]['id']>('week')
  const [metric, setMetric] = useState<'pnl' | 'volume'>('pnl')
  const board = usePolled(() => getLeaderboard(window, metric), 60_000, [window, metric])
  return (
    <Panel
      title="Leaderboard"
      icon={<Trophy className="h-4 w-4" />}
      right={
        <span className="flex gap-1 text-xs">
          {WINDOWS.map((w) => (
            <button key={w.id} type="button" onClick={() => setWindow(w.id)} className={cn('rounded px-2 py-0.5', window === w.id ? 'bg-accent text-foreground' : 'text-muted-foreground')}>
              {w.label}
            </button>
          ))}
          <span className="mx-1 w-px bg-border" />
          {(['pnl', 'volume'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)} className={cn('rounded px-2 py-0.5', metric === m ? 'bg-accent text-foreground' : 'text-muted-foreground')}>
              {m === 'pnl' ? 'Profit' : 'Volume'}
            </button>
          ))}
        </span>
      }
    >
      {board.loading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : board.data === null ? (
        <Missing />
      ) : board.data.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No perps trades in this window.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="w-12 px-4 py-2 text-left font-medium">#</th>
              <th className="px-4 py-2 text-left font-medium">Account</th>
              <th className="px-4 py-2 font-medium">Realized profit</th>
              <th className="px-4 py-2 font-medium">Volume</th>
              <th className="px-4 py-2 font-medium">Trades</th>
            </tr>
          </thead>
          <tbody>
            {board.data.map((r, i) => (
              <tr key={r.account} className="border-t text-right tabular-nums">
                <td className="px-4 py-2 text-left text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2 text-left">
                  <AddressLink address={r.account} />
                </td>
                <td className={cn('px-4 py-2', r.pnl > 0 ? 'text-bid' : r.pnl < 0 ? 'text-ask' : '')}>{`${r.pnl > 0 ? '+' : ''}${fmtCompact(r.pnl)}`}</td>
                <td className="px-4 py-2">{fmtCompact(r.volume)}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

function Vaults() {
  const vaults = usePolled(() => getUserVaults(), 30_000)
  const list = [...(vaults.data ?? [])].sort((a, b) => Number(b.nav) - Number(a.nav))
  return (
    <Panel title="Vaults" icon={<Vault className="h-4 w-4" />}>
      {vaults.loading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : vaults.data === null ? (
        <Missing />
      ) : !list.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No vaults yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-2 text-left font-medium">Vault</th>
              <th className="px-4 py-2 text-left font-medium">Leader</th>
              <th className="px-4 py-2 font-medium">Value</th>
              <th className="px-4 py-2 font-medium">Share value</th>
              <th className="px-4 py-2 font-medium">Leader&apos;s cut</th>
              <th className="px-4 py-2 font-medium">Depositors</th>
              <th className="px-4 py-2 font-medium">Positions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.vault} className="border-t text-right tabular-nums">
                <td className="px-4 py-2 text-left">
                  <div className="font-medium">{v.managed ? `${v.managed} liquidity` : v.name || 'Unnamed'}</div>
                  <AddressLink address={v.vault} />
                </td>
                <td className="px-4 py-2 text-left">{v.managed ? <span className="text-muted-foreground">the protocol</span> : <AddressLink address={v.leader} />}</td>
                <td className="px-4 py-2">{fmtCompact(v.nav)}</td>
                <td className="px-4 py-2">{v.share_value ? fmtNum(v.share_value, 6) : '—'}</td>
                <td className="px-4 py-2">{(Number(v.profit_share) * 100).toFixed(0)} %</td>
                <td className="px-4 py-2">{v.holders}</td>
                <td className="px-4 py-2">{Object.keys(v.positions).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

function Deployers() {
  const markets = usePolled(() => getPerpMarkets(), 30_000)
  const own = (markets.data ?? []).filter((m) => m.deployer)
  const supported = (markets.data ?? []).some((m) => 'sz_decimals' in m)
  return (
    <Panel title="Deployer markets" icon={<Landmark className="h-4 w-4" />}>
      <p className="border-b px-4 py-2.5 text-xs text-muted-foreground">
        Perpetual markets a deployer lists under its namespace (<span className="font-mono">dex:ASSET</span>) and prices itself, with a QRDX bond that governance can
        slash. Isolated margin only; the validators can freeze one that misprices.
      </p>
      {markets.loading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : markets.data === null || (!supported && !own.length) ? (
        <Missing />
      ) : !own.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No deployer markets yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-2 text-left font-medium">Market</th>
              <th className="px-4 py-2 text-left font-medium">Deployer</th>
              <th className="px-4 py-2 font-medium">Oracle</th>
              <th className="px-4 py-2 font-medium">Mark</th>
              <th className="px-4 py-2 font-medium">Open interest</th>
              <th className="px-4 py-2 font-medium">Fee share</th>
            </tr>
          </thead>
          <tbody>
            {own.map((m) => (
              <tr key={m.market_id} className="border-t text-right tabular-nums">
                <td className="px-4 py-2 text-left font-medium">{m.market_id}</td>
                <td className="px-4 py-2 text-left">
                  <AddressLink address={m.deployer!} />
                </td>
                <td className="px-4 py-2">{fmtNum(m.oracle_price, 4)}</td>
                <td className="px-4 py-2">{fmtNum(m.mark_price, 4)}</td>
                <td className="px-4 py-2">{fmtCompact(m.open_interest)}</td>
                <td className="px-4 py-2">{m.deployer_fee_share ? `${(Number(m.deployer_fee_share) * 100).toFixed(0)} %` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

function Tickers() {
  const auction = usePolled(() => getTickerAuction(), 15_000)
  const a = auction.data
  if (auction.loading) return <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
  if (!a) return <Missing />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="A ticker now" value={`${fmtNum(a.price, 2)} QRDX`} sub="burned by its buyer" />
        <Tile label="Floor" value={`${fmtNum(a.floor, 2)} QRDX`} sub={`reached ${Math.round(a.auction_seconds / 3600)} h after a sale`} />
        <Tile label="Last sale" value={a.last_sale ? `${fmtNum(a.last_sale.price, 2)} QRDX` : 'none yet'} sub={a.last_sale ? new Date(Number(a.last_sale.time) * 1000).toLocaleString() : `opens at ${fmtNum(a.opening_price, 0)} QRDX`} />
        <Tile label="Tickers claimed" value={String(a.tickers)} />
      </div>
      <Panel title="How it works" icon={<Tag className="h-4 w-4" />} bodyClassName="p-4">
        <p className="text-sm text-muted-foreground">
          Anyone can create a token named anything, so a symbol alone proves nothing. A token&apos;s creator can buy its symbol as the token&apos;s <b>unique ticker</b>: one
          token holds it for good. The price is a Dutch auction: each sale doubles it, and it falls back to the floor over time.
        </p>
        {a.reserved.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Reserved for verified assets: {a.reserved.join(', ')}.</p>}
      </Panel>
    </div>
  )
}
