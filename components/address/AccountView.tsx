'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, BarChart3, Coins, Gauge, Layers, ShieldCheck, Wallet } from 'lucide-react'
import ShareAddressDialog from '@/components/ShareAddressDialog'
import { Bars, type Bar } from '@/components/charts/Bars'
import { CopyButton } from '@/components/explorer/common'
import { useTokenMap, useUsdPrices, usdOf } from '@/components/explorer/data'
import { HistoryTable } from '@/components/explorer/HistoryTable'
import { Panel, Pill, Row, Tabs, Tile, fmtCompact, fmtNum, fmtUsd, toneOf } from '@/components/explorer/ui'
import { getAddress, type AddressSummary } from '@/lib/qrdx'
import {
  assetSymbol,
  getAddressHistory,
  getLpPositions,
  getPerpAccount,
  getSpotOrders,
  getTokenBalance,
  tradeLink,
  type IndexedTx,
  type LpPosition,
  type PerpAccount,
  type SpotOrder,
} from '@/lib/qrdx/indexed'
import { getKnownAddress } from '@/lib/known-addresses'
import { ClaimedPill, ProfileAvatar, ProfileLinks, TokenAvatar } from '@/components/profile/ProfileBits'
import { ProfileButton } from '@/components/profile/ProfileButton'
import { useProfile } from '@/lib/profiles/client'
import { cn } from '@/lib/utils'

const FORMAT: Record<string, string> = { pq: 'Post-quantum (ML-DSA-65)', evm: 'EVM account', legacy: 'Legacy UTXO' }

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k])
      }
    })
  )
  return out
}

type Tab = 'history' | 'tokens' | 'trading' | 'validator'

export function AccountView({ address }: { address: string }) {
  const known = getKnownAddress(address)
  const profile = useProfile('account', address)
  const tokens = useTokenMap()
  const [summary, setSummary] = useState<AddressSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balances, setBalances] = useState<{ token: string; balance: string }[] | null>(null)
  const [recent, setRecent] = useState<IndexedTx[] | null>(null)
  const [perp, setPerp] = useState<PerpAccount | null>(null)
  const [orders, setOrders] = useState<SpotOrder[]>([])
  const [lp, setLp] = useState<LpPosition[]>([])
  const [tab, setTab] = useState<Tab>('history')

  useEffect(() => {
    getAddress(address).then(setSummary, (e) => setError(e instanceof Error ? e.message : 'Could not load the address'))
    // Up to 500 recent entries for the activity chart and first/last seen.
    getAddressHistory(address, { limit: 500 })
      .then((p) => setRecent(p.transactions))
      .catch(() => setRecent([]))
    getPerpAccount(address).then(setPerp)
    getSpotOrders(address).then(setOrders)
    getLpPositions(address).then(setLp)
  }, [address])

  useEffect(() => {
    if (!tokens.size) return
    const list = [...tokens.keys()]
    mapLimit(list, 6, async (t) => ({ token: t, balance: await getTokenBalance(t, address).catch(() => '0') })).then((r) =>
      setBalances(r.filter((b) => Number(b.balance) > 0))
    )
  }, [tokens, address])

  const prices = useUsdPrices(['QRDX', ...(balances ?? []).map((b) => b.token)])
  const qrdxUsd = usdOf(prices, 'QRDX')
  const holdings = useMemo(() => {
    const rows = [
      ...(summary && Number(summary.balance) > 0 ? [{ asset: 'QRDX', balance: summary.balance }] : []),
      ...(balances ?? []).map((b) => ({ asset: b.token, balance: b.balance })),
    ].map((h) => {
      const p = usdOf(prices, h.asset)
      return { ...h, usd: p ? Number(h.balance) * Number(p.price) : null, change: p?.change24h ?? null }
    })
    return rows.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
  }, [summary, balances, prices])
  const totalUsd = holdings.reduce((s, h) => s + (h.usd ?? 0), 0)
  const perpEquityUsd = perp && qrdxUsd && perp.collateral_token.toUpperCase() === 'QRDX' ? Number(perp.equity) * Number(qrdxUsd.price) : null

  const activity = useMemo<Bar[]>(() => {
    const days = 30
    const now = Math.floor(Date.now() / 1000 / 86400)
    const buckets = Array.from({ length: days }, (_, i) => ({ day: now - days + 1 + i, ex: 0, tr: 0, evm: 0 }))
    for (const t of recent ?? []) {
      if (t.op === 'ORACLE_VOTE') continue
      const b = buckets.find((x) => x.day === Math.floor(t.timestamp / 86400))
      if (!b) continue
      if (t.kind === 'exchange') b.ex++
      else if (t.kind === 'evm') b.evm++
      else b.tr++
    }
    return buckets.map((b) => ({
      key: b.day,
      values: [
        { value: b.tr, className: 'fill-[hsl(var(--chart-3))]', label: 'Transfers' },
        { value: b.evm, className: 'fill-[hsl(var(--chart-2))]', label: 'EVM' },
        { value: b.ex, className: 'fill-[hsl(var(--chart-1))]', label: 'Exchange' },
      ],
      tooltip: `${new Date(b.day * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${b.ex} exchange · ${b.tr} transfers · ${b.evm} EVM`,
    }))
  }, [recent])

  const load = useCallback((q: { limit: number; cursor: string | null; kinds: string | null }) => getAddressHistory(address, q), [address])

  if (error && !summary) return <p className="py-16 text-center text-sm text-ask">{error}</p>
  const validator = summary?.validator
  const nonVote = (recent ?? []).filter((t) => t.op !== 'ORACLE_VOTE')
  const first = nonVote[nonVote.length - 1]
  const last = nonVote[0]
  const positions = Object.entries(perp?.positions ?? {}).filter(([, p]) => Number(p.size) !== 0)
  // Curated names win over what an owner says about themselves.
  const claimed = known ? null : profile?.profile ?? null
  const title = known?.name ?? claimed?.name ?? (validator ? 'Validator' : summary?.isContract ? 'Contract' : 'Account')

  return (
    <div className="space-y-6">
      <section className="hero-glow -mx-4 border-b px-4 pb-6 pt-2">
        <div className="flex flex-wrap items-center gap-4">
          <ProfileAvatar address={address} profile={known ? null : profile} size={56} fallbackImage={known?.image} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              {claimed && <ClaimedPill kind="account" />}
              {summary?.format && <Pill>{FORMAT[summary.format]}</Pill>}
              {validator && <Pill tone={validator.status === 'active' ? 'bid' : 'warn'}>{validator.status} validator</Pill>}
              {summary?.isContract && <Pill tone="primary">Contract</Pill>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 break-all font-mono text-xs text-muted-foreground">
              {address}
              <CopyButton value={address} />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ProfileButton kind="account" subject={address} signer={address} label="this address" profile={known ? null : profile} />
            <ShareAddressDialog address={address} />
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
            label="QRDX balance"
            icon={<Wallet className="h-4 w-4" />}
            value={summary ? `${fmtNum(summary.balance, 4)} QRDX` : '—'}
            sub={qrdxUsd && summary ? fmtUsd(Number(summary.balance) * Number(qrdxUsd.price)) : 'No USD price'}
          />
          <Tile
            label="Holdings"
            icon={<Coins className="h-4 w-4" />}
            value={totalUsd > 0 ? fmtUsd(totalUsd) : `${holdings.length} asset${holdings.length === 1 ? '' : 's'}`}
            sub={`${holdings.length} asset${holdings.length === 1 ? '' : 's'}${totalUsd > 0 ? ' at USD prices' : ''}`}
          />
          <Tile
            label="Activity"
            icon={<Activity className="h-4 w-4" />}
            value={recent ? `${nonVote.length >= 500 ? '500+' : nonVote.length}` : '—'}
            sub={last ? `last ${new Date(last.timestamp * 1000).toLocaleDateString()}` : 'transactions'}
          />
          {validator ? (
            <Tile label="Effective stake" icon={<ShieldCheck className="h-4 w-4" />} value={`${fmtCompact(validator.effectiveStake)} QRDX`} sub={`bonded ${fmtCompact(validator.stake)}`} />
          ) : (
            <Tile
              label="Perps equity"
              icon={<Gauge className="h-4 w-4" />}
              value={perp && Number(perp.equity) > 0 ? `${fmtNum(perp.equity, 2)} ${perp.collateral_token.toUpperCase() === 'QRDX' ? 'QRDX' : ''}` : '—'}
              sub={perpEquityUsd !== null && Number(perp?.equity) > 0 ? fmtUsd(perpEquityUsd) : `${positions.length} position${positions.length === 1 ? '' : 's'}`}
            />
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Activity, last 30 days" icon={<BarChart3 className="h-4 w-4" />} bodyClassName="p-4" right={
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <Legend className="bg-[hsl(var(--chart-1))]" label="Exchange" />
            <Legend className="bg-[hsl(var(--chart-2))]" label="EVM" />
            <Legend className="bg-[hsl(var(--chart-3))]" label="Transfers" />
          </span>
        }>
          {recent === null ? <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p> : <Bars bars={activity} height={150} unit="transactions a day" />}
        </Panel>
        <Panel title="Overview" icon={<Layers className="h-4 w-4" />}>
          <Row k="First seen">{first ? new Date(first.timestamp * 1000).toLocaleString() : '—'}</Row>
          <Row k="Last active">{last ? new Date(last.timestamp * 1000).toLocaleString() : '—'}</Row>
          {summary?.nonce !== null && summary?.nonce !== undefined && <Row k="Nonce">{summary.nonce}</Row>}
          <Row k="Open orders">{orders.length}</Row>
          <Row k="Liquidity positions">{lp.length}</Row>
          <Row k="Perps positions">{positions.length}</Row>
          {/^0xPQ/.test(address) && tradeLink(`/portfolio?address=${address}`) && (
            <Row k="Portfolio and PnL">
              <a href={tradeLink(`/portfolio?address=${address}`)!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                View on QRDX Trade
              </a>
            </Row>
          )}
        </Panel>
      </div>

      {holdings.length > 0 && (
        <Panel title="Holdings" icon={<Coins className="h-4 w-4" />} bodyClassName="p-4">
          {totalUsd > 0 && (
            <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
              {holdings
                .filter((h) => (h.usd ?? 0) > 0)
                .map((h, i) => (
                  <span
                    key={h.asset}
                    title={`${h.asset === 'QRDX' ? 'QRDX' : assetSymbol(h.asset, tokens)} ${((h.usd! / totalUsd) * 100).toFixed(1)}%`}
                    className="h-full"
                    style={{ width: `${(h.usd! / totalUsd) * 100}%`, background: `hsl(var(--chart-${(i % 3) + 1}))` }}
                  />
                ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {holdings.map((h) => {
              const sym = h.asset === 'QRDX' ? 'QRDX' : assetSymbol(h.asset, tokens)
              const body = (
                <>
                  <TokenAvatar address={h.asset === 'QRDX' ? null : h.asset} symbol={sym} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{sym}</span>
                    <span className="num block text-xs text-muted-foreground">{fmtNum(h.balance, 6)}</span>
                  </span>
                  <span className="num text-right text-sm">
                    {h.usd !== null ? fmtUsd(h.usd) : '—'}
                    {totalUsd > 0 && h.usd !== null && <span className="block text-[11px] text-muted-foreground">{((h.usd / totalUsd) * 100).toFixed(1)}%</span>}
                  </span>
                </>
              )
              return h.asset === 'QRDX' ? (
                <div key={h.asset} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  {body}
                </div>
              ) : (
                <Link key={h.asset} href={`/address/${h.asset}`} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/50">
                  {body}
                </Link>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel>
        <Tabs
          className="px-2"
          tabs={[
            { id: 'history' as Tab, label: 'Transactions' },
            { id: 'tokens' as Tab, label: `Tokens (${balances?.length ?? '…'})` },
            { id: 'trading' as Tab, label: `Trading (${orders.length + lp.length + positions.length})` },
            ...(validator ? [{ id: 'validator' as Tab, label: 'Validator' }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'history' && <HistoryTable load={load} address={address} />}
        {tab === 'tokens' && (
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">Token</th>
                  <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const sym = h.asset === 'QRDX' ? 'QRDX' : assetSymbol(h.asset, tokens)
                  const p = usdOf(prices, h.asset)
                  return (
                    <tr key={h.asset} className="border-b last:border-b-0 hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        {h.asset === 'QRDX' ? (
                          <span className="font-medium">QRDX</span>
                        ) : (
                          <Link href={`/address/${h.asset}`} className="font-medium text-primary hover:underline">
                            {sym} <span className="font-normal text-muted-foreground">{tokens.get(h.asset)?.name}</span>
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">{fmtNum(h.balance, 6)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {p ? fmtUsd(Number(p.price)) : '—'}
                        {p?.change24h != null && <span className={cn('ml-1.5 text-xs', toneOf(p.change24h))}>{Number(p.change24h).toFixed(2)}%</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">{h.usd !== null ? fmtUsd(h.usd) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {balances === null && <p className="py-8 text-center text-sm text-muted-foreground">Reading balances…</p>}
          </div>
        )}
        {tab === 'trading' && <Trading orders={orders} lp={lp} perp={perp} tokens={tokens} />}
        {tab === 'validator' && validator && (
          <div>
            <Row k="Status">{validator.status}</Row>
            <Row k="Bonded stake">{fmtNum(validator.stake)} QRDX</Row>
            <Row k="Effective stake">{fmtNum(validator.effectiveStake)} QRDX</Row>
            <Row k="Activation epoch">{validator.activationEpoch ?? '—'}</Row>
            <Row k="Exit epoch">{validator.exitEpoch ?? '—'}</Row>
            <Row k="Slashed">{validator.slashed ? 'Yes' : 'No'}</Row>
            <Row k="Public key">{validator.publicKeyBytes} bytes (ML-DSA-65)</Row>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-2 w-2 rounded-sm', className)} />
      {label}
    </span>
  )
}

function Trading({ orders, lp, perp, tokens }: { orders: SpotOrder[]; lp: LpPosition[]; perp: PerpAccount | null; tokens: Map<string, import('@/lib/qrdx/indexed').NativeToken> }) {
  const sym = (a: string) => assetSymbol(a, tokens)
  const positions = Object.entries(perp?.positions ?? {}).filter(([, p]) => Number(p.size) !== 0)
  const empty = !orders.length && !lp.length && !positions.length && !(perp && Number(perp.equity) > 0)
  if (empty) return <p className="py-10 text-center text-sm text-muted-foreground">No open orders, liquidity or perps positions.</p>
  return (
    <div className="divide-y">
      {perp && Number(perp.equity) > 0 && (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Tile label="Perps equity" value={fmtNum(perp.equity, 2)} sub={perp.collateral_token || 'collateral'} />
          <Tile label="Collateral" value={fmtNum(perp.collateral, 2)} />
          <Tile label="Free" value={fmtNum(perp.withdrawable, 2)} />
          <Tile label="Maintenance" value={fmtNum(perp.maintenance_margin, 2)} />
        </div>
      )}
      {positions.map(([id, p]) => (
        <div key={id} className="num flex flex-wrap items-center gap-4 px-4 py-2.5 text-sm">
          <span className="font-medium">{id}</span>
          <Pill tone={Number(p.size) > 0 ? 'bid' : 'ask'}>
            {Number(p.size) > 0 ? 'Long' : 'Short'} {fmtNum(p.leverage, 1)}×
          </Pill>
          <span>size {fmtNum(p.size.replace('-', ''))}</span>
          <span className="text-muted-foreground">entry {fmtNum(p.entry_price, 2)} · mark {fmtNum(p.mark_price, 2)}</span>
          <span className={cn('ml-auto font-medium', toneOf(p.unrealized_pnl))}>{fmtNum(p.unrealized_pnl, 2)} uPnL</span>
        </div>
      ))}
      {orders.map((o) => {
        const [a, b] = o.pair.split(':')
        return (
          <div key={o.order_id} className="num flex flex-wrap items-center gap-4 px-4 py-2.5 text-sm">
            <span className="font-medium">
              {sym(a)}/{sym(b)}
            </span>
            <Pill tone={o.side === 'buy' ? 'bid' : 'ask'}>{o.side} limit</Pill>
            <span>
              {fmtNum(o.amount)} at {fmtNum(o.price, 8)}
            </span>
            <span className="ml-auto text-muted-foreground">filled {fmtNum(o.filled)}</span>
          </div>
        )
      })}
      {lp.map((p) => (
        <div key={p.position_id} className="num flex flex-wrap items-center gap-4 px-4 py-2.5 text-sm">
          <span className="font-medium">
            {sym(p.token0)}/{sym(p.token1)}
          </span>
          <Pill tone={p.in_range ? 'bid' : 'warn'}>{p.in_range ? 'in range' : 'out of range'}</Pill>
          <span>
            {fmtNum(p.amount0)} {sym(p.token0)} + {fmtNum(p.amount1)} {sym(p.token1)}
          </span>
          <span className="ml-auto text-muted-foreground">
            fees {fmtNum(p.fees0)} / {fmtNum(p.fees1)}
          </span>
        </div>
      ))}
    </div>
  )
}
