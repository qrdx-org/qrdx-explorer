'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Coins, Search } from 'lucide-react'
import { Sparkline } from '@/components/charts/Bars'
import { useUsdPrices, usdOf } from '@/components/explorer/data'
import { Panel, Pill, Tile, TokenMark, fmtCompact, fmtNum, fmtPct, fmtUsd, toneOf } from '@/components/explorer/ui'
import { getCandles, getMarkets, getTokens, isNativeAsset, type NativeToken, type Ticker } from '@/lib/qrdx/indexed'
import { inv, n18 } from '@/lib/math/decimal'
import { cn } from '@/lib/utils'

interface Row {
  token: NativeToken
  market: Ticker | null
  isBase: boolean
  other: string | null
  last: string | null
  change: string | null
  trades: number
  volume: number
}

/** Every native token, with its most active market: price, 24 h change, volume and a day's sparkline. */
export default function TokensPage() {
  const [tokens, setTokens] = useState<NativeToken[] | null>(null)
  const [markets, setMarkets] = useState<Ticker[]>([])
  const [sparks, setSparks] = useState<Record<string, number[]>>({})
  const [q, setQ] = useState('')

  useEffect(() => {
    getTokens().then(setTokens).catch(() => setTokens([]))
    getMarkets('spot').then(setMarkets).catch(() => setMarkets([]))
  }, [])

  const rows = useMemo<Row[]>(() => {
    return (tokens ?? []).map((token) => {
      const a = token.token_address.toLowerCase()
      const mine = markets.filter((m) => m.base.toLowerCase() === a || m.quote.toLowerCase() === a).sort((x, y) => y.trades_24h - x.trades_24h)
      const m = mine[0] ?? null
      if (!m) return { token, market: null, isBase: true, other: null, last: null, change: null, trades: 0, volume: 0 }
      const isBase = m.base.toLowerCase() === a
      const conv = (x: string | null) => (x ? (isBase ? n18(x) : inv(n18(x))) : null)
      const last = conv(m.last_price ?? m.amm_price ?? null)
      const open = conv(m.open_24h)
      return {
        token,
        market: m,
        isBase,
        other: isBase ? m.quote : m.base,
        last,
        change: last && open && Number(open) > 0 ? ((Number(last) / Number(open) - 1) * 100).toFixed(2) : null,
        trades: mine.reduce((s, x) => s + x.trades_24h, 0),
        volume: mine.reduce((s, x) => s + Number(x.base.toLowerCase() === a ? x.volume_24h : x.quote_volume_24h), 0),
      }
    })
  }, [tokens, markets])

  useEffect(() => {
    for (const r of rows) {
      if (!r.market || sparks[r.token.token_address]) continue
      getCandles(r.market.market, '1h', 24)
        .then((c) => setSparks((s) => ({ ...s, [r.token.token_address]: c.map((x) => (r.isBase ? Number(n18(x.close)) : Number(inv(n18(x.close)) ?? 0))) })))
        .catch(() => undefined)
    }
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const prices = useUsdPrices([...(tokens ?? []).map((t) => t.token_address), 'QRDX'])
  const sym = (a: string | null) => (!a ? '' : isNativeAsset(a) ? 'QRDX' : (tokens ?? []).find((t) => t.token_address.toLowerCase() === a.toLowerCase())?.symbol ?? a.slice(0, 8))
  const needle = q.trim().toLowerCase()
  const shown = rows
    .filter((r) => !needle || r.token.symbol.toLowerCase().includes(needle) || r.token.name.toLowerCase().includes(needle) || r.token.token_address.includes(needle))
    .sort((a, b) => b.trades - a.trades || b.volume - a.volume || b.token.created_height - a.token.created_height)
  const traded = rows.filter((r) => r.market).length

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <section className="hero-glow -mx-4 border-b px-4 pb-6 pt-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Native tokens</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tokens</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every token on QRDX is native: a registry entry and balances in the consensus ledger, tradable against QRDX and each other on the
          chain&apos;s order books and pools.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Tokens" value={tokens ? tokens.length : '—'} />
          <Tile label="With a market" value={tokens ? traded : '—'} />
          <Tile label="Spot markets" value={markets.length} />
          <Tile label="Trades, 24h" value={markets.reduce((s, m) => s + m.trades_24h, 0).toLocaleString()} />
        </div>
      </section>

      <Panel
        className="mt-6"
        title="All tokens"
        icon={<Coins className="h-4 w-4" />}
        right={
          <span className="flex items-center gap-2 rounded-md border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="h-7 w-40 bg-transparent text-sm outline-none" />
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b text-left">
                <th className="px-4 py-2.5 font-medium">Token</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 text-right font-medium">24h</th>
                <th className="px-3 py-2.5 font-medium">Last 24h</th>
                <th className="px-3 py-2.5 text-right font-medium">Market cap</th>
                <th className="px-3 py-2.5 text-right font-medium">Volume 24h</th>
                <th className="px-4 py-2.5 text-right font-medium">Supply</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const usd = usdOf(prices, r.token.token_address)
                const change = usd?.change24h ?? r.change
                return (
                  <tr key={r.token.token_address} className="border-b last:border-b-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/address/${r.token.token_address}`} className="flex items-center gap-3">
                        <TokenMark symbol={r.token.symbol} size={30} />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {r.token.symbol} {!r.token.mint_authority && <Pill className="ml-1">fixed</Pill>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{r.token.name}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {usd ? fmtUsd(Number(usd.price)) : r.last ? `${fmtNum(r.last, 8)} ${sym(r.other)}` : '—'}
                      {usd && r.last && <span className="block text-xs text-muted-foreground">{fmtNum(r.last, 8)} {sym(r.other)}</span>}
                    </td>
                    <td className={cn('px-3 py-2.5 text-right', toneOf(change))}>{fmtPct(change)}</td>
                    <td className="px-3 py-2.5">
                      <Sparkline points={sparks[r.token.token_address] ?? []} up={change === null ? undefined : Number(change) >= 0} />
                    </td>
                    <td className="px-3 py-2.5 text-right">{usd ? fmtCompact(Number(usd.price) * Number(r.token.total_supply), '$') : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {r.volume ? fmtCompact(r.volume) : '—'} <span className="text-xs text-muted-foreground">{r.volume ? r.token.symbol : ''}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtCompact(r.token.total_supply)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!tokens && <p className="py-10 text-center text-sm text-muted-foreground">Loading tokens…</p>}
        </div>
      </Panel>
    </div>
  )
}
