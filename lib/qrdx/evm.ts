/**
 * Decoder for raw signed EVM transactions as they appear in a block's
 * `evm_transactions` section (hex RLP, see qrdx/contracts/evm_block.py).
 *
 * The node only persists these raw payloads — it does not index EVM
 * transactions by hash once they are included in a block — so the explorer
 * recovers sender, recipient, value and hash locally.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToBigInt, bytesToHex, hexToBytes, keccak256Hex } from './encoding'

type RlpItem = Uint8Array | RlpItem[]

export function rlpDecode(input: Uint8Array): RlpItem {
  const [item, consumed] = decodeItem(input, 0)
  if (consumed !== input.length) throw new Error('RLP: trailing bytes')
  return item
}

function readLength(input: Uint8Array, offset: number, lenOfLen: number): number {
  if (offset + lenOfLen > input.length) throw new Error('RLP: truncated length')
  let len = 0
  for (let i = 0; i < lenOfLen; i++) len = len * 256 + input[offset + i]
  return len
}

function decodeItem(input: Uint8Array, offset: number): [RlpItem, number] {
  if (offset >= input.length) throw new Error('RLP: out of range')
  const prefix = input[offset]

  if (prefix < 0x80) return [input.subarray(offset, offset + 1), offset + 1]

  if (prefix <= 0xb7) {
    const len = prefix - 0x80
    const end = offset + 1 + len
    if (end > input.length) throw new Error('RLP: truncated string')
    return [input.subarray(offset + 1, end), end]
  }

  if (prefix <= 0xbf) {
    const lenOfLen = prefix - 0xb7
    const len = readLength(input, offset + 1, lenOfLen)
    const start = offset + 1 + lenOfLen
    if (start + len > input.length) throw new Error('RLP: truncated string')
    return [input.subarray(start, start + len), start + len]
  }

  let start: number
  let len: number
  if (prefix <= 0xf7) {
    len = prefix - 0xc0
    start = offset + 1
  } else {
    const lenOfLen = prefix - 0xf7
    len = readLength(input, offset + 1, lenOfLen)
    start = offset + 1 + lenOfLen
  }
  const end = start + len
  if (end > input.length) throw new Error('RLP: truncated list')
  const items: RlpItem[] = []
  let cursor = start
  while (cursor < end) {
    const [item, next] = decodeItem(input, cursor)
    items.push(item)
    cursor = next
  }
  return [items, end]
}

function rlpEncode(item: RlpItem): Uint8Array {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && item[0] < 0x80) return item
    return concat(encodeLength(item.length, 0x80), item)
  }
  const payload = concat(...item.map(rlpEncode))
  return concat(encodeLength(payload.length, 0xc0), payload)
}

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) return Uint8Array.of(offset + len)
  const bytes: number[] = []
  let n = len
  while (n > 0) {
    bytes.unshift(n & 0xff)
    n = Math.floor(n / 256)
  }
  return Uint8Array.of(offset + 55 + bytes.length, ...bytes)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

function asBytes(item: RlpItem | undefined): Uint8Array {
  if (!(item instanceof Uint8Array)) throw new Error('RLP: expected byte string')
  return item
}

function asInt(item: RlpItem | undefined): bigint {
  return bytesToBigInt(asBytes(item))
}

function intToMinimalBytes(value: bigint): Uint8Array {
  if (value === BigInt(0)) return new Uint8Array(0)
  let hex = value.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return hexToBytes(hex)
}

export interface DecodedEvmTx {
  hash: string
  type: number
  chainId: bigint | null
  nonce: bigint
  gasPrice: bigint
  maxPriorityFeePerGas: bigint | null
  gasLimit: bigint
  from: string | null
  to: string | null
  value: bigint
  input: string
  /** Contract address that a creation tx deploys to (CREATE: keccak(rlp([sender, nonce]))). */
  createdContract: string | null
  raw: string
}

function addressFromPublicKey(uncompressed: Uint8Array): string {
  return `0x${bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(-20))}`
}

function recoverSender(msgHash: Uint8Array, r: bigint, s: bigint, recovery: number): string | null {
  try {
    const sig = new secp256k1.Signature(r, s).addRecoveryBit(recovery)
    const point = sig.recoverPublicKey(msgHash)
    return addressFromPublicKey(point.toBytes(false))
  } catch {
    return null
  }
}

function contractAddress(sender: string, nonce: bigint): string {
  const encoded = rlpEncode([hexToBytes(sender), intToMinimalBytes(nonce)])
  return `0x${keccak256Hex(encoded).slice(-40)}`
}

/** Decode a raw signed EVM transaction (legacy / EIP-2930 / EIP-1559). */
export function decodeEvmTransaction(rawHex: string): DecodedEvmTx {
  const raw = hexToBytes(rawHex)
  if (raw.length === 0) throw new Error('Empty EVM transaction')
  const hash = `0x${keccak256Hex(raw)}`

  let type = 0
  let fields: RlpItem[]
  if (raw[0] <= 0x7f) {
    type = raw[0]
    const decoded = rlpDecode(raw.subarray(1))
    if (!Array.isArray(decoded)) throw new Error('Typed tx payload is not a list')
    fields = decoded
  } else {
    const decoded = rlpDecode(raw)
    if (!Array.isArray(decoded)) throw new Error('Legacy tx is not a list')
    fields = decoded
  }

  let chainId: bigint | null = null
  let nonce: bigint
  let gasPrice: bigint
  let maxPriorityFeePerGas: bigint | null = null
  let gasLimit: bigint
  let toBytes: Uint8Array
  let value: bigint
  let data: Uint8Array
  let recovery: number
  let r: bigint
  let s: bigint
  let signingPayload: Uint8Array

  if (type === 0) {
    if (fields.length !== 9) throw new Error('Legacy tx must have 9 fields')
    nonce = asInt(fields[0])
    gasPrice = asInt(fields[1])
    gasLimit = asInt(fields[2])
    toBytes = asBytes(fields[3])
    value = asInt(fields[4])
    data = asBytes(fields[5])
    const v = asInt(fields[6])
    r = asInt(fields[7])
    s = asInt(fields[8])
    if (v >= BigInt(35)) {
      chainId = (v - BigInt(35)) / BigInt(2)
      recovery = Number(v - (chainId * BigInt(2) + BigInt(35)))
      signingPayload = rlpEncode([
        ...fields.slice(0, 6),
        intToMinimalBytes(chainId),
        new Uint8Array(0),
        new Uint8Array(0),
      ])
    } else {
      recovery = Number(v - BigInt(27))
      signingPayload = rlpEncode(fields.slice(0, 6))
    }
  } else if (type === 1 || type === 2) {
    const expected = type === 1 ? 11 : 12
    if (fields.length !== expected) throw new Error(`Type ${type} tx must have ${expected} fields`)
    chainId = asInt(fields[0])
    nonce = asInt(fields[1])
    if (type === 1) {
      gasPrice = asInt(fields[2])
      gasLimit = asInt(fields[3])
      toBytes = asBytes(fields[4])
      value = asInt(fields[5])
      data = asBytes(fields[6])
    } else {
      maxPriorityFeePerGas = asInt(fields[2])
      gasPrice = asInt(fields[3]) // maxFeePerGas
      gasLimit = asInt(fields[4])
      toBytes = asBytes(fields[5])
      value = asInt(fields[6])
      data = asBytes(fields[7])
    }
    const sigStart = fields.length - 3
    recovery = Number(asInt(fields[sigStart]))
    r = asInt(fields[sigStart + 1])
    s = asInt(fields[sigStart + 2])
    signingPayload = concat(Uint8Array.of(type), rlpEncode(fields.slice(0, sigStart)))
  } else {
    throw new Error(`Unsupported EVM transaction type ${type}`)
  }

  const from = recovery === 0 || recovery === 1
    ? recoverSender(keccak_256(signingPayload), r, s, recovery)
    : null
  const to = toBytes.length === 20 ? `0x${bytesToHex(toBytes)}` : null

  return {
    hash,
    type,
    chainId,
    nonce,
    gasPrice,
    maxPriorityFeePerGas,
    gasLimit,
    from,
    to,
    value,
    input: `0x${bytesToHex(data)}`,
    createdContract: !to && from ? contractAddress(from, nonce) : null,
    raw: rawHex.startsWith('0x') ? rawHex : `0x${rawHex}`,
  }
}
