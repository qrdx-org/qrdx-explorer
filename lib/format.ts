/** Display formatting helpers. Timestamps are unix seconds unless stated otherwise. */

export function formatAddress(address: string | null | undefined, startChars = 6, endChars = 4): string {
  if (!address) return '—'
  if (address.length <= startChars + endChars + 3) return address
  return `${address.slice(0, startChars)}…${address.slice(-endChars)}`
}

export function formatHash(hash: string | null | undefined, startChars = 10, endChars = 8): string {
  return formatAddress(hash, startChars, endChars)
}

/**
 * "12s ago", "3h 4m ago". `precise` shows tenths of a second under a minute ("0.8s ago"),
 * for blocks that arrive four times a second.
 */
export function timeAgo(timestampSeconds: number | null | undefined, nowMs = Date.now(), precise = false): string {
  if (timestampSeconds == null) return '—'
  const exact = Math.max(0, nowMs / 1000 - timestampSeconds)
  if (precise && exact < 60) return `${exact.toFixed(1)}s ago`
  const diff = Math.floor(exact)
  if (diff < 60) return `${diff}s ago`
  const minutes = Math.floor(diff / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ago`
}

export function formatDateTime(timestampSeconds: number | null | undefined): string {
  if (timestampSeconds == null) return '—'
  return new Date(timestampSeconds * 1000).toLocaleString()
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** A duration in milliseconds: "250 ms", "1.25 s", "8 s", "4m 16s". */
export function formatMs(ms: number | null | undefined, digits = 0): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (Math.abs(ms) < 1000) return `${ms.toFixed(digits)} ms`
  if (Math.abs(ms) < 10_000) return `${(ms / 1000).toFixed(2).replace(/\.?0+$/, '')} s`
  if (Math.abs(ms) < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`
  return formatDuration(ms / 1000)
}

/** Format a decimal amount string without losing precision to floats. */
export function formatAmount(value: string | null | undefined, maxDecimals = 6): string {
  if (value == null || value === '') return '—'
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmedFraction = fraction.slice(0, maxDecimals).replace(/0+$/, '')
  const truncated = fraction.length > maxDecimals && /[1-9]/.test(fraction.slice(maxDecimals))
  if (!trimmedFraction && truncated && whole === '0') return `${negative ? '-' : ''}<0.${'0'.repeat(maxDecimals - 1)}1`
  return `${negative ? '-' : ''}${groupedWhole}${trimmedFraction ? `.${trimmedFraction}` : ''}`
}

export function formatQrdx(value: string | null | undefined, maxDecimals = 6): string {
  return value == null ? '—' : `${formatAmount(value, maxDecimals)} QRDX`
}

export function formatNumber(num: number | null | undefined, decimals = 2): string {
  if (num == null || !Number.isFinite(num)) return '—'
  const abs = Math.abs(num)
  if (abs >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`
  if (abs >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`
  if (abs >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`
  return Number.isInteger(num) ? num.toString() : num.toFixed(decimals)
}

export function formatInteger(num: number | null | undefined): string {
  return num == null || !Number.isFinite(num) ? '—' : Math.round(num).toLocaleString()
}

export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return '—'
  return amount >= 1000
    ? `$${formatNumber(amount, 2)}`
    : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
