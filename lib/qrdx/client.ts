/**
 * Transport layer for a QRDX node (qrdx/node/main.py).
 *
 *  - REST:      GET/POST http://node:3007/<endpoint>, `{ ok, result | error }` envelopes
 *  - JSON-RPC:  POST http://node:3007/rpc  (single requests only — FastAPI rejects batches)
 *  - Metrics:   GET  http://node:3007/metrics  (Prometheus text)
 *  - Realtime:  ws://node:3007/ws  and  http://node:3007/stream (SSE) — see stream.ts
 *
 * The node enforces per-IP slowapi limits on most read endpoints, so requests
 * are paced client-side with a sliding window per endpoint to avoid 429s.
 */

export type NetworkType = 'mainnet' | 'testnet' | 'local'

export interface NetworkConfig {
  type: NetworkType
  name: string
  /** Base URL of the node's HTTP API, e.g. https://test.qrdx.org */
  nodeApiUrl: string
  /** JSON-RPC endpoint; `${nodeApiUrl}/rpc` unless the network serves it elsewhere. */
  rpcUrl: string
  /** Expected chain ID (informational: the node reports its own, and the network page shows both). */
  chainId: number
  /** trade.qrdx.org's API for this network (markets, USD prices); null when it has none. */
  tradeApiUrl: string | null
  /** The trading site's base URL, for "Trade" links. */
  tradeUrl: string | null
}

const DEFAULT_NODE_URL = 'http://127.0.0.1:3007'
const TRADE_URL = (process.env.NEXT_PUBLIC_QRDX_TRADE_URL || 'https://trade.qrdx.org').replace(/\/+$/, '')

/** The same networks the wallet and trade.qrdx.org use (qrdx-trade lib/config.ts). */
export const DEFAULT_NETWORKS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    type: 'mainnet',
    name: 'QRDX Mainnet',
    nodeApiUrl: 'https://node.qrdx.org',
    rpcUrl: 'https://rpc.qrdx.org',
    chainId: 1337,
    tradeApiUrl: `${TRADE_URL}/api/v1`,
    tradeUrl: TRADE_URL,
  },
  testnet: {
    type: 'testnet',
    name: 'QRDX Testnet',
    nodeApiUrl: 'https://test.qrdx.org',
    rpcUrl: 'https://test.qrdx.org/rpc',
    chainId: 31337,
    tradeApiUrl: `${TRADE_URL}/api/v1-test`,
    tradeUrl: TRADE_URL,
  },
  local: {
    type: 'local',
    name: 'Local Network',
    nodeApiUrl: process.env.NEXT_PUBLIC_QRDX_NODE_URL || DEFAULT_NODE_URL,
    rpcUrl: `${process.env.NEXT_PUBLIC_QRDX_NODE_URL || DEFAULT_NODE_URL}/rpc`,
    chainId: 9999,
    tradeApiUrl: process.env.NEXT_PUBLIC_QRDX_TRADE_LOCAL_API || 'http://127.0.0.1:3100/api/v1-test',
    tradeUrl: process.env.NEXT_PUBLIC_QRDX_TRADE_LOCAL_URL || 'http://127.0.0.1:3100',
  },
}

export const NETWORK_STORAGE_KEY = 'qrdx-network'

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Network used during server rendering and before the saved selection is read:
 * NEXT_PUBLIC_QRDX_NODE_URL (a specific node, shown as Local), else
 * NEXT_PUBLIC_QRDX_NETWORK (mainnet | testnet | local), else testnet.
 */
export function getDefaultNetwork(): NetworkConfig {
  const envUrl = process.env.NEXT_PUBLIC_QRDX_NODE_URL
  if (envUrl) {
    const nodeApiUrl = trimSlash(envUrl)
    return { ...DEFAULT_NETWORKS.local, nodeApiUrl, rpcUrl: `${nodeApiUrl}/rpc` }
  }
  const named = process.env.NEXT_PUBLIC_QRDX_NETWORK as NetworkType | undefined
  return DEFAULT_NETWORKS[named && named in DEFAULT_NETWORKS ? named : 'testnet']
}

/** Hosts that no longer serve a node, and where they moved. */
const MOVED_HOSTS: Record<string, string> = {
  'https://node.test.qrdx.org': 'https://test.qrdx.org',
  'https://rpc.test.qrdx.org': 'https://test.qrdx.org/rpc',
}

/** Normalize a (possibly legacy) saved config: moved hosts, and JSON-RPC at `${nodeApiUrl}/rpc`. */
export function normalizeNetworkConfig(config: Partial<NetworkConfig> & { nodeApiUrl: string }): NetworkConfig {
  const nodeApiUrl = MOVED_HOSTS[trimSlash(config.nodeApiUrl)] ?? trimSlash(config.nodeApiUrl)
  let rpcUrl = config.rpcUrl ? trimSlash(config.rpcUrl) : ''
  rpcUrl = MOVED_HOSTS[rpcUrl] ?? rpcUrl
  if (rpcUrl === 'https://node.test.qrdx.org/rpc') rpcUrl = 'https://test.qrdx.org/rpc'
  const type = config.type ?? 'local'
  const defaults = DEFAULT_NETWORKS[type] ?? DEFAULT_NETWORKS.local
  return {
    type,
    name: config.name ?? 'Custom Network',
    chainId: config.chainId ?? defaults.chainId,
    nodeApiUrl,
    rpcUrl: rpcUrl && rpcUrl !== nodeApiUrl ? rpcUrl : `${nodeApiUrl}/rpc`,
    tradeApiUrl: config.tradeApiUrl ?? defaults.tradeApiUrl,
    tradeUrl: config.tradeUrl ?? defaults.tradeUrl,
  }
}

/** Active network configuration (browser: persisted selection; server: env default). */
export function getActiveNetwork(): NetworkConfig {
  if (typeof window !== 'undefined') {
    try {
      // Links from other QRDX apps name their network (?network=testnet); remember it.
      const linked = new URLSearchParams(window.location.search).get('network') as NetworkType | null
      if (linked && linked in DEFAULT_NETWORKS) {
        const config = DEFAULT_NETWORKS[linked]
        const saved = window.localStorage.getItem(NETWORK_STORAGE_KEY)
        if (!saved || (JSON.parse(saved) as Partial<NetworkConfig>).type !== linked) {
          window.localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(config))
        }
        // Drop it from the URL so a later switch in the network menu is not overridden.
        const url = new URL(window.location.href)
        url.searchParams.delete('network')
        window.history.replaceState(window.history.state, '', url)
        return config
      }
    } catch {
      // fall through to the saved selection
    }
    try {
      const saved = window.localStorage.getItem(NETWORK_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<NetworkConfig>
        if (parsed.nodeApiUrl) return normalizeNetworkConfig(parsed as NetworkConfig)
      }
    } catch {
      // fall through to defaults
    }
  }
  return getDefaultNetwork()
}

export function getNodeUrl(): string {
  return getActiveNetwork().nodeApiUrl
}

export function getRpcUrl(): string {
  return getActiveNetwork().rpcUrl
}

export function getWebSocketUrl(nodeUrl = getNodeUrl()): string {
  return `${nodeUrl.replace(/^http/i, 'ws')}/ws`
}

// ─── Errors ─────────────────────────────────────────────────────────────────────

export class NodeApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly endpoint: string,
  ) {
    super(message)
    this.name = 'NodeApiError'
  }

  get isNotFound() {
    return this.status === 404 || /not found/i.test(this.message)
  }

  get isRateLimited() {
    return this.status === 429
  }

  get isNetworkError() {
    return this.status === null
  }
}

export class RpcError extends Error {
  constructor(message: string, readonly code: number) {
    super(message)
    this.name = 'RpcError'
  }

  get isMethodNotFound() {
    return this.code === -32601
  }
}

// ─── Client-side pacing (mirrors the node's slowapi limits) ─────────────────────

/**
 * Sliding-window limiter: at most `max` requests in any `windowMs` span. Matches
 * slowapi's windowed limits (a token bucket would let burst + refill exceed them).
 */
class SlidingWindowLimiter {
  private readonly sent: number[] = []
  private readonly queue: Array<() => void> = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly max: number, private readonly windowMs: number) {}

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve)
      this.drain()
    })
  }

  private drain() {
    const now = Date.now()
    while (this.sent.length && now - this.sent[0] >= this.windowMs) this.sent.shift()
    while (this.queue.length && this.sent.length < this.max) {
      this.sent.push(now)
      this.queue.shift()!()
    }
    if (this.queue.length && !this.timer) {
      const wait = Math.max(10, this.windowMs - (now - this.sent[0]) + 5)
      this.timer = setTimeout(() => {
        this.timer = null
        this.drain()
      }, wait)
    }
  }
}

/** Limits from the @limiter.limit decorators in qrdx/node/main.py, kept one request under. */
const ENDPOINT_LIMITS: Record<string, [max: number, windowMs: number]> = {
  get_block: [7, 1000],
  get_transaction: [7, 1000],
  get_address_info: [7, 1000],
  get_address_tokens: [7, 1000],
  get_token_info: [7, 1000],
  get_blocks: [3, 1000],
  get_top_addresses: [4, 60_000],
  get_address_history: [7, 1000],
  get_latest_transactions: [7, 1000],
  get_indexed_transaction: [7, 1000],
  get_attestations: [9, 60_000],
  submit_tx: [29, 60_000],
}

const limiters = new Map<string, SlidingWindowLimiter>()

function limiterFor(endpoint: string): SlidingWindowLimiter | null {
  const limit = ENDPOINT_LIMITS[endpoint]
  if (!limit) return null
  const key = `${getNodeUrl()}|${endpoint}`
  let limiter = limiters.get(key)
  if (!limiter) {
    limiter = new SlidingWindowLimiter(limit[0], limit[1])
    limiters.set(key, limiter)
  }
  return limiter
}

// ─── REST ───────────────────────────────────────────────────────────────────────

type QueryValue = string | number | boolean | null | undefined

interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, QueryValue>
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
  /** Base URL override (e.g. when probing a network that is not active). */
  baseUrl?: string
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    if (typeof p.error === 'string') return p.error
    if (typeof p.detail === 'string') return p.detail
    if (Array.isArray(p.detail)) {
      return p.detail.map((d: any) => d?.msg ?? JSON.stringify(d)).join('; ')
    }
  }
  return fallback
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

async function rawRequest(endpoint: string, options: RequestOptions = {}): Promise<{ status: number; payload: unknown }> {
  const base = trimSlash(options.baseUrl ?? getNodeUrl())
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const qs = params.toString()
  const url = `${base}/${endpoint}${qs ? `?${qs}` : ''}`

  if (!options.baseUrl) await limiterFor(endpoint)?.acquire()

  const { signal, cancel } = withTimeout(options.signal, options.timeoutMs ?? 15000)
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal,
      cache: 'no-store',
    })
  } catch (err) {
    cancel()
    const reason = err instanceof Error ? err.message : String(err)
    throw new NodeApiError(`Unable to reach node at ${base} (${reason})`, null, endpoint)
  }

  let payload: unknown = null
  const text = await response.text().finally(cancel)
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  return { status: response.status, payload }
}

/**
 * Call a REST endpoint and unwrap the node's `{ ok, result }` envelope.
 * Retries HTTP 429 twice with a short backoff.
 */
export async function nodeRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  let attempt = 0
  for (;;) {
    const { status, payload } = await rawRequest(endpoint, options)

    // Another tab or a previous page load may share this IP's window on the node.
    if (status === 429 && attempt < 2) {
      attempt++
      await new Promise((r) => setTimeout(r, 1000 * attempt))
      continue
    }

    if (status < 200 || status >= 300) {
      throw new NodeApiError(extractErrorMessage(payload, `HTTP ${status}`), status, endpoint)
    }

    if (payload && typeof payload === 'object' && 'ok' in (payload as object)) {
      const envelope = payload as { ok: boolean; result?: T; error?: string }
      if (!envelope.ok) {
        throw new NodeApiError(envelope.error || 'Request failed', status, endpoint)
      }
      return envelope.result as T
    }
    return payload as T
  }
}

/** Fetch an endpoint that does not use the `{ ok, result }` envelope (healthz, readyz, /). */
export async function nodeRequestRaw<T>(endpoint: string, options: RequestOptions = {}): Promise<{ status: number; data: T }> {
  const { status, payload } = await rawRequest(endpoint, options)
  return { status, data: payload as T }
}

export async function nodeRequestText(endpoint: string, options: RequestOptions = {}): Promise<string> {
  const base = trimSlash(options.baseUrl ?? getNodeUrl())
  const { signal, cancel } = withTimeout(options.signal, options.timeoutMs ?? 10000)
  try {
    const res = await fetch(`${base}/${endpoint}`, { signal, cache: 'no-store' })
    if (!res.ok) throw new NodeApiError(`HTTP ${res.status}`, res.status, endpoint)
    return await res.text()
  } catch (err) {
    if (err instanceof NodeApiError) throw err
    throw new NodeApiError(`Unable to reach node at ${base}`, null, endpoint)
  } finally {
    cancel()
  }
}

// ─── JSON-RPC ───────────────────────────────────────────────────────────────────

let rpcId = 0

export async function rpcCall<T>(
  method: string,
  params: unknown[] = [],
  options: { baseUrl?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const url = options.baseUrl ? `${trimSlash(options.baseUrl)}/rpc` : getRpcUrl()
  const { signal, cancel } = withTimeout(options.signal, options.timeoutMs ?? 15000)
  let payload: any
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal,
      cache: 'no-store',
    })
    if (res.status === 204) return undefined as T
    const text = await res.text()
    payload = text ? JSON.parse(text) : null
    if (!res.ok && !payload?.error) {
      throw new RpcError(`HTTP ${res.status}`, -32000)
    }
  } catch (err) {
    if (err instanceof RpcError) throw err
    throw new RpcError(`Unable to reach JSON-RPC endpoint (${err instanceof Error ? err.message : err})`, -32099)
  } finally {
    cancel()
  }
  if (payload?.error) {
    throw new RpcError(payload.error.message ?? 'RPC error', payload.error.code ?? -32000)
  }
  return payload?.result as T
}

/**
 * Like rpcCall, but resolves to null when the method is unavailable (the
 * eth_/qrdx_/net_ modules are only registered when QRDX_RPC_ENABLED=true).
 */
export async function rpcCallOptional<T>(method: string, params: unknown[] = []): Promise<T | null> {
  try {
    return await rpcCall<T>(method, params)
  } catch {
    return null
  }
}

// ─── Prometheus metrics ─────────────────────────────────────────────────────────

export interface MetricSample {
  name: string
  labels: Record<string, string>
  value: number
}

export function parsePrometheus(text: string): MetricSample[] {
  const samples: MetricSample[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([a-zA-Z_:][\w:]*)(\{(.*)\})?\s+(\S+)/.exec(trimmed)
    if (!match) continue
    const labels: Record<string, string> = {}
    if (match[3]) {
      const labelRe = /(\w+)="((?:[^"\\]|\\.)*)"/g
      let lm: RegExpExecArray | null
      while ((lm = labelRe.exec(match[3]))) {
        labels[lm[1]] = lm[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }
    }
    const value = Number(match[4])
    if (!Number.isNaN(value)) samples.push({ name: match[1], labels, value })
  }
  return samples
}
