'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, BarChart3, Coins, Droplets, ExternalLink, Info, ListOrdered } from 'lucide-react'
import { PriceChart } from '@/components/charts/PriceChart'
import { AddressLink, BlockLink, CopyButton, TimeAgo, TxLink } from '@/components/explorer/common'
import { useTokenMap, useUsdPrices, usdOf } from '@/components/explorer/data'
import { Panel, Pill, Row, Tile, fmtCompact, fmtNum, fmtPct, fmtUsd, toneOf } from '@/components/explorer/ui'
import {
  assetSymbol,
  getMarkets,
  getPools,
  getTrades,
  isNativeAsset,
  tradeLink,
  type MarketTrade,
  type NativeToken,
  type SpotPool,
  type Ticker,
} from '@/lib/qrdx/indexed'
import { inv, n18 } from '@/lib/math/decimal'
import { cn } from '@/lib/utils'
import { ClaimedPill, ProfileLinks, TokenImage } from '@/components/profile/ProfileBits'
import { ProfileButton } from '@/components/profile/ProfileButton'
import { useProfile } from '@/lib/profiles/client'

/** A market seen from the token: its price in the other asset, oriented so the token is the base. */
function view(t: Ticker, token: string) {
  const isBase = t.base.toLowerCase() === token
  const other = isBase ? t.quote : t.base
  const price = (x: string | null) => (x ? (isBase ? n18(x) : inv(n18(x))) : null)
  const last = price(t.last_price ?? t.amm_price ?? null)
  const open = price(t.open_24h)
  const change = last && open && Number(open) > 0 ? ((Number(last) / Number(open) - 1) * 100).toFixed(2) : null
  return {
    t,
    isBase,
    other,
    last,
    change,
    /** volume in the token's own units */
    volume: isBase ? n18(t.volume_24h) : n18(t.quote_volume_24h),
    trades: t.trades_24h,
  }
}

export function TokenView({ token }: { token: NativeToken }) {
  const addr = token.token_address.toLowerCase()
  const profile = useProfile('token', addr)
  const claimed = profile?.profile ?? null
  const tokens = useTokenMap()
  const [markets, setMarkets] = useState<Ticker[] | null>(null)
  const [pools, setPools] = useState<SpotPool[] | null>(null)
  const [trades, setTrades] = useState<MarketTrade[] | null>(null)

  useEffect(() => {
    getMarkets('spot')
      .then((m) => setMarkets(m.filter((t) => t.base.toLowerCase() === addr || t.quote.toLowerCase() === addr)))
      .catch(() => setMarkets([]))
    getPools(addr).then(setPools).catch(() => setPools([]))
  }, [addr])

  const views = useMemo(() => (markets ?? []).map((t) => view(t, addr)).sort((a, b) => b.trades - a.trades || Number(b.volume) - Number(a.volume)), [markets, addr])
  const main = views[0]
  useEffect(() => {
    if (!main) return
    getTrades(main.t.market, 50).then(setTrades).catch(() => setTrades([]))
  }, [main?.t.market]) // eslint-disable-line react-hooks/exhaustive-deps

  const prices = useUsdPrices([addr, ...views.map((v) => v.other)])
  const usd = usdOf(prices, addr)
  const supply = Number(token.total_supply)
  const mcap = usd ? supply * Number(usd.price) : null
  const sym = (a: string) => assetSymbol(a, tokens)
  const trade = main ? tradeLink(`/trade/${addr}/${isNativeAsset(main.other) ? 'qrdx' : main.other.toLowerCase()}`) : null
  const ext = Object.keys(token.extensions ?? {})

  return (
    <div className="space-y-6">
      <section className="hero-glow -mx-4 border-b px-4 pb-6 pt-2">
        <div className="flex flex-wrap items-center gap-4">
          <TokenImage symbol={token.symbol} profile={profile} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{token.name}</h1>
              <span className="text-lg text-muted-foreground">{token.symbol}</span>
              <Pill tone="primary">
                <Coins className="h-3 w-3" /> Native token
              </Pill>
              {token.mint_authority ? <Pill tone="warn">Mintable</Pill> : <Pill tone="bid">Fixed supply</Pill>}
              {token.freeze_authority && <Pill tone="warn">Freezable</Pill>}
              {claimed && <ClaimedPill kind="token" />}
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              {addr}
              <CopyButton value={addr} />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ProfileButton kind="token" subject={addr} signer={token.creator || null} label={token.symbol} profile={profile} />
            {trade && (
              <a href={trade} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                Trade {token.symbol} <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        {claimed && (claimed.description || claimed.website || claimed.x || claimed.telegram || claimed.github || claimed.discord) && (
          <div className="mt-4 max-w-3xl space-y-2.5">
            {claimed.description && <p className="whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{claimed.description}</p>}
            <ProfileLinks profile={claimed} />
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            label="Price"
            value={usd ? fmtUsd(Number(usd.price)) : main?.last ? `${fmtNum(main.last, 8)} ${sym(main.other)}` : '—'}
            sub={
              usd ? (
                <span className={toneOf(usd.change24h)}>{usd.change24h !== null ? `${fmtPct(usd.change24h)} 24h` : usd.source === 'route' ? 'via pools' : usd.source}</span>
              ) : main?.change ? (
                <span className={toneOf(main.change)}>{fmtPct(main.change)} 24h</span>
              ) : (
                'No USD price'
              )
            }
          />
          <Tile label="Market cap" value={mcap !== null ? fmtCompact(mcap, '$') : '—'} sub={usd ? 'price × total supply' : 'needs a USD price'} />
          <Tile label="Total supply" value={fmtCompact(token.total_supply)} sub={token.max_supply ? `max ${fmtCompact(token.max_supply)}` : token.mint_authority ? 'no cap' : 'fixed forever'} />
          <Tile
            label="24h volume"
            value={views.length ? `${fmtCompact(views.reduce((s, v) => s + Number(v.volume), 0))} ${token.symbol}` : '—'}
            sub={`${views.reduce((s, v) => s + v.trades, 0)} trades · ${views.length} market${views.length === 1 ? '' : 's'}`}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title={main ? `${token.symbol}/${sym(main.other)}` : 'Price'}
          icon={<BarChart3 className="h-4 w-4" />}
          right={main && main.change !== null ? <span className={cn('num text-sm font-medium', toneOf(main.change))}>{fmtPct(main.change)}</span> : null}
        >
          {main ? (
            <PriceChart market={main.t.market} invert={!main.isBase} label={`${token.symbol} in ${sym(main.other)}`} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">{markets === null ? 'Loading markets…' : `${token.symbol} has no market yet.`}</p>
          )}
        </Panel>

        <Panel title="Token" icon={<Info className="h-4 w-4" />}>
          <Row k="Symbol">{token.symbol}</Row>
          <Row k="Decimals">{token.decimals}</Row>
          <Row k="Total supply">{fmtNum(token.total_supply, 6)}</Row>
          <Row k="Max supply">{token.max_supply ? fmtNum(token.max_supply, 6) : 'None'}</Row>
          <Row k="Mint authority">{token.mint_authority ? <AddressLink address={token.mint_authority} /> : 'Renounced'}</Row>
          <Row k="Freeze authority">{token.freeze_authority ? <AddressLink address={token.freeze_authority} /> : 'None'}</Row>
          <Row k="Creator">
            <AddressLink address={token.creator} />
          </Row>
          <Row k="Created">
            <BlockLink height={token.created_height} className="text-sm" />
          </Row>
          {token.frozen_accounts !== undefined && <Row k="Frozen accounts">{token.frozen_accounts}</Row>}
          <Row k="Extensions">{ext.length ? ext.join(', ') : 'None'}</Row>
        </Panel>
      </div>

      <Panel title="Markets" icon={<ListOrdered className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">Prices are of 1 {token.symbol}</span>}>
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b text-left">
                <th className="px-4 py-2.5 font-medium">Pair</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 text-right font-medium">≈ USD</th>
                <th className="px-3 py-2.5 text-right font-medium">24h</th>
                <th className="px-3 py-2.5 text-right font-medium">24h volume</th>
                <th className="px-3 py-2.5 text-right font-medium">Trades</th>
                <th className="px-4 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {views.map((v) => {
                const ou = usdOf(prices, v.other)
                const link = tradeLink(`/trade/${addr}/${isNativeAsset(v.other) ? 'qrdx' : v.other.toLowerCase()}`)
                return (
                  <tr key={v.t.market} className="border-b last:border-b-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium">
                        <TokenImage symbol={token.symbol} profile={profile} size={20} />
                        {token.symbol}/
                        {isNativeAsset(v.other) ? (
                          'QRDX'
                        ) : (
                          <Link href={`/address/${v.other}`} className="text-primary hover:underline">
                            {sym(v.other)}
                          </Link>
                        )}
                        {(v.t.pools ?? 0) > 0 && <Pill>{v.t.pools} pool{v.t.pools === 1 ? '' : 's'}</Pill>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {v.last ? fmtNum(v.last, 8) : '—'} <span className="text-muted-foreground">{sym(v.other)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{ou && v.last ? fmtUsd(Number(v.last) * Number(ou.price)) : '—'}</td>
                    <td className={cn('px-3 py-2.5 text-right', toneOf(v.change))}>{fmtPct(v.change)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {fmtCompact(v.volume)} <span className="text-muted-foreground">{token.symbol}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{v.trades}</td>
                    <td className="px-4 py-2.5 text-right">
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Trade <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {markets && !views.length && <p className="py-8 text-center text-sm text-muted-foreground">No market trades {token.symbol} yet.</p>}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Pools" icon={<Droplets className="h-4 w-4" />}>
          {(pools ?? []).map((p) => {
            const other = p.token0.toLowerCase() === addr ? p.token1 : p.token0
            const price = p.token0.toLowerCase() === addr ? n18(p.price) : inv(n18(p.price))
            return (
              <div key={p.pool_id} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
                <span className="font-medium">
                  {token.symbol}/{sym(other)}
                </span>
                <Pill>{(Number(p.fee_rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%</Pill>
                {p.paused && <Pill tone="warn">paused</Pill>}
                <span className="num ml-auto text-right text-muted-foreground">
                  {fmtNum(price, 8)} {sym(other)} · {p.positions} position{p.positions === 1 ? '' : 's'}
                </span>
              </div>
            )
          })}
          {pools && !pools.length && <p className="py-8 text-center text-sm text-muted-foreground">No pools.</p>}
          {!pools && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        </Panel>

        <Panel title={main ? `Recent trades · ${token.symbol}/${sym(main.other)}` : 'Recent trades'} icon={<ListOrdered className="h-4 w-4" />} bodyClassName="max-h-[420px] overflow-y-auto">
          {(trades ?? []).map((t) => {
            const buy = main!.isBase ? t.side === 'buy' : t.side === 'sell'
            const price = main!.isBase ? n18(t.price) : inv(n18(t.price))
            const amount = main!.isBase ? n18(t.amount) : n18(t.quote_amount)
            return (
              <div key={t.seq} className="num flex items-center gap-3 border-b px-4 py-2 text-xs last:border-b-0">
                <span className={cn('w-8 font-semibold uppercase', buy ? 'text-bid' : 'text-ask')}>{buy ? 'Buy' : 'Sell'}</span>
                <span className="w-28 text-right">{fmtNum(amount, 4)}</span>
                <span className="text-muted-foreground">at</span>
                <span className="w-28">{fmtNum(price, 8)}</span>
                <Pill>{t.venue === 'amm' ? 'pool' : t.venue === 'clob' ? 'book' : t.venue}</Pill>
                <span className="ml-auto text-muted-foreground">{t.tx_hash ? <TxLink hash={t.tx_hash} /> : null}</span>
                <span className="w-16 text-right text-muted-foreground">
                  <TimeAgo timestamp={Math.floor(t.block_time)} />
                </span>
              </div>
            )
          })}
          {trades && !trades.length && <p className="py-8 text-center text-sm text-muted-foreground">No trades yet.</p>}
          {!main && <p className="py-8 text-center text-sm text-muted-foreground">No market yet.</p>}
        </Panel>
      </div>
    </div>
  )
}
