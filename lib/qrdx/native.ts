/**
 * Decoders for the node's native (non-EVM) transaction and block payloads.
 *
 * Mirrors:
 *   - qrdx/transactions/transaction.py      Transaction.from_hex (versions 1–3)
 *   - qrdx/transactions/coinbase_transaction.py
 *   - qrdx/validator/genesis_init.py         JSON genesis allocation records
 *   - qrdx/manager.py                        split_block_content (legacy PoW header)
 *   - qrdx/validator/manager.py              Block.to_dict (PoS header, stored as Python repr)
 */

import {
  base58Encode,
  bytesToBigInt,
  bytesToHex,
  hexToBytes,
  isHex,
  parsePythonLiteral,
  sha256Hex,
} from './encoding'

/** 1 QRDX = 10^6 native base units (SMALLEST in qrdx/constants.py). */
export const NATIVE_DECIMALS = 6
/** EVM/account-state balances are denominated in wei (10^18). */
export const EVM_DECIMALS = 18

class ByteReader {
  private offset = 0
  constructor(private readonly bytes: Uint8Array) {}

  read(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new Error('Unexpected end of data')
    const out = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return out
  }

  readUint(length: number): number {
    return Number(bytesToBigInt(this.read(length), true))
  }

  get remaining(): number {
    return this.bytes.length - this.offset
  }
}

function pointBytesToAddress(bytes: Uint8Array): string {
  // bytes_to_string(): 64-byte points are rendered as hex, 33-byte compressed as base58.
  return bytes.length === 64 ? bytesToHex(bytes) : base58Encode(bytes)
}

export interface NativeTxInput {
  txHash: string
  index: number
}

export interface NativeTxOutput {
  address: string
  /** Base units (10^-6 QRDX). */
  amount: bigint
}

export type NativeTransaction =
  | {
      kind: 'coinbase'
      hash: string
      version: number
      blockHash: string
      outputs: NativeTxOutput[]
    }
  | {
      kind: 'transfer'
      hash: string
      version: number
      inputs: NativeTxInput[]
      outputs: NativeTxOutput[]
      message: string | null
      signatureCount: number
    }
  | {
      kind: 'genesis'
      hash: string
      genesisType: 'genesis_allocation' | 'genesis_system_wallet' | string
      recipient: string
      /** Base units (10^-6 QRDX). */
      amount: bigint
      label: string | null
      controller: string | null
      category: string | null
      index: number
    }

function decimalToBaseUnits(value: string, decimals: number): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole || '0') * BigInt(10) ** BigInt(decimals) +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

/**
 * Genesis records are stored as JSON with a deterministic hash derived from
 * `genesis[:system]:{index}:{recipient}:{amount}` (see genesis_init.py). The
 * node stores that hash as a raw BLOB, so REST lookups by hash cannot find it —
 * we recompute it here.
 */
function decodeGenesisRecord(payload: string): NativeTransaction | null {
  let record: Record<string, unknown>
  try {
    record = JSON.parse(payload)
  } catch {
    return null
  }
  if (!record || typeof record !== 'object' || typeof record.type !== 'string') return null
  if (!String(record.type).startsWith('genesis')) return null

  const recipient = String(record.recipient ?? '')
  const amount = String(record.amount ?? '0')
  const index = Number(record.index ?? 0)
  const preimage = record.type === 'genesis_system_wallet'
    ? `genesis:system:${index}:${recipient}:${amount}`
    : `genesis:${index}:${recipient}:${amount}`

  return {
    kind: 'genesis',
    hash: sha256Hex(new TextEncoder().encode(preimage)),
    genesisType: record.type,
    recipient,
    amount: decimalToBaseUnits(amount, NATIVE_DECIMALS),
    label: (record.label as string) ?? (record.name as string) ?? null,
    controller: (record.controller as string) ?? null,
    category: (record.category as string) ?? null,
    index,
  }
}

/** Decode a native transaction as stored in the node's `transactions.tx_hex` column. */
export function decodeNativeTransaction(txHex: string): NativeTransaction {
  const trimmed = txHex.trim()
  if (trimmed.startsWith('{')) {
    const genesis = decodeGenesisRecord(trimmed)
    if (genesis) return genesis
    throw new Error('Unrecognised JSON transaction record')
  }
  if (!isHex(trimmed)) throw new Error('Transaction payload is not hex')

  const reader = new ByteReader(hexToBytes(trimmed))
  const version = reader.readUint(1)
  if (version < 1 || version > 3) throw new Error(`Unsupported transaction version ${version}`)

  const inputs: NativeTxInput[] = []
  const inputCount = reader.readUint(1)
  for (let i = 0; i < inputCount; i++) {
    inputs.push({ txHash: bytesToHex(reader.read(32)), index: reader.readUint(1) })
  }

  const outputs: NativeTxOutput[] = []
  const outputCount = reader.readUint(1)
  for (let i = 0; i < outputCount; i++) {
    const address = pointBytesToAddress(reader.read(version === 1 ? 64 : 33))
    const amountLength = reader.readUint(1)
    outputs.push({ address, amount: bytesToBigInt(reader.read(amountLength), true) })
  }

  const hash = sha256Hex(hexToBytes(trimmed))
  const specifier = reader.readUint(1)

  if (specifier === 36) {
    return { kind: 'coinbase', hash, version, blockHash: inputs[0]?.txHash ?? '', outputs }
  }

  let message: string | null = null
  if (specifier === 1) {
    const messageLength = reader.readUint(version <= 2 ? 1 : 2)
    const bytes = reader.read(messageLength)
    try {
      message = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      message = `0x${bytesToHex(bytes)}`
    }
  }

  let signatureCount = 0
  while (reader.remaining >= 64) {
    const r = reader.read(32)
    reader.read(32)
    if (r.every((b) => b === 0)) break
    signatureCount++
  }

  return { kind: 'transfer', hash, version, inputs, outputs, message, signatureCount }
}

export function tryDecodeNativeTransaction(txHex: string): NativeTransaction | null {
  try {
    return decodeNativeTransaction(txHex)
  } catch {
    return null
  }
}

// ─── Block headers ──────────────────────────────────────────────────────────────

export interface PosAttestation {
  slot: number
  epoch: number
  blockHash: string
  validatorAddress: string
  validatorIndex: number
  sourceEpoch: number
  targetEpoch: number
  createdAt: string | null
}

export type BlockHeader =
  | {
      kind: 'pos'
      number: number
      parentHash: string
      stateRoot: string
      transactionsRoot: string
      timestamp: number
      proposer: string
      proposerPublicKeyBytes: number
      proposerSignatureBytes: number
      slot: number
      epoch: number
      randaoReveal: string
      attestations: PosAttestation[]
      slashingEvidenceCount: number
      graffiti: string
    }
  | {
      kind: 'genesis'
      stateRoot: string
      chainId: number
      networkName: string
      genesisTime: number
      randaoSeed: string
      prefundedAccounts: number
      validators: number
      systemWallets: number
      systemWalletController: string | null
    }
  | {
      kind: 'pow'
      version: number
      parentHash: string
      miner: string
      merkleRoot: string
      timestamp: number
      difficulty: number
      nonce: number
    }
  | { kind: 'unknown' }

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

function parsePosHeader(dict: Record<string, unknown>): BlockHeader {
  const attestations = Array.isArray(dict.attestations) ? dict.attestations : []
  return {
    kind: 'pos',
    number: num(dict.number),
    parentHash: str(dict.parent_hash),
    stateRoot: str(dict.state_root),
    transactionsRoot: str(dict.transactions_root),
    timestamp: num(dict.timestamp),
    proposer: str(dict.proposer_address),
    proposerPublicKeyBytes: str(dict.proposer_public_key).length / 2,
    proposerSignatureBytes: str(dict.proposer_signature).length / 2,
    slot: num(dict.slot),
    epoch: num(dict.epoch),
    randaoReveal: str(dict.randao_reveal),
    attestations: attestations
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({
        slot: num(a.slot),
        epoch: num(a.epoch),
        blockHash: str(a.block_hash),
        validatorAddress: str(a.validator_address),
        validatorIndex: num(a.validator_index),
        sourceEpoch: num(a.source_epoch),
        targetEpoch: num(a.target_epoch),
        createdAt: a.created_at ? str(a.created_at) : null,
      })),
    slashingEvidenceCount: Array.isArray(dict.slashing_evidence) ? dict.slashing_evidence.length : 0,
    graffiti: str(dict.graffiti),
  }
}

/** Parse the `content` column of a block row into a structured header. */
export function parseBlockContent(content: string | null | undefined): BlockHeader {
  if (!content) return { kind: 'unknown' }
  const trimmed = content.trim()

  if (trimmed.startsWith('{')) {
    let dict: unknown = null
    try {
      dict = JSON.parse(trimmed)
    } catch {
      try {
        dict = parsePythonLiteral(trimmed)
      } catch {
        return { kind: 'unknown' }
      }
    }
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return { kind: 'unknown' }
    const d = dict as Record<string, unknown>
    if (d.type === 'genesis') {
      return {
        kind: 'genesis',
        stateRoot: str(d.state_root),
        chainId: num(d.chain_id),
        networkName: str(d.network_name),
        genesisTime: num(d.genesis_time),
        randaoSeed: str(d.randao_seed),
        prefundedAccounts: num(d.prefunded_accounts),
        validators: num(d.validators),
        systemWallets: num(d.system_wallets),
        systemWalletController: d.system_wallet_controller ? str(d.system_wallet_controller) : null,
      }
    }
    if ('proposer_address' in d || 'slot' in d) return parsePosHeader(d)
    return { kind: 'unknown' }
  }

  // Legacy PoW header: [version?] prev_hash(32) address(64|33) merkle(32) ts(4) difficulty(2) random(4)
  if (isHex(trimmed)) {
    try {
      const bytes = hexToBytes(trimmed)
      const reader = new ByteReader(bytes)
      const version = bytes.length === 138 ? 1 : reader.readUint(1)
      return {
        kind: 'pow',
        version,
        parentHash: bytesToHex(reader.read(32)),
        miner: pointBytesToAddress(reader.read(version === 1 ? 64 : 33)),
        merkleRoot: bytesToHex(reader.read(32)),
        timestamp: reader.readUint(4),
        difficulty: reader.readUint(2) / 10,
        nonce: reader.readUint(4),
      }
    } catch {
      return { kind: 'unknown' }
    }
  }

  return { kind: 'unknown' }
}

/** Block timestamps are stored either as unix seconds or as a SQLite datetime string. */
export function parseTimestamp(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value > 1e12 ? Math.floor(value / 1000) : value
  const text = String(value)
  if (/^\d+(\.\d+)?$/.test(text)) return parseTimestamp(Number(text))
  const iso = text.includes('T') ? text : text.replace(' ', 'T')
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const ms = Date.parse(withZone)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}
