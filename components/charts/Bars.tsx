'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface Bar {
  key: string | number
  /** Stacked segments, bottom first. */
  values: { value: number; className: string; label: string }[]
  tooltip: string
}

/**
 * A small SVG bar chart in the theme's colours: block times, activity per hour.
 * Hovering a bar shows its tooltip above the chart.
 */
export function Bars({ bars, height = 120, className, unit }: { bars: Bar[]; height?: number; className?: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1e-9, ...bars.map((b) => b.values.reduce((s, v) => s + v.value, 0)))
  const w = 100 / Math.max(1, bars.length)
  return (
    <div className={cn('relative', className)}>
      <div className="mb-1 h-4 text-[11px] text-muted-foreground">{hover !== null ? bars[hover]?.tooltip : unit ? `max ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}` : ''}</div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {bars.map((b, i) => {
          let y = height
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)}>
              <rect x={i * w} y={0} width={w} height={height} className="fill-transparent" />
              {b.values.map((v, j) => {
                const h = (v.value / max) * (height - 2)
                y -= h
                return <rect key={j} x={i * w + w * 0.15} y={y} width={w * 0.7} height={Math.max(0, h)} rx={0.6} className={cn(v.className, hover !== null && hover !== i && 'opacity-50')} />
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** A tiny trend line for table rows. */
export function Sparkline({ points, className, up }: { points: number[]; className?: string; up?: boolean }) {
  if (points.length < 2) return <span className={cn('inline-block h-6 w-20', className)} />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 80},${22 - ((p - min) / span) * 20}`).join(' ')
  return (
    <svg viewBox="0 0 80 24" className={cn('h-6 w-20', className)}>
      <polyline points={d} fill="none" strokeWidth={1.5} className={up === undefined ? 'stroke-primary' : up ? 'stroke-bid' : 'stroke-ask'} />
    </svg>
  )
}
