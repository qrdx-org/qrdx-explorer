'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { CandlestickChart, LineChart } from 'lucide-react'
import { getCandles, type MarketCandle } from '@/lib/qrdx/indexed'
import { getActiveNetwork } from '@/lib/qrdx/client'
import { inv, n18 } from '@/lib/math/decimal'
import { cn } from '@/lib/utils'

const INTERVALS = ['5m', '15m', '1h', '4h', '1d'] as const
const SECONDS: Record<string, number> = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }

export function cssColor(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return `rgba(128,128,128,${alpha})`
  const m = /([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(getComputedStyle(document.documentElement).getPropertyValue(name))
  if (!m) return `rgba(128,128,128,${alpha})`
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return `rgba(${f(0)},${f(8)},${f(4)},${alpha})`
}

interface Row {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Node candles in the requested orientation, continuous: quiet intervals carry the close. */
function orient(rows: MarketCandle[], invert: boolean, seconds: number): Row[] {
  const out: Row[] = []
  const val = (x: string) => Number(invert ? (inv(n18(x)) ?? '0') : n18(x))
  let prev: Row | null = null
  const end = Math.floor(Date.now() / 1000 / seconds) * seconds
  let i = 0
  if (!rows.length) return out
  for (let t = rows[0].time; t <= end && out.length < 5000; t += seconds) {
    const r = rows[i]
    if (r && r.time === t) {
      prev = invert
        ? { t, o: val(r.open), h: val(r.low), l: val(r.high), c: val(r.close), v: Number(r.quote_volume) }
        : { t, o: val(r.open), h: val(r.high), l: val(r.low), c: val(r.close), v: Number(r.volume) }
      out.push(prev)
      i++
    } else if (prev) out.push({ t, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0 })
    while (rows[i] && rows[i].time < t) i++
  }
  return out
}

function decimals(x: number): number {
  const a = Math.abs(x)
  if (!a) return 2
  if (a >= 1000) return 2
  if (a >= 1) return 4
  return Math.min(12, -Math.floor(Math.log10(a)) + 4)
}

/**
 * OHLCV from the node's market data (market_getCandles): every trade by block
 * time, book fills and pool swaps alike. `invert` shows the pair the other way
 * round (e.g. a token priced in QRDX when the node quotes QRDX per token).
 */
/** The trade API's candles in dollars (`?unit=usd`, qrdx-trade spotCandlesUsd), as chart rows. */
async function usdCandles(base: string, quote: string, interval: string): Promise<{ rows: Row[]; label: string } | null> {
  const api = getActiveNetwork().tradeApiUrl
  if (!api) return null
  const seg = (a: string) => (a.toUpperCase() === 'QRDX' ? 'qrdx' : a.toLowerCase())
  const res = await fetch(`${api}/markets/${seg(base)}/${seg(quote)}/candles?interval=${interval}&limit=300&unit=usd`, { cache: 'no-store' })
  if (!res.ok) return null
  const body = (await res.json()) as { kind: string; label: string; candles: { t: number; o: string; h: string; l: string; c: string; v: string }[] }
  if (body.kind === 'none') return null
  return { label: body.label, rows: body.candles.map((c) => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v })) }
}

export function PriceChart({
  market,
  invert = false,
  label,
  height = 320,
  usd,
}: {
  market: string
  invert?: boolean
  label: string
  height?: number
  /** The pair as a base and quote asset (token address or QRDX): offers the chart in dollars, from the trade API. */
  usd?: { base: string; quote: string; quoteSymbol: string }
}) {
  const [unit, setUnit] = useState<'quote' | 'usd'>('quote')
  const [usdLabel, setUsdLabel] = useState<string | null>(null)
  const [interval, setInterval_] = useState<(typeof INTERVALS)[number]>('1h')
  const [kind, setKind] = useState<'candles' | 'line'>('candles')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [hover, setHover] = useState<Row | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<{ c: ISeriesApi<'Candlestick'>; a: ISeriesApi<'Area'>; v: ISeriesApi<'Histogram'> } | null>(null)
  const byTime = useRef(new Map<number, Row>())
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let live = true
    setRows(null)
    const load = () =>
      unit === 'usd' && usd
        ? usdCandles(usd.base, usd.quote, interval).then((r) => {
            if (!live) return
            setUsdLabel(r?.label ?? null)
            setRows(r?.rows ?? [])
          })
        : getCandles(market, interval, 500).then((r) => live && setRows(orient(r, invert, SECONDS[interval])))
    load().catch(() => live && setRows([]))
    const t = setInterval(() => {
      load().catch(() => undefined)
    }, 30_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [market, interval, invert, unit, usd?.base, usd?.quote]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssColor('--muted-foreground'), fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: cssColor('--border', 0.45) }, horzLines: { color: cssColor('--border', 0.45) } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: cssColor('--muted-foreground', 0.5), style: LineStyle.Dashed, labelBackgroundColor: cssColor('--foreground') },
        horzLine: { color: cssColor('--muted-foreground', 0.5), style: LineStyle.Dashed, labelBackgroundColor: cssColor('--foreground') },
      },
      rightPriceScale: { borderColor: cssColor('--border') },
      timeScale: { borderColor: cssColor('--border'), timeVisible: true, secondsVisible: false },
    })
    const cs = c.addSeries(CandlestickSeries, { upColor: cssColor('--bid'), downColor: cssColor('--ask'), wickUpColor: cssColor('--bid'), wickDownColor: cssColor('--ask'), borderVisible: false })
    const as = c.addSeries(AreaSeries, { lineColor: cssColor('--primary'), topColor: cssColor('--primary', 0.25), bottomColor: cssColor('--primary', 0), lineWidth: 2, visible: false })
    const vs = c.addSeries(HistogramSeries, { priceScaleId: 'v', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('v').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    c.subscribeCrosshairMove((p) => setHover(typeof p.time === 'number' ? (byTime.current.get(p.time) ?? null) : null))
    chart.current = c
    series.current = { c: cs, a: as, v: vs }
    return () => {
      c.remove()
      chart.current = null
      series.current = null
    }
  }, [resolvedTheme])

  useEffect(() => {
    series.current?.c.applyOptions({ visible: kind === 'candles' })
    series.current?.a.applyOptions({ visible: kind === 'line' })
  }, [kind, resolvedTheme])

  useEffect(() => {
    const s = series.current
    if (!s || !rows) return
    byTime.current = new Map(rows.map((r) => [r.t, r]))
    const dp = decimals(rows[rows.length - 1]?.c ?? 1)
    const fmt = { type: 'price' as const, precision: dp, minMove: Math.pow(10, -dp) }
    s.c.applyOptions({ priceFormat: fmt })
    s.a.applyOptions({ priceFormat: fmt })
    s.c.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, open: r.o, high: r.h, low: r.l, close: r.c })))
    s.a.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, value: r.c })))
    s.v.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, value: r.v, color: r.c >= r.o ? cssColor('--bid', 0.3) : cssColor('--ask', 0.3) })))
    if (rows.length > 80) chart.current?.timeScale().fitContent()
    else {
      chart.current?.timeScale().applyOptions({ barSpacing: 9 })
      chart.current?.timeScale().scrollToRealTime()
    }
  }, [rows, resolvedTheme])

  const shown = hover ?? rows?.[rows.length - 1] ?? null
  const dp = decimals(shown?.c ?? 1)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
        {INTERVALS.map((i) => (
          <button key={i} onClick={() => setInterval_(i)} className={cn('rounded-md px-2 py-1 text-xs font-medium', i === interval ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {i}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <button aria-label="Candles" onClick={() => setKind('candles')} className={cn('rounded-md p-1.5', kind === 'candles' ? 'bg-accent' : 'text-muted-foreground')}>
          <CandlestickChart className="h-3.5 w-3.5" />
        </button>
        <button aria-label="Line" onClick={() => setKind('line')} className={cn('rounded-md p-1.5', kind === 'line' ? 'bg-accent' : 'text-muted-foreground')}>
          <LineChart className="h-3.5 w-3.5" />
        </button>
        {usd && usd.quoteSymbol.toUpperCase() !== 'USD' && (
          <div className="ml-1.5 flex rounded-md bg-muted p-0.5 text-[11px]" role="group" aria-label="Price in">
            {(
              [
                ['quote', usd.quoteSymbol],
                ['usd', 'USD'],
              ] as const
            ).map(([u, text]) => (
              <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={cn('rounded px-1.5 py-0.5 font-medium', unit === u ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                {text}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto truncate text-[11px] text-muted-foreground">{unit === 'usd' && usd ? (usdLabel ?? 'No USD price for this pair') : `${label} · node trades`}</span>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={box} className="absolute inset-0" />
        {shown && (
          <div className="num pointer-events-none absolute left-3 top-2 z-10 flex gap-3 text-[11px] text-muted-foreground">
            {(['o', 'h', 'l', 'c'] as const).map((k) => (
              <span key={k}>
                {k.toUpperCase()} <span className={shown.c >= shown.o ? 'text-bid' : 'text-ask'}>{shown[k].toFixed(dp)}</span>
              </span>
            ))}
          </div>
        )}
        {rows && !rows.length && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No trades on this market yet.</div>
        )}
        {!rows && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading chart…</div>}
      </div>
    </div>
  )
}
