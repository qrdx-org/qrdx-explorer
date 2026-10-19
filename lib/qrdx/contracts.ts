/**
 * What the explorer can tell about an EVM contract without its source: its code (size, hash),
 * the standards it answers to (ERC-165 interfaces, ERC-20 views), who created it (from the
 * node's transaction index), its recent events with the common ones decoded, and read-only
 * calls of any function by signature.
 */

import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { rpcCall } from './client'

export const keccakHex = (hex: string) => '0x' + bytesToHex(keccak_256(hexToBytes(hex.replace(/^0x/, ''))))
export const selector = (signature: string) => '0x' + bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8)
export const topicOf = (signature: string) => '0x' + bytesToHex(keccak_256(utf8ToBytes(signature)))

/** Contracts recognised by their runtime code hash (the same code on every network). */
export const KNOWN_CODE: Record<string, { name: string; description: string; source: string }> = {
  '0x38b23ef6bc71da4ee2729a60cb36c13e57f95f60d2d800573fc0c1d5222487a8': {
    name: 'QRDX NFT Market',
    description: 'Fixed-price listings of native NFTs, settled in one transaction with the royalty; no escrow, no owner, no fee.',
    source: 'https://github.com/qrdx-org/qrdx-trade/blob/main/contracts/QRDXNFTMarket.sol',
  },
}

/** Events worth naming: ERC-20/721/1155, ownership, and the QRDX NFT market's. */
const EVENTS: { signature: string; indexed: number; names: string[] }[] = [
  { signature: 'Transfer(address,address,uint256)', indexed: 2, names: ['from', 'to', 'value'] },
  { signature: 'Approval(address,address,uint256)', indexed: 2, names: ['owner', 'spender', 'value'] },
  { signature: 'ApprovalForAll(address,address,bool)', indexed: 2, names: ['owner', 'operator', 'approved'] },
  { signature: 'TransferSingle(address,address,address,uint256,uint256)', indexed: 3, names: ['operator', 'from', 'to', 'id', 'value'] },
  { signature: 'OwnershipTransferred(address,address)', indexed: 2, names: ['previousOwner', 'newOwner'] },
  { signature: 'Listed(address,uint256,address,address,uint256)', indexed: 3, names: ['collection', 'tokenId', 'seller', 'currency', 'price'] },
  { signature: 'Delisted(address,uint256,address)', indexed: 3, names: ['collection', 'tokenId', 'seller'] },
  { signature: 'Sold(address,uint256,address,address,address,uint256,address,uint256)', indexed: 3, names: ['collection', 'tokenId', 'buyer', 'seller', 'currency', 'price', 'royaltyReceiver', 'royalty'] },
]
const BY_TOPIC = new Map(EVENTS.map((e) => [topicOf(e.signature), e]))

export interface RawLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  logIndex: string
}

export interface DecodedLog {
  block: number
  tx: string
  index: number
  /** "Transfer", or null when the event is not one the explorer knows. */
  name: string | null
  args: { name: string; value: string; kind: 'address' | 'uint' | 'bool' | 'raw' }[]
  raw: RawLog
}

const words = (hex: string) => hex.replace(/^0x/, '').match(/.{64}/g) ?? []

/** A log with its event named and arguments read, when its signature is a known one. */
export function decodeLog(log: RawLog): DecodedLog {
  const base = { block: Number(BigInt(log.blockNumber)), tx: log.transactionHash, index: Number(BigInt(log.logIndex ?? '0x0')), raw: log }
  const ev = log.topics[0] ? BY_TOPIC.get(log.topics[0].toLowerCase()) : undefined
  const types = ev ? ev.signature.slice(ev.signature.indexOf('(') + 1, -1).split(',') : []
  // ERC-721's Transfer indexes the token id too: three indexed arguments, no data.
  const indexed = ev ? (ev.signature.startsWith('Transfer(') || ev.signature.startsWith('Approval(') ? log.topics.length - 1 : ev.indexed) : 0
  if (!ev || log.topics.length - 1 !== indexed || words(log.data).length !== types.length - indexed) {
    return { ...base, name: ev ? ev.signature.slice(0, ev.signature.indexOf('(')) : null, args: [] }
  }
  const values = [...log.topics.slice(1), ...words(log.data)]
  const args = types.map((t, i) => {
    const w = values[i].replace(/^0x/, '')
    const kind: 'address' | 'uint' | 'bool' | 'raw' = t === 'address' ? 'address' : t.startsWith('uint') ? 'uint' : t === 'bool' ? 'bool' : 'raw'
    const value = kind === 'address' ? '0x' + w.slice(-40) : kind === 'uint' ? BigInt('0x' + w).toString() : kind === 'bool' ? String(BigInt('0x' + w) !== 0n) : '0x' + w
    return { name: ev.names[i] ?? `arg${i}`, value, kind }
  })
  return { ...base, name: ev.signature.slice(0, ev.signature.indexOf('(')), args }
}

const call = (to: string, data: string) => rpcCall<string>('eth_call', [{ to, data }, 'latest']).catch(() => null)
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0')

function decodeString(hex: string | null): string | null {
  if (!hex || hex === '0x') return null
  try {
    const body = hex.replace(/^0x/, '')
    if (body.length === 64) return new TextDecoder().decode(hexToBytes(body)).replace(/\0+$/, '') || null
    const len = Number(BigInt('0x' + body.slice(64, 128)))
    return new TextDecoder().decode(hexToBytes(body.slice(128, 128 + len * 2)))
  } catch {
    return null
  }
}

export interface ContractInfo {
  code: string
  size: number
  codeHash: string
  known: (typeof KNOWN_CODE)[string] | null
  interfaces: string[]
  erc20: { name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null } | null
}

const INTERFACES: [string, string][] = [
  ['0x80ac58cd', 'ERC-721'],
  ['0x5b5e139f', 'ERC-721 Metadata'],
  ['0xd9b67a26', 'ERC-1155'],
  ['0x2a55205a', 'ERC-2981 royalties'],
]

export async function getContractInfo(address: string): Promise<ContractInfo | null> {
  const code = await rpcCall<string>('eth_getCode', [address, 'latest']).catch(() => null)
  if (!code || code === '0x') return null
  const codeHash = keccakHex(code)
  const supports = await call(address, '0x01ffc9a7' + '01ffc9a7'.padEnd(64, '0'))
  const erc165 = !!supports && BigInt(supports === '0x' ? '0x0' : supports) === 1n
  const interfaces: string[] = erc165 ? ['ERC-165'] : []
  if (erc165) {
    const answers = await Promise.all(INTERFACES.map(([id]) => call(address, '0x01ffc9a7' + id.slice(2).padEnd(64, '0'))))
    INTERFACES.forEach(([, name], i) => answers[i] && answers[i] !== '0x' && BigInt(answers[i]!) === 1n && interfaces.push(name))
  }
  let erc20: ContractInfo['erc20'] = null
  if (!interfaces.includes('ERC-721')) {
    const [name, symbol, decimals, supply] = await Promise.all([call(address, '0x06fdde03'), call(address, '0x95d89b41'), call(address, '0x313ce567'), call(address, '0x18160ddd')])
    if (supply && supply !== '0x' && decimals && decimals !== '0x') {
      erc20 = { name: decodeString(name), symbol: decodeString(symbol), decimals: Number(BigInt(decimals)), totalSupply: BigInt(supply).toString() }
      interfaces.push('ERC-20')
    }
  }
  return { code, size: (code.length - 2) / 2, codeHash, known: KNOWN_CODE[codeHash] ?? null, interfaces, erc20 }
}

/** The contract's events over the last `blocks` blocks, newest first. */
export async function getContractLogs(address: string, blocks = 200_000): Promise<DecodedLog[]> {
  const head = Number(BigInt(await rpcCall<string>('eth_blockNumber')))
  const logs = await rpcCall<RawLog[]>('eth_getLogs', [{ address, fromBlock: '0x' + Math.max(0, head - blocks).toString(16), toBlock: 'latest' }])
  return logs.map(decodeLog).sort((a, b) => b.block - a.block || b.index - a.index)
}

/**
 * A read-only call by signature, e.g. `balanceOf(address)` with ["0x…"]. Arguments are encoded
 * as address, uint/int, bool or bytes32; the answer comes back as raw words.
 */
export async function readCall(address: string, signature: string, args: string[]): Promise<{ data: string; words: string[] }> {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)\s*$/.exec(signature)
  if (!m) throw new Error('Write the function as name(type,…), e.g. balanceOf(address)')
  const types = m[2].split(',').map((t) => t.trim()).filter(Boolean)
  if (types.length !== args.length) throw new Error(`${m[1]} takes ${types.length} argument${types.length === 1 ? '' : 's'}`)
  const enc = types.map((t, i) => {
    const a = args[i].trim()
    if (t === 'address') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`Argument ${i + 1} is not a 0x address (a 0xPQ address is named in the EVM by its account id)`)
      return a.slice(2).toLowerCase().padStart(64, '0')
    }
    if (/^u?int\d*$/.test(t)) return word(BigInt(a))
    if (t === 'bool') return word(a === 'true' || a === '1' ? 1 : 0)
    if (/^bytes32$/.test(t)) return a.replace(/^0x/, '').padEnd(64, '0').slice(0, 64)
    throw new Error(`Type ${t} is not supported here (address, uint, int, bool, bytes32)`)
  })
  const data = await rpcCall<string>('eth_call', [{ to: address, data: selector(`${m[1]}(${types.join(',')})`) + enc.join('') }, 'latest'])
  return { data, words: words(data).map((w) => '0x' + w) }
}
