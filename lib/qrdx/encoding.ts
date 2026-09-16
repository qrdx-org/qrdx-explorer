/**
 * Low-level encoding helpers shared by the QRDX decoders.
 *
 * Everything here is dependency-free except for the audited noble hash/curve
 * primitives, so it runs identically in the browser and in the Cloudflare
 * worker runtime.
 */

import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'

const HEX_RE = /^[0-9a-fA-F]*$/

export function strip0x(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
}

export function ensure0x(value: string): string {
  return value.startsWith('0x') ? value : `0x${value}`
}

export function isHex(value: string, byteLength?: number): boolean {
  const body = strip0x(value)
  if (body.length % 2 !== 0 || !HEX_RE.test(body)) return false
  return byteLength === undefined || body.length === byteLength * 2
}

export function hexToBytes(value: string): Uint8Array {
  const body = strip0x(value)
  if (body.length % 2 !== 0 || !HEX_RE.test(body)) {
    throw new Error('Invalid hex string')
  }
  const out = new Uint8Array(body.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(body.substr(i * 2, 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

export function bytesToBigInt(bytes: Uint8Array, littleEndian = false): bigint {
  let result = BigInt(0)
  const eight = BigInt(8)
  if (littleEndian) {
    for (let i = bytes.length - 1; i >= 0; i--) result = (result << eight) | BigInt(bytes[i])
  } else {
    for (let i = 0; i < bytes.length; i++) result = (result << eight) | BigInt(bytes[i])
  }
  return result
}

export function keccak256Hex(bytes: Uint8Array): string {
  return bytesToHex(keccak_256(bytes))
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

// ─── Base58 (Bitcoin alphabet, as used by the `base58` Python package) ─────────

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++

  let num = bytesToBigInt(bytes)
  const base = BigInt(58)
  let out = ''
  while (num > BigInt(0)) {
    const rem = Number(num % base)
    num = num / base
    out = B58_ALPHABET[rem] + out
  }
  return '1'.repeat(zeros) + out
}

// ─── Fixed-point amount formatting (no float rounding) ──────────────────────────

/**
 * Render an integer amount of base units as a decimal string.
 * e.g. formatUnits(1500000n, 6) === "1.5"
 */
export function formatUnits(amount: bigint | string | number, decimals: number): string {
  let value: bigint
  try {
    value = typeof amount === 'bigint' ? amount : BigInt(amount)
  } catch {
    return '0'
  }
  const negative = value < BigInt(0)
  if (negative) value = -value
  const base = BigInt(10) ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `.${fraction}` : ''}`
}

/** Parse a decimal string ("12.5") into integer base units. */
export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  const negative = trimmed.startsWith('-')
  const [whole, fraction = ''] = trimmed.replace(/^[-+]/, '').split('.')
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals)
  const result = BigInt(whole || '0') * BigInt(10) ** BigInt(decimals) + BigInt(padded || '0')
  return negative ? -result : result
}

// ─── Python literal parser ──────────────────────────────────────────────────────

/**
 * Parse a Python literal produced by `str(dict)` — the node stores PoS block
 * headers as `str(block.to_dict())`, which uses single quotes and
 * True/False/None rather than JSON syntax.
 *
 * Supports dicts, lists, tuples, sets, str/bytes literals, ints, floats,
 * True/False/None. Throws on anything else.
 */
export function parsePythonLiteral(source: string): unknown {
  let pos = 0

  const fail = (msg: string): never => {
    throw new Error(`Python literal parse error at ${pos}: ${msg}`)
  }

  const skipWs = () => {
    while (pos < source.length && /\s/.test(source[pos])) pos++
  }

  const parseString = (): string => {
    let prefix = ''
    while (/[bBrRuU]/.test(source[pos])) prefix += source[pos++].toLowerCase()
    const raw = prefix.includes('r')
    const quote = source[pos]
    if (quote !== "'" && quote !== '"') fail('expected quote')
    const triple = source.substr(pos, 3) === quote.repeat(3)
    const terminator = triple ? quote.repeat(3) : quote
    pos += terminator.length
    let out = ''
    while (pos < source.length) {
      if (source.startsWith(terminator, pos)) {
        pos += terminator.length
        return out
      }
      const ch = source[pos++]
      if (ch === '\\' && !raw) {
        const esc = source[pos++]
        switch (esc) {
          case 'n': out += '\n'; break
          case 't': out += '\t'; break
          case 'r': out += '\r'; break
          case '0': out += '\0'; break
          case '\\': out += '\\'; break
          case "'": out += "'"; break
          case '"': out += '"'; break
          case 'x': out += String.fromCharCode(parseInt(source.substr(pos, 2), 16)); pos += 2; break
          case 'u': out += String.fromCharCode(parseInt(source.substr(pos, 4), 16)); pos += 4; break
          case 'U': out += String.fromCodePoint(parseInt(source.substr(pos, 8), 16)); pos += 8; break
          case '\n': break
          default: out += '\\' + esc
        }
      } else {
        out += ch
      }
    }
    return fail('unterminated string')
  }

  const parseSequence = (close: string): unknown[] => {
    const items: unknown[] = []
    pos++ // opening bracket
    skipWs()
    while (source[pos] !== close) {
      items.push(parseValue())
      skipWs()
      if (source[pos] === ',') {
        pos++
        skipWs()
      } else if (source[pos] !== close) {
        fail(`expected ',' or '${close}'`)
      }
    }
    pos++
    return items
  }

  const parseDict = (): Record<string, unknown> | unknown[] => {
    pos++ // {
    skipWs()
    const out: Record<string, unknown> = {}
    const setItems: unknown[] = []
    let isSet = false
    while (source[pos] !== '}') {
      const key = parseValue()
      skipWs()
      if (source[pos] === ':') {
        pos++
        out[String(key)] = parseValue()
      } else {
        isSet = true
        setItems.push(key)
      }
      skipWs()
      if (source[pos] === ',') {
        pos++
        skipWs()
      } else if (source[pos] !== '}') {
        fail("expected ',' or '}'")
      }
    }
    pos++
    return isSet ? setItems : out
  }

  const parseValue = (): unknown => {
    skipWs()
    const ch = source[pos]
    if (ch === '{') return parseDict()
    if (ch === '[') return parseSequence(']')
    if (ch === '(') return parseSequence(')')
    if (ch === "'" || ch === '"' || (/[bBrRuU]/.test(ch) && /['"bBrR]/.test(source[pos + 1]))) {
      return parseString()
    }
    for (const [word, value] of [['True', true], ['False', false], ['None', null]] as const) {
      if (source.startsWith(word, pos)) {
        pos += word.length
        return value
      }
    }
    // Decimal('1.5') / datetime reprs are not expected, but degrade to a string.
    const callMatch = /^[A-Za-z_][\w.]*\(/.exec(source.slice(pos))
    if (callMatch) {
      const start = pos
      let depth = 0
      while (pos < source.length) {
        if (source[pos] === '(') depth++
        if (source[pos] === ')') {
          depth--
          if (depth === 0) { pos++; break }
        }
        pos++
      }
      return source.slice(start, pos)
    }
    const numMatch = /^[-+]?(\d[\d_]*)?(\.\d+)?([eE][-+]?\d+)?/.exec(source.slice(pos))
    if (numMatch && numMatch[0] && /\d/.test(numMatch[0])) {
      pos += numMatch[0].length
      const text = numMatch[0].replace(/_/g, '')
      return Number(text)
    }
    return fail(`unexpected token '${ch}'`)
  }

  const value = parseValue()
  skipWs()
  if (pos !== source.length) fail('trailing characters')
  return value
}
