/** Small exact helpers on decimal strings (node amounts have up to 18 places, market data more). */

const SCALE = 18n
const ONE = 10n ** SCALE

export function dec(v: string | number | null | undefined): bigint {
  if (v === null || v === undefined || v === '') return 0n
  let s = String(v).trim()
  if (/e/i.test(s)) s = Number(s).toFixed(18)
  const neg = s.startsWith('-')
  if (neg) s = s.slice(1)
  const [w, f = ''] = s.split('.')
  const n = BigInt(w || '0') * ONE + BigInt((f + '0'.repeat(18)).slice(0, 18) || '0')
  return neg ? -n : n
}

export function str(x: bigint): string {
  const neg = x < 0n
  const a = neg ? -x : x
  const w = a / ONE
  const f = (a % ONE).toString().padStart(18, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${w}${f ? '.' + f : ''}`
}

/** 1 / x at 18 places; null for zero. */
export function inv(x: string): string | null {
  const d = dec(x)
  return d === 0n ? null : str((ONE * ONE) / d)
}

/** A node decimal (up to 78 places) as an 18-place string. */
export const n18 = (x: string) => str(dec(x))
