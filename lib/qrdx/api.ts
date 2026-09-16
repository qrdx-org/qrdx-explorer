/**
 * High-level explorer API built on the QRDX node's REST, JSON-RPC and metrics
 * surfaces. Every function returns normalized models (see ExplorerBlock /
 * ExplorerTransaction) so pages never touch raw node payloads.
 *
 * Node behaviours this module accounts for (qrdx/node/main.py, database_sqlite.py):
 *  - Block rows store the header in `content` (PoS: Python dict repr, genesis:
 *    JSON, legacy: hex); the hash/height/proposer/timestamp columns are canonical.
 *  - `/get_block` returns native tx payloads only. EVM + exchange sections are
 *    only exposed by `/get_blocks`, which is charged against a per-IP query-cost
 *    budget (offset/100 + limit/50 per call, 1000 per hour).
 *  - Included EVM transactions are not indexed by hash (eth_getTransactionByHash
 *    only covers RPC-executed contract calls), so they are located by scanning
 *    block sections and decoding the raw payloads.
 *  - Genesis records are JSON rows whose hashes are stored as BLOBs, so
 *    `/get_transaction` cannot find them; hashes are recomputed locally.
 *  - `/get_recent_blocks` and `/get_recent_transactions` fail on the SQLite
 *    backend and are intentionally not used.
 */

import {
  getNodeUrl,
  NodeApiError,
  nodeRequest,
  nodeRequestRaw,
  nodeRequestText,
  parsePrometheus,
  rpcCall,
  rpcCallOptional,
} from './client'
import { ensure0x, formatUnits, isHex, strip0x } from './encoding'
import { decodeEvmTransaction, type DecodedEvmTx } from './evm'
import {
  EVM_DECIMALS,
  NATIVE_DECIMALS,
  parseBlockContent,
  parseTimestamp,
  tryDecodeNativeTransaction,
  type BlockHeader,
  type NativeTransaction,
} from './native'

// ─── Raw node payloads ──────────────────────────────────────────────────────────

export interface RawBlockRow {
  block_hash: string
  hash: string
  block_height: number
  id: number
  prev_block_hash: string | null
  merkle_root: string | null
  timestamp: number | string | null
  difficulty: number | null
  nonce: number | null
  validator_address: string | null
  address: string | null
  validator_signature: string | null
  content: string | null
  created_at: string | null
  evm_transactions?: string[]
  exchange_transactions?: RawExchangeTx[]
}

export interface RawExchangeTx {
  op_type: number
  sender: string
  nonce: number
  params: Record<string, unknown>
  gas_limit: number
  gas_price: string
  timestamp: number
  tx_hash: string
  signature?: string
  public_key?: string
}

interface RawGetBlock {
  block: RawBlockRow
  transactions: string[] | null
  full_transactions: string[] | null
}

interface RawGetBlocksItem {
  block: RawBlockRow
  transactions: string[]
}

interface RawTransactionRow {
  tx_hash: string
  tx_hex: string
  block_hash: string | null
  inputs_addresses: string | null
  outputs_addresses: string | null
  outputs_amounts: string | null
  fees: number | null
  created_at: string | null
}

// ─── Normalized models ──────────────────────────────────────────────────────────

export type TransactionKind = 'evm' | 'native' | 'coinbase' | 'genesis' | 'exchange' | 'contract'

export interface ExplorerTransaction {
  /** Canonical hash as the node reports it (EVM: 0x-prefixed, native: bare hex). */
  hash: string
  kind: TransactionKind
  status: 'confirmed' | 'pending' | 'failed'
  blockHeight: number | null
  blockHash: string | null
  timestamp: number | null
  /** Position within its block section. */
  index: number
  from: string | null
  to: string | null
  /** Decimal QRDX amount. */
  value: string
  /** Decimal QRDX fee (EVM: gasLimit × gasPrice upper bound; native: inputs − outputs). */
  fee: string | null
  /** Short human label for the operation. */
  method: string
  evm?: DecodedEvmTx
  native?: NativeTransaction
  exchange?: RawExchangeTx
  contract?: Record<string, unknown>
}

export interface ExplorerBlock {
  height: number
  hash: string
  parentHash: string | null
  timestamp: number | null
  proposer: string | null
  header: BlockHeader
  slot: number | null
  epoch: number | null
  attestationCount: number
  nativeTxCount: number
  evmTxCount: number | null
  exchangeTxCount: number | null
  transactions: ExplorerTransaction[]
  /** Whether the EVM/exchange sections were available (only via /get_blocks). */
  sectionsLoaded: boolean
  contentBytes: number
}

export const EXCHANGE_OP_NAMES: Record<number, string> = {
  1: 'Create Pool',
  2: 'Add Liquidity',
  3: 'Remove Liquidity',
  4: 'Swap',
  5: 'Place Order',
  6: 'Cancel Order',
  7: 'Open Position',
  8: 'Close Position',
  9: 'Partial Close',
  10: 'Add Margin',
  11: 'Update Oracle',
  12: 'Create Market',
  13: 'Token Deploy',
  14: 'Token Transfer',
  15: 'Stake Deposit',
  16: 'Stake Exit',
  17: 'Remove Pool',
}

// ─── Caches & query-cost budget ─────────────────────────────────────────────────

const FINAL_DEPTH = 16
const blockCache = new Map<string, { block: ExplorerBlock; fetchedAt: number }>()
const txLocationIndex = new Map<string, { height: number; kind: TransactionKind }>()
let knownTip = -1

function cacheKey(height: number) {
  return `${getNodeUrl()}|${height}`
}

function txKey(hash: string) {
  return `${getNodeUrl()}|${strip0x(hash).toLowerCase()}`
}

function rememberBlock(block: ExplorerBlock) {
  blockCache.set(cacheKey(block.height), { block, fetchedAt: Date.now() })
  if (blockCache.size > 2000) {
    const oldest = blockCache.keys().next().value
    if (oldest) blockCache.delete(oldest)
  }
  for (const tx of block.transactions) {
    txLocationIndex.set(txKey(tx.hash), { height: block.height, kind: tx.kind })
  }
}

function cachedBlock(height: number, requireSections: boolean): ExplorerBlock | null {
  const entry = blockCache.get(cacheKey(height))
  if (!entry) return null
  if (requireSections && !entry.block.sectionsLoaded) return null
  const isDeep = knownTip >= 0 && height <= knownTip - FINAL_DEPTH
  if (!isDeep && Date.now() - entry.fetchedAt > 15_000) return null
  return entry.block
}

/** Mirrors QueryCostCalculator in main.py so we don't burn the per-IP budget into 429s. */
const QUERY_BUDGET_PER_HOUR = 1000
const QUERY_BUDGET_SAFETY = 150
const budgetState = new Map<string, { spent: number; windowStart: number; exhaustedUntil: number }>()

function budget() {
  const key = getNodeUrl()
  let state = budgetState.get(key)
  const now = Date.now()
  if (!state || now - state.windowStart > 3_600_000) {
    state = { spent: 0, windowStart: now, exhaustedUntil: 0 }
    budgetState.set(key, state)
  }
  return state
}

function canAffordRange(offset: number, limit: number): boolean {
  const state = budget()
  if (Date.now() < state.exhaustedUntil) return false
  const cost = offset / 100 + limit / 50
  return state.spent + cost <= QUERY_BUDGET_PER_HOUR - QUERY_BUDGET_SAFETY
}

function chargeRange(offset: number, limit: number) {
  budget().spent += offset / 100 + limit / 50
}

// ─── Normalization ──────────────────────────────────────────────────────────────

const toQrdx = (amount: bigint, decimals: number) => formatUnits(amount, decimals)

function normalizeEvmTx(raw: string, index: number, block: Pick<ExplorerBlock, 'height' | 'hash' | 'timestamp'> | null): ExplorerTransaction {
  let decoded: DecodedEvmTx
  try {
    decoded = decodeEvmTransaction(raw)
  } catch (err) {
    return {
      hash: `0x${strip0x(raw).slice(0, 64)}`,
      kind: 'evm',
      status: 'confirmed',
      blockHeight: block?.height ?? null,
      blockHash: block?.hash ?? null,
      timestamp: block?.timestamp ?? null,
      index,
      from: null,
      to: null,
      value: '0',
      fee: null,
      method: `Undecodable (${err instanceof Error ? err.message : 'error'})`,
    }
  }
  const input = decoded.input
  const method = !decoded.to
    ? 'Contract Creation'
    : input.length > 2
      ? `Call ${input.slice(0, 10)}`
      : 'Transfer'
  return {
    hash: decoded.hash,
    kind: 'evm',
    status: 'confirmed',
    blockHeight: block?.height ?? null,
    blockHash: block?.hash ?? null,
    timestamp: block?.timestamp ?? null,
    index,
    from: decoded.from,
    to: decoded.to ?? decoded.createdContract,
    value: toQrdx(decoded.value, EVM_DECIMALS),
    fee: toQrdx(decoded.gasLimit * decoded.gasPrice, EVM_DECIMALS),
    method,
    evm: decoded,
  }
}

function normalizeNativeTx(payload: string, index: number, block: Pick<ExplorerBlock, 'height' | 'hash' | 'timestamp'> | null): ExplorerTransaction | null {
  const decoded = tryDecodeNativeTransaction(payload)
  if (!decoded) return null
  const base = {
    status: 'confirmed' as const,
    blockHeight: block?.height ?? null,
    blockHash: block?.hash ?? null,
    timestamp: block?.timestamp ?? null,
    index,
    native: decoded,
  }
  if (decoded.kind === 'genesis') {
    return {
      ...base,
      hash: decoded.hash,
      kind: 'genesis',
      from: null,
      to: decoded.recipient,
      value: toQrdx(decoded.amount, NATIVE_DECIMALS),
      fee: '0',
      method: decoded.genesisType === 'genesis_system_wallet' ? 'Genesis System Wallet' : 'Genesis Allocation',
    }
  }
  const total = decoded.outputs.reduce((sum, o) => sum + o.amount, BigInt(0))
  if (decoded.kind === 'coinbase') {
    return {
      ...base,
      hash: decoded.hash,
      kind: 'coinbase',
      from: null,
      to: decoded.outputs[0]?.address ?? null,
      value: toQrdx(total, NATIVE_DECIMALS),
      fee: '0',
      method: 'Block Reward',
    }
  }
  return {
    ...base,
    hash: decoded.hash,
    kind: 'native',
    from: null,
    to: decoded.outputs[0]?.address ?? null,
    value: toQrdx(total, NATIVE_DECIMALS),
    fee: null,
    method: decoded.outputs.length > 1 ? `Transfer (${decoded.outputs.length} outputs)` : 'Transfer',
  }
}

function normalizeExchangeTx(raw: RawExchangeTx, index: number, block: Pick<ExplorerBlock, 'height' | 'hash' | 'timestamp'>): ExplorerTransaction {
  const params = raw.params ?? {}
  const to = (params.to ?? params.recipient ?? params.token_address ?? params.pool_id ?? null) as string | null
  const amount = params.amount ?? params.amount_in ?? params.value
  return {
    hash: raw.tx_hash,
    kind: 'exchange',
    status: 'confirmed',
    blockHeight: block.height,
    blockHash: block.hash,
    timestamp: block.timestamp ?? (raw.timestamp ? Math.floor(raw.timestamp) : null),
    index,
    from: raw.sender,
    to: typeof to === 'string' ? to : null,
    value: amount != null && /^-?\d+(\.\d+)?$/.test(String(amount)) ? String(amount) : '0',
    fee: null,
    method: EXCHANGE_OP_NAMES[raw.op_type] ?? `Exchange op ${raw.op_type}`,
    exchange: raw,
  }
}

function normalizeBlock(row: RawBlockRow, nativePayloads: string[] | null, sectionsLoaded: boolean): ExplorerBlock {
  const header = parseBlockContent(row.content)
  const height = Number(row.block_height ?? row.id)
  const hash = row.block_hash ?? row.hash

  let timestamp = parseTimestamp(row.timestamp)
  let parentHash: string | null = row.prev_block_hash
  let proposer: string | null = row.validator_address ?? row.address
  let slot: number | null = null
  let epoch: number | null = null
  let attestationCount = 0

  if (header.kind === 'pos') {
    timestamp = timestamp ?? header.timestamp
    parentHash = parentHash ?? header.parentHash
    proposer = proposer || header.proposer
    slot = header.slot
    epoch = header.epoch
    attestationCount = header.attestations.length
  } else if (header.kind === 'genesis') {
    timestamp = timestamp ?? header.genesisTime
    proposer = null
  } else if (header.kind === 'pow') {
    timestamp = timestamp ?? header.timestamp
    parentHash = parentHash ?? header.parentHash
    proposer = proposer || header.miner
  }

  const ref = { height, hash, timestamp }
  const transactions: ExplorerTransaction[] = []

  const evmSection = row.evm_transactions ?? []
  evmSection.forEach((raw, i) => transactions.push(normalizeEvmTx(raw, i, ref)))

  const exchangeSection = row.exchange_transactions ?? []
  exchangeSection.forEach((raw, i) => transactions.push(normalizeExchangeTx(raw, i, ref)))

  let nativeCount = 0
  for (const payload of nativePayloads ?? []) {
    const tx = normalizeNativeTx(payload, nativeCount, ref)
    if (tx) transactions.push(tx)
    nativeCount++
  }

  return {
    height,
    hash,
    parentHash,
    timestamp,
    proposer: proposer === 'genesis' ? null : proposer,
    header,
    slot,
    epoch,
    attestationCount,
    nativeTxCount: nativeCount,
    evmTxCount: sectionsLoaded ? evmSection.length : null,
    exchangeTxCount: sectionsLoaded ? exchangeSection.length : null,
    transactions,
    sectionsLoaded,
    contentBytes: row.content ? row.content.length : 0,
  }
}

export function blockTxCount(block: ExplorerBlock): number {
  return block.nativeTxCount + (block.evmTxCount ?? 0) + (block.exchangeTxCount ?? 0)
}

// ─── Chain status / node health ─────────────────────────────────────────────────

export interface ChainStatus {
  height: number
  lastBlockHash: string | null
  nodeId: string | null
}

export async function getChainStatus(): Promise<ChainStatus> {
  const result = await nodeRequest<{ height: number; last_block_hash: string | null; node_id: string | null }>('get_status')
  knownTip = Math.max(knownTip, result.height)
  return { height: result.height, lastBlockHash: result.last_block_hash, nodeId: result.node_id }
}

export function noteChainTip(height: number) {
  knownTip = Math.max(knownTip, height)
}

export interface NodeHealth {
  online: boolean
  version: string | null
  uptimeSeconds: number | null
  ready: boolean
  readyHeight: number | null
}

export async function getNodeHealth(baseUrl?: string): Promise<NodeHealth> {
  try {
    const [health, ready] = await Promise.all([
      nodeRequestRaw<{ status: string; version: string; uptime_s: number }>('healthz', { baseUrl, timeoutMs: 6000 }),
      nodeRequestRaw<{ ready: boolean; height: number | null }>('readyz', { baseUrl, timeoutMs: 6000 }).catch(() => null),
    ])
    return {
      online: health.status === 200,
      version: health.data?.version ?? null,
      uptimeSeconds: health.data?.uptime_s ?? null,
      ready: !!ready?.data?.ready,
      readyHeight: ready?.data?.height ?? null,
    }
  } catch {
    return { online: false, version: null, uptimeSeconds: null, ready: false, readyHeight: null }
  }
}

export interface NodeMetrics {
  chainHeight: number | null
  finalizedEpoch: number | null
  justifiedEpoch: number | null
  finalityLagEpochs: number | null
  peerCount: number | null
  mempoolPending: number | null
  slashingEvents: number | null
  streamingEnabled: boolean | null
  streamSubscribers: number | null
  uptimeSeconds: number | null
  blocksReceivedFromPeers: number | null
  reorgs: number | null
  rpcRequests: Array<{ method: string; count: number; errors: number }>
}

export async function getNodeMetrics(baseUrl?: string): Promise<NodeMetrics> {
  const samples = parsePrometheus(await nodeRequestText('metrics', { baseUrl }))
  const scalar = (name: string): number | null => {
    const sample = samples.find((s) => s.name === name && Object.keys(s.labels).length === 0)
    return sample ? sample.value : null
  }
  const rpc = new Map<string, { method: string; count: number; errors: number }>()
  for (const s of samples) {
    if (s.name !== 'qrdx_rpc_requests_total' && s.name !== 'qrdx_rpc_errors_total') continue
    const method = s.labels.method ?? 'unknown'
    const entry = rpc.get(method) ?? { method, count: 0, errors: 0 }
    if (s.name === 'qrdx_rpc_requests_total') entry.count += s.value
    else entry.errors += s.value
    rpc.set(method, entry)
  }
  const streaming = scalar('qrdx_streaming_enabled')
  const finalized = scalar('qrdx_finalized_epoch')
  return {
    chainHeight: scalar('qrdx_chain_height'),
    finalizedEpoch: finalized,
    justifiedEpoch: scalar('qrdx_justified_epoch'),
    finalityLagEpochs: scalar('qrdx_finality_lag_epochs'),
    peerCount: scalar('qrdx_peer_count'),
    mempoolPending: scalar('qrdx_mempool_pending'),
    slashingEvents: scalar('qrdx_slashing_events'),
    streamingEnabled: streaming === null ? null : streaming === 1,
    streamSubscribers: scalar('qrdx_stream_subscribers'),
    uptimeSeconds: scalar('qrdx_uptime_seconds'),
    blocksReceivedFromPeers: scalar('qrdx_p2p_blocks_received_total'),
    reorgs: scalar('qrdx_reorgs_total'),
    rpcRequests: Array.from(rpc.values()).sort((a, b) => b.count - a.count),
  }
}

export interface RpcInfo {
  available: boolean
  chainId: number | null
  clientVersion: string | null
  blockNumber: number | null
  gasPrice: string | null
}

export async function getRpcInfo(): Promise<RpcInfo> {
  try {
    const chainId = await rpcCall<string>('eth_chainId')
    const [clientVersion, blockNumber, gasPrice] = await Promise.all([
      rpcCallOptional<string>('web3_clientVersion'),
      rpcCallOptional<string>('eth_blockNumber'),
      rpcCallOptional<string>('eth_gasPrice'),
    ])
    return {
      available: true,
      chainId: chainId ? parseInt(chainId, 16) : null,
      clientVersion,
      blockNumber: blockNumber ? parseInt(blockNumber, 16) : null,
      gasPrice: gasPrice ? formatUnits(BigInt(gasPrice), 9) : null,
    }
  } catch {
    return { available: false, chainId: null, clientVersion: null, blockNumber: null, gasPrice: null }
  }
}

// ─── Blocks ─────────────────────────────────────────────────────────────────────

async function fetchBlockRow(height: number): Promise<ExplorerBlock | null> {
  try {
    const result = await nodeRequest<RawGetBlock>('get_block', { query: { block: height } })
    return normalizeBlock(result.block, result.transactions ?? [], false)
  } catch (err) {
    // The node answers 400 "Invalid block height" for heights above the tip.
    if (err instanceof NodeApiError && (err.isNotFound || err.status === 400)) return null
    throw err
  }
}

async function fetchBlockSections(offset: number, limit: number): Promise<ExplorerBlock[] | null> {
  if (!canAffordRange(offset, limit)) return null
  chargeRange(offset, limit)
  try {
    const items = await nodeRequest<RawGetBlocksItem[]>('get_blocks', { query: { offset, limit } })
    return items.map((item) => normalizeBlock(item.block, item.transactions, true))
  } catch (err) {
    if (err instanceof NodeApiError && err.isRateLimited) {
      budget().exhaustedUntil = Date.now() + 10 * 60_000
      return null
    }
    throw err
  }
}

/** Resolve a block by height or 64-hex hash (with or without 0x). */
export async function getBlock(idOrHash: string | number): Promise<ExplorerBlock | null> {
  let height: number
  const text = String(idOrHash).trim()
  if (/^\d+$/.test(text)) {
    height = Number(text)
  } else if (isHex(text, 32)) {
    try {
      const result = await nodeRequest<RawGetBlock>('get_block', { query: { block: strip0x(text).toLowerCase() } })
      height = Number(result.block.block_height ?? result.block.id)
      const cached = cachedBlock(height, true)
      if (cached) return cached
      const withSections = await fetchBlockSections(height, 1)
      const block = withSections?.[0] ?? normalizeBlock(result.block, result.transactions ?? [], false)
      rememberBlock(block)
      return block
    } catch (err) {
      if (err instanceof NodeApiError && (err.isNotFound || err.status === 400)) return null
      throw err
    }
  } else {
    return null
  }

  const cached = cachedBlock(height, true)
  if (cached) return cached

  const withSections = await fetchBlockSections(height, 1)
  const block = withSections && withSections[0]?.height === height ? withSections[0] : await fetchBlockRow(height)
  if (block) rememberBlock(block)
  return block
}

/**
 * Fetch blocks in [fromHeight, toHeight] (inclusive), newest first.
 * Uses /get_blocks (with EVM/exchange sections) when the query budget allows,
 * otherwise paces individual /get_block calls.
 */
export async function getBlockRange(
  fromHeight: number,
  toHeight: number,
  options: { requireSections?: boolean } = {},
): Promise<ExplorerBlock[]> {
  const from = Math.max(0, fromHeight)
  if (toHeight < from) return []
  const wantSections = options.requireSections ?? true

  const results = new Map<number, ExplorerBlock>()
  const missing: number[] = []
  for (let h = from; h <= toHeight; h++) {
    const cached = cachedBlock(h, wantSections)
    if (cached) results.set(h, cached)
    else missing.push(h)
  }

  if (missing.length && wantSections) {
    const start = missing[0]
    const count = missing[missing.length - 1] - start + 1
    const blocks = await fetchBlockSections(start, Math.min(count, 512))
    if (blocks) {
      for (const block of blocks) {
        if (block.height >= from && block.height <= toHeight) {
          results.set(block.height, block)
          rememberBlock(block)
        }
      }
    }
  }

  const stillMissing = missing.filter((h) => !results.has(h))
  const CONCURRENCY = 4
  for (let i = 0; i < stillMissing.length; i += CONCURRENCY) {
    const chunk = stillMissing.slice(i, i + CONCURRENCY)
    const blocks = await Promise.all(chunk.map((h) => fetchBlockRow(h)))
    for (const block of blocks) {
      if (block) {
        results.set(block.height, block)
        rememberBlock(block)
      }
    }
  }

  return Array.from(results.values()).sort((a, b) => b.height - a.height)
}

export async function getLatestBlocks(count: number, tip?: number): Promise<ExplorerBlock[]> {
  const height = tip ?? (await getChainStatus()).height
  if (height < 0) return []
  return getBlockRange(height - count + 1, height)
}

// ─── Transactions ───────────────────────────────────────────────────────────────

export interface TransactionLookup {
  transaction: ExplorerTransaction | null
  /** Inclusive block range scanned for EVM transactions when no index could answer. */
  scanned: { from: number; to: number } | null
  /** Set when the scan was cut short by the node's query-cost limits. */
  scanLimited: boolean
}

async function resolveNativeInputs(tx: ExplorerTransaction): Promise<ExplorerTransaction> {
  if (tx.native?.kind !== 'transfer') return tx
  let inputTotal = BigInt(0)
  let resolvedAll = true
  const senders = new Set<string>()
  for (const input of tx.native.inputs) {
    try {
      const prev = await nodeRequest<RawTransactionRow>('get_transaction', { query: { tx_hash: input.txHash } })
      const decoded = tryDecodeNativeTransaction(prev.tx_hex)
      const output = decoded && 'outputs' in decoded ? decoded.outputs[input.index] : decoded?.kind === 'genesis' && input.index === 0
        ? { address: decoded.recipient, amount: decoded.amount }
        : undefined
      if (output) {
        inputTotal += output.amount
        senders.add(output.address)
      } else {
        resolvedAll = false
      }
    } catch {
      resolvedAll = false
    }
  }
  const outputTotal = tx.native.outputs.reduce((sum, o) => sum + o.amount, BigInt(0))
  const from = senders.size ? Array.from(senders)[0] : null
  const sentValue = from
    ? tx.native.outputs.filter((o) => o.address !== from).reduce((sum, o) => sum + o.amount, BigInt(0))
    : outputTotal
  return {
    ...tx,
    from,
    value: formatUnits(sentValue, NATIVE_DECIMALS),
    fee: resolvedAll ? formatUnits(inputTotal - outputTotal, NATIVE_DECIMALS) : null,
  }
}

async function findInBlock(height: number, hash: string): Promise<ExplorerTransaction | null> {
  const block = await getBlock(height)
  const needle = strip0x(hash).toLowerCase()
  return block?.transactions.find((t) => strip0x(t.hash).toLowerCase() === needle) ?? null
}

/**
 * Locate a transaction by hash across every data source the node exposes.
 * `maxScanBlocks` bounds the fallback scan of recent EVM/exchange sections.
 */
export async function getTransaction(hash: string, options: { maxScanBlocks?: number } = {}): Promise<TransactionLookup> {
  const bare = strip0x(hash.trim()).toLowerCase()
  if (!isHex(bare, 32)) return { transaction: null, scanned: null, scanLimited: false }

  // 1. Already seen in a block this session.
  const known = txLocationIndex.get(txKey(bare))
  if (known) {
    const tx = await findInBlock(known.height, bare)
    if (tx) return { transaction: tx.kind === 'native' ? await resolveNativeInputs(tx) : tx, scanned: null, scanLimited: false }
  }

  // 2. Native transaction table (UTXO transfers and coinbase).
  try {
    const row = await nodeRequest<RawTransactionRow>('get_transaction', { query: { tx_hash: bare } })
    let blockRef: Pick<ExplorerBlock, 'height' | 'hash' | 'timestamp'> | null = null
    if (row.block_hash) {
      const block = await getBlock(row.block_hash).catch(() => null)
      if (block) blockRef = block
    }
    const tx = normalizeNativeTx(row.tx_hex, 0, blockRef)
    if (tx) return { transaction: await resolveNativeInputs(tx), scanned: null, scanLimited: false }
  } catch (err) {
    if (!(err instanceof NodeApiError) || !(err.isNotFound || err.status === 400)) throw err
  }

  // 3. RPC-executed contract transactions (contract_transactions table).
  const contractTx = await rpcCallOptional<Record<string, string | null>>('eth_getTransactionByHash', [ensure0x(bare)])
  if (contractTx) {
    const receipt = await rpcCallOptional<Record<string, any>>('eth_getTransactionReceipt', [ensure0x(bare)])
    const blockHeight = contractTx.blockNumber ? parseInt(contractTx.blockNumber, 16) : null
    const block = blockHeight !== null ? await getBlock(blockHeight).catch(() => null) : null
    const gasUsed = receipt?.gasUsed ? BigInt(receipt.gasUsed) : null
    const gasPrice = contractTx.gasPrice ? BigInt(contractTx.gasPrice) : BigInt(0)
    return {
      transaction: {
        hash: ensure0x(bare),
        kind: 'contract',
        status: receipt?.status === '0x0' ? 'failed' : 'confirmed',
        blockHeight,
        blockHash: block?.hash ?? (contractTx.blockHash ? strip0x(contractTx.blockHash) : null),
        timestamp: block?.timestamp ?? null,
        index: contractTx.transactionIndex ? parseInt(contractTx.transactionIndex, 16) : 0,
        from: contractTx.from,
        to: contractTx.to ?? receipt?.contractAddress ?? null,
        value: formatUnits(BigInt(contractTx.value ?? '0x0'), EVM_DECIMALS),
        fee: gasUsed !== null ? formatUnits(gasUsed * gasPrice, EVM_DECIMALS) : null,
        method: contractTx.to ? 'Contract Call' : 'Contract Creation',
        contract: { ...contractTx, receipt },
      },
      scanned: null,
      scanLimited: false,
    }
  }

  // 4. Genesis records (hash stored as BLOB, recomputed locally).
  const genesis = await getBlock(0).catch(() => null)
  const genesisTx = genesis?.transactions.find((t) => t.hash === bare)
  if (genesisTx) return { transaction: genesisTx, scanned: null, scanLimited: false }

  // 5. Scan recent block sections for EVM/exchange transactions.
  const status = await getChainStatus()
  const maxScan = options.maxScanBlocks ?? 1000
  const lowest = Math.max(0, status.height - maxScan + 1)
  const WINDOW = 100
  let scannedFrom = status.height + 1
  let scanLimited = false
  for (let top = status.height; top >= lowest; top -= WINDOW) {
    const bottom = Math.max(lowest, top - WINDOW + 1)
    if (!canAffordRange(bottom, top - bottom + 1)) {
      scanLimited = true
      break
    }
    const blocks = await getBlockRange(bottom, top, { requireSections: true })
    if (blocks.some((b) => !b.sectionsLoaded)) scanLimited = true
    scannedFrom = bottom
    for (const block of blocks) {
      const match = block.transactions.find((t) => strip0x(t.hash).toLowerCase() === bare)
      if (match) return { transaction: match, scanned: { from: bottom, to: status.height }, scanLimited: false }
    }
    if (scanLimited) break
  }
  return {
    transaction: null,
    scanned: scannedFrom <= status.height ? { from: scannedFrom, to: status.height } : null,
    scanLimited,
  }
}

/** Recent transactions across the newest blocks (EVM, exchange, native), newest first. */
export async function getRecentTransactions(options: { blocks?: number; tip?: number } = {}): Promise<{
  transactions: ExplorerTransaction[]
  blocks: ExplorerBlock[]
}> {
  const tip = options.tip ?? (await getChainStatus()).height
  const blocks = await getBlockRange(tip - (options.blocks ?? 50) + 1, tip)
  const transactions = blocks.flatMap((b) => [...b.transactions].reverse())
  return { transactions, blocks }
}

export interface MempoolSnapshot {
  transactions: ExplorerTransaction[]
  /** From /metrics when the mempool endpoint cannot be read. */
  pendingCount: number | null
  error: string | null
}

export async function getMempool(): Promise<MempoolSnapshot> {
  try {
    const payloads = await nodeRequest<string[]>('get_pending_transactions')
    const transactions = payloads
      .map((p, i) => normalizeNativeTx(p, i, null))
      .filter((t): t is ExplorerTransaction => !!t)
      .map((t) => ({ ...t, status: 'pending' as const }))
    return { transactions, pendingCount: payloads.length, error: null }
  } catch (err) {
    const metrics = await getNodeMetrics().catch(() => null)
    return {
      transactions: [],
      pendingCount: metrics?.mempoolPending ?? null,
      error: err instanceof Error ? err.message : 'Unable to read mempool',
    }
  }
}

// ─── Addresses ──────────────────────────────────────────────────────────────────

export type AddressFormat = 'pq' | 'evm' | 'legacy'

export function detectAddressFormat(value: string): AddressFormat | null {
  if (/^0xPQ[0-9a-fA-F]{64}$/.test(value)) return 'pq'
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return 'evm'
  if (/^[QR][1-9A-HJ-NP-Za-km-z]{44}$/.test(value)) return 'legacy'
  return null
}

export interface AddressSummary {
  address: string
  format: AddressFormat | null
  /** Decimal QRDX (account_state first, UTXO fallback — as the node computes it). */
  balance: string
  spendableOutputs: Array<{ txHash: string; index: number; amount: string }>
  nonce: number | null
  isContract: boolean
  validator: ValidatorInfo | null
}

export async function getAddress(address: string): Promise<AddressSummary> {
  const format = detectAddressFormat(address)
  const [info, nonceHex, code, validators] = await Promise.all([
    // transactions_count_limit=0 skips the node's history lookup, which errors
    // on the SQLite backend whenever an address has recorded transactions.
    nodeRequest<{
      balance: string
      spendable_outputs: Array<{ amount: string; tx_hash: string; index: number }>
    }>('get_address_info', { query: { address, transactions_count_limit: 0 } }),
    format === 'evm' ? rpcCallOptional<string>('eth_getTransactionCount', [address, 'latest']) : Promise.resolve(null),
    format === 'evm' ? rpcCallOptional<string>('eth_getCode', [address, 'latest']) : Promise.resolve(null),
    getValidators().catch(() => [] as ValidatorInfo[]),
  ])
  const normalizedBalance = /^-?\d+(\.\d+)?$/.test(info.balance) ? info.balance.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : '0'
  return {
    address,
    format,
    balance: normalizedBalance,
    spendableOutputs: info.spendable_outputs.map((o) => ({
      txHash: o.tx_hash,
      index: o.index,
      amount: o.amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
    })),
    nonce: nonceHex ? parseInt(nonceHex, 16) : null,
    isContract: !!code && code !== '0x',
    validator: validators.find((v) => v.address.toLowerCase() === address.toLowerCase()) ?? null,
  }
}

/** Canonical balance only (one paced request, no RPC/validator lookups). */
export async function getAddressBalance(address: string): Promise<string> {
  const info = await nodeRequest<{ balance: string }>('get_address_info', {
    query: { address, transactions_count_limit: 0 },
  })
  return /^-?\d+(\.\d+)?$/.test(info.balance) ? info.balance.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : '0'
}

export interface AddressActivity {
  transactions: ExplorerTransaction[]
  proposedBlocks: ExplorerBlock[]
  scanned: { from: number; to: number } | null
  scanLimited: boolean
}

export function transactionInvolves(tx: ExplorerTransaction, address: string): boolean {
  const needle = address.toLowerCase()
  if (tx.from?.toLowerCase() === needle || tx.to?.toLowerCase() === needle) return true
  if (tx.native && 'outputs' in tx.native) {
    return tx.native.outputs.some((o) => o.address.toLowerCase() === needle)
  }
  if (tx.evm?.createdContract?.toLowerCase() === needle) return true
  return false
}

/**
 * The node does not index history per address, so recent activity is gathered
 * by scanning the newest `maxBlocks` blocks plus the genesis allocations and the
 * address's unspent outputs.
 */
export async function getAddressActivity(
  address: string,
  options: { maxBlocks?: number; spendableOutputs?: AddressSummary['spendableOutputs'] } = {},
): Promise<AddressActivity> {
  const needle = address.toLowerCase()
  const status = await getChainStatus()
  const maxBlocks = options.maxBlocks ?? 300
  const lowest = Math.max(0, status.height - maxBlocks + 1)

  const found = new Map<string, ExplorerTransaction>()
  const proposed: ExplorerBlock[] = []
  const WINDOW = 100
  let scannedFrom = status.height + 1
  let scanLimited = false

  for (let top = status.height; top >= lowest; top -= WINDOW) {
    const bottom = Math.max(lowest, top - WINDOW + 1)
    const affordable = canAffordRange(bottom, top - bottom + 1)
    // Without section access fall back to headers only for a short window.
    if (!affordable && status.height - bottom > 50) {
      scanLimited = true
      break
    }
    const blocks = await getBlockRange(bottom, top, { requireSections: affordable })
    if (blocks.some((b) => !b.sectionsLoaded)) scanLimited = true
    scannedFrom = bottom
    for (const block of blocks) {
      if (block.proposer?.toLowerCase() === needle) proposed.push(block)
      for (const tx of block.transactions) {
        if (transactionInvolves(tx, needle)) found.set(tx.hash, tx)
      }
    }
  }

  if (lowest > 0) {
    const genesis = await getBlock(0).catch(() => null)
    for (const tx of genesis?.transactions ?? []) {
      if (transactionInvolves(tx, needle)) found.set(tx.hash, tx)
    }
  }

  for (const output of options.spendableOutputs ?? []) {
    if (found.has(output.txHash)) continue
    const lookup = await getTransaction(output.txHash, { maxScanBlocks: 0 }).catch(() => null)
    if (lookup?.transaction) found.set(lookup.transaction.hash, lookup.transaction)
  }

  const transactions = Array.from(found.values()).sort(
    (a, b) => (b.blockHeight ?? Infinity) - (a.blockHeight ?? Infinity) || b.index - a.index,
  )
  return {
    transactions,
    proposedBlocks: proposed,
    scanned: scannedFrom <= status.height ? { from: scannedFrom, to: status.height } : null,
    scanLimited,
  }
}

export interface AddressToken {
  contractAddress: string
  name: string | null
  symbol: string | null
  verified: boolean
  type: string
  transferCount: number
}

export async function getAddressTokens(address: string): Promise<AddressToken[]> {
  const result = await nodeRequest<{
    tokens: Array<{ contract_address: string; name: string | null; symbol: string | null; verified: boolean; type: string; transfer_count: number }>
  }>('get_address_tokens', { query: { address } })
  return result.tokens.map((t) => ({
    contractAddress: t.contract_address,
    name: t.name,
    symbol: t.symbol,
    verified: !!t.verified,
    type: t.type,
    transferCount: t.transfer_count,
  }))
}

export interface TokenInfo {
  contractAddress: string
  name: string | null
  symbol: string | null
  verified: boolean
  compilerVersion: string | null
  totalTransfers: number
  totalHolders: number
  abi: unknown
}

export async function getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
  try {
    const t = await nodeRequest<Record<string, any>>('get_token_info', { query: { token_address: tokenAddress } })
    return {
      contractAddress: t.contract_address,
      name: t.name ?? null,
      symbol: t.symbol ?? null,
      verified: !!t.verified,
      compilerVersion: t.compiler_version ?? null,
      totalTransfers: Number(t.total_transfers ?? 0),
      totalHolders: Number(t.total_holders ?? 0),
      abi: t.abi ?? null,
    }
  } catch (err) {
    if (err instanceof NodeApiError && err.isNotFound) return null
    throw err
  }
}

export interface TopAddress {
  address: string
  /** Decimal QRDX (UTXO set only — account_state balances are not ranked by the node). */
  balance: string
  outputCount: number
}

export async function getTopAddresses(limit = 100, offset = 0): Promise<TopAddress[]> {
  const result = await nodeRequest<{ addresses: Array<{ address: string; balance: string; output_count: number }> }>(
    'get_top_addresses',
    { query: { limit, offset, order_by: 'balance' } },
  )
  return result.addresses.map((a) => ({
    address: a.address,
    // The SQLite backend sums raw unspent_outputs.amount, i.e. native base units.
    balance: /^\d+$/.test(a.balance) ? formatUnits(BigInt(a.balance), NATIVE_DECIMALS) : a.balance,
    outputCount: a.output_count,
  }))
}

// ─── Consensus ──────────────────────────────────────────────────────────────────

export interface ValidatorInfo {
  address: string
  stake: string
  effectiveStake: string
  status: string
  activationEpoch: number | null
  exitEpoch: number | null
  slashed: boolean
  publicKeyBytes: number
}

export async function getValidators(status?: string): Promise<ValidatorInfo[]> {
  const result = await nodeRequest<Array<Record<string, any>>>('get_validators', { query: { status } })
  return result.map((v) => ({
    address: v.address,
    stake: String(v.stake ?? '0'),
    effectiveStake: String(v.effective_stake ?? '0'),
    status: v.status ?? 'unknown',
    activationEpoch: v.activation_epoch ?? null,
    exitEpoch: v.exit_epoch ?? null,
    slashed: !!v.slashed,
    publicKeyBytes: typeof v.public_key === 'string' ? v.public_key.length / 2 : 0,
  }))
}

export interface AttestationRecord {
  id: number | null
  slot: number
  epoch: number
  blockHash: string
  validator: { address: string; index: number; stake: string | null; status: string | null }
  sourceEpoch: number
  targetEpoch: number
  inclusion: { blockHash: string; slot: number | null } | null
}

export async function getAttestations(filters: {
  slot?: number
  epoch?: number
  validatorAddress?: string
  blockHash?: string
  limit?: number
  offset?: number
} = {}): Promise<AttestationRecord[]> {
  const result = await nodeRequest<{ attestations: Array<Record<string, any>> }>('get_attestations', {
    query: {
      slot: filters.slot,
      epoch: filters.epoch,
      validator_address: filters.validatorAddress,
      block_hash: filters.blockHash,
      limit: filters.limit ?? 100,
      offset: filters.offset ?? 0,
    },
  })
  return result.attestations.map((a) => ({
    id: a.id ?? null,
    slot: a.slot,
    epoch: a.epoch,
    blockHash: a.block_hash,
    validator: {
      address: a.validator?.address,
      index: a.validator?.index,
      stake: a.validator?.stake ?? null,
      status: a.validator?.status ?? null,
    },
    sourceEpoch: a.checkpoint?.source_epoch,
    targetEpoch: a.checkpoint?.target_epoch,
    inclusion: a.inclusion ? { blockHash: a.inclusion.block_hash, slot: a.inclusion.slot ?? null } : null,
  }))
}

export interface PeerInfo {
  nodeId: string
  url: string
  isPublic: boolean
  reputationScore: number | null
}

export async function getPeers(): Promise<PeerInfo[]> {
  const result = await nodeRequest<Array<Record<string, any>>>('get_nodes')
  return result.map((p) => ({
    nodeId: p.node_id,
    url: p.url ?? '',
    isPublic: !!p.is_public,
    reputationScore: typeof p.reputation_score === 'number' ? p.reputation_score : null,
  }))
}

export interface StateRoots {
  unifiedStateRoot: string
  utxoRoot: string
  accountRoot: string
  exchangeRoot: string
  tokenRoot: string
  enforced: boolean
}

export async function getStateRoots(): Promise<StateRoots | null> {
  try {
    const r = await nodeRequest<Record<string, any>>('get_unified_state_root')
    return {
      unifiedStateRoot: r.unified_state_root,
      utxoRoot: r.utxo_root,
      accountRoot: r.account_root,
      exchangeRoot: r.exchange_root,
      tokenRoot: r.token_root,
      enforced: !!r.enforced,
    }
  } catch {
    return null
  }
}

// ─── Submission ─────────────────────────────────────────────────────────────────

/** Submit a signed native transaction (hex) to the mempool. */
export async function submitNativeTransaction(txHex: string): Promise<string> {
  return nodeRequest<string>('submit_tx', { method: 'POST', body: { tx_hex: strip0x(txHex) } })
}

/** Submit a signed raw EVM transaction; returns its hash. Requires QRDX_RPC_ENABLED. */
export async function sendRawEvmTransaction(rawTx: string): Promise<string> {
  return rpcCall<string>('eth_sendRawTransaction', [ensure0x(rawTx)])
}

// ─── Search ─────────────────────────────────────────────────────────────────────

export type SearchTarget =
  | { type: 'block'; path: string }
  | { type: 'address'; path: string }
  | { type: 'transaction'; path: string }
  | { type: 'none' }

/** Classify a search query. 32-byte hashes are resolved against blocks first, then transactions. */
export async function resolveSearch(query: string): Promise<SearchTarget> {
  const q = query.trim()
  if (!q) return { type: 'none' }
  if (/^\d+$/.test(q)) return { type: 'block', path: `/block/${q}` }
  if (detectAddressFormat(q)) return { type: 'address', path: `/address/${q}` }
  if (isHex(q, 32)) {
    const block = await getBlock(q).catch(() => null)
    if (block) return { type: 'block', path: `/block/${block.height}` }
    return { type: 'transaction', path: `/tx/${q}` }
  }
  return { type: 'none' }
}
