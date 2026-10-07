import { cn } from '@/lib/utils'

/** A titled card, the explorer's basic surface. */
export function Panel({
  title,
  icon,
  right,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode
  icon?: React.ReactNode
  right?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {(title || right) && (
        <div className="flex min-h-12 items-center gap-2 border-b px-4 py-2">
          {icon && <span className="text-primary">{icon}</span>}
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function Tile({ label, value, sub, icon, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3.5', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      <div className="num mt-1 truncate text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('flex gap-0.5 overflow-x-auto border-b', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn('relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors', value === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {t.label}
          {value === t.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  )
}

export function Pill({ children, tone = 'muted', className }: { children: React.ReactNode; tone?: 'muted' | 'primary' | 'bid' | 'ask' | 'warn'; className?: string }) {
  const tones = {
    muted: 'border-border bg-muted text-muted-foreground',
    primary: 'border-primary/30 bg-primary/10 text-primary',
    bid: 'border-bid/30 bg-bid/10 text-bid',
    ask: 'border-ask/30 bg-ask/10 text-ask',
    warn: 'border-warn/30 bg-warn/10 text-warn',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>
}

export function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b px-4 py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="num min-w-0 truncate text-right">{children}</span>
    </div>
  )
}

/** A token's initials disc (native tokens have no logo registry on chain). */
export function TokenMark({ symbol, size = 36, className }: { symbol: string; size?: number; className?: string }) {
  let h = 0
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.32, background: symbol === 'QRDX' ? 'linear-gradient(135deg,#3b82f6,#1e3a8a)' : `hsl(${h} 55% 45%)` }}
    >
      {symbol.replace(/^[qw](?=[A-Z])/, '').slice(0, 3).toUpperCase()}
    </span>
  )
}

export function fmtNum(v: string | number | null | undefined, max = 4): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  const a = Math.abs(n)
  if (a !== 0 && a < 0.0001) return n.toPrecision(3)
  return n.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 2 : max })
}

export function fmtCompact(v: string | number | null | undefined, prefix = ''): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a === 0) return `${prefix}0`
  if (a >= 1e18) return `${n < 0 ? '-' : ''}${prefix}${a.toExponential(2)}`
  const [d, s] = a >= 1e15 ? [1e15, 'Q'] : a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, '']
  return `${n < 0 ? '-' : ''}${prefix}${(a / d).toFixed(a >= 1 ? 2 : 4)}${s}`
}

export function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return fmtCompact(v, '$')
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: a >= 1 ? 2 : a >= 0.01 ? 4 : 8, minimumFractionDigits: a >= 1 ? 2 : 0 })}`
}

export function fmtPct(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

export const toneOf = (v: string | number | null | undefined) =>
  v === null || v === undefined || Number(v) === 0 ? 'text-muted-foreground' : Number(v) > 0 ? 'text-bid' : 'text-ask'
