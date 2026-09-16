/**
 * Realtime chain feed from a QRDX node.
 *
 * The node publishes `{type:"hello"}`, `{type:"block", height, ts, finalized_epoch}`
 * and `{type:"ping"}` frames over both `ws://node/ws` and `http://node/stream`
 * (SSE) — see qrdx/node/observability.py. Streaming is opt-in on the node
 * (QRDX_ENABLE_STREAMING=1): when disabled the WebSocket is refused and the SSE
 * endpoint 404s, so this client degrades to polling `/get_status`.
 *
 * Transport order: WebSocket → SSE → polling, with exponential-backoff retries
 * of the push transports while polling keeps the UI live.
 */

import { getNodeUrl, getWebSocketUrl, nodeRequest } from './client'

export type StreamTransport = 'websocket' | 'sse' | 'polling'
export type StreamState = 'connecting' | 'live' | 'polling' | 'offline'

export interface BlockEvent {
  height: number
  /** Node wall-clock seconds when the block was observed. */
  observedAt: number
  finalizedEpoch: number | null
}

export interface StreamStatus {
  state: StreamState
  transport: StreamTransport | null
  nodeVersion: string | null
  lastEventAt: number | null
  error: string | null
}

type BlockListener = (event: BlockEvent) => void
type StatusListener = (status: StreamStatus) => void

interface NodeFrame {
  type: string
  height?: number
  ts?: number
  finalized_epoch?: number | null
  version?: string
}

const POLL_INTERVAL_MS = 4000
const HANDSHAKE_TIMEOUT_MS = 6000
/** The node pings every 30s of silence; treat 75s without frames as a dead socket. */
const IDLE_TIMEOUT_MS = 75_000

export class ChainStream {
  private readonly blockListeners = new Set<BlockListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private status: StreamStatus = { state: 'connecting', transport: null, nodeVersion: null, lastEventAt: null, error: null }
  private ws: WebSocket | null = null
  private sse: EventSource | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = 5000
  private lastHeight = -1
  private stopped = true
  private readonly nodeUrl: string

  constructor(nodeUrl: string = getNodeUrl()) {
    this.nodeUrl = nodeUrl.replace(/\/+$/, '')
  }

  get currentStatus(): StreamStatus {
    return this.status
  }

  get latestHeight(): number {
    return this.lastHeight
  }

  onBlock(listener: BlockListener): () => void {
    this.blockListeners.add(listener)
    return () => this.blockListeners.delete(listener)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.connectWebSocket()
  }

  stop() {
    this.stopped = true
    this.teardownPush()
    this.stopPolling()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private setStatus(patch: Partial<StreamStatus>) {
    this.status = { ...this.status, ...patch }
    for (const listener of this.statusListeners) listener(this.status)
  }

  private emitHeight(height: number, observedAt: number, finalizedEpoch: number | null) {
    this.setStatus({ lastEventAt: Date.now() })
    if (height <= this.lastHeight) return
    // The node already caps catch-up bursts; fill any gap left by a reconnect.
    const start = this.lastHeight >= 0 ? Math.max(this.lastHeight + 1, height - 63) : height
    this.lastHeight = height
    for (let h = start; h <= height; h++) {
      const event = { height: h, observedAt, finalizedEpoch }
      for (const listener of this.blockListeners) listener(event)
    }
  }

  private handleFrame(frame: NodeFrame, transport: StreamTransport) {
    this.resetIdleTimer()
    if (frame.type === 'hello') {
      this.retryDelay = 5000
      this.stopPolling()
      this.setStatus({ state: 'live', transport, nodeVersion: frame.version ?? this.status.nodeVersion, error: null })
      return
    }
    if (frame.type === 'block' && typeof frame.height === 'number') {
      if (this.status.state !== 'live') this.setStatus({ state: 'live', transport, error: null })
      this.emitHeight(frame.height, frame.ts ?? Date.now() / 1000, frame.finalized_epoch ?? null)
    }
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.teardownPush()
      this.fallBack('Stream went silent')
    }, IDLE_TIMEOUT_MS)
  }

  private teardownPush() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    if (this.sse) {
      this.sse.close()
      this.sse = null
    }
  }

  private connectWebSocket() {
    if (this.stopped || typeof WebSocket === 'undefined') return this.connectSse()
    if (this.status.state !== 'polling' && this.status.state !== 'offline') {
      this.setStatus({ state: 'connecting' })
    }
    let greeted = false
    let ws: WebSocket
    try {
      ws = new WebSocket(getWebSocketUrl(this.nodeUrl))
    } catch {
      return this.connectSse()
    }
    this.ws = ws
    const handshake = setTimeout(() => {
      if (!greeted) {
        this.teardownPush()
        this.connectSse()
      }
    }, HANDSHAKE_TIMEOUT_MS)

    ws.onmessage = (msg) => {
      try {
        const frame = JSON.parse(String(msg.data)) as NodeFrame
        if (frame.type === 'hello') {
          greeted = true
          clearTimeout(handshake)
        }
        this.handleFrame(frame, 'websocket')
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => {
      clearTimeout(handshake)
      this.ws = null
      if (this.stopped) return
      if (!greeted) this.connectSse() // refused (streaming disabled) or unreachable
      else this.fallBack('WebSocket closed')
    }
    ws.onerror = () => {
      // onclose follows and decides the next step
    }
  }

  private connectSse() {
    if (this.stopped) return
    if (typeof EventSource === 'undefined') return this.fallBack('Push streaming unsupported')
    let greeted = false
    const sse = new EventSource(`${this.nodeUrl}/stream`)
    this.sse = sse
    const handshake = setTimeout(() => {
      if (!greeted) {
        this.teardownPush()
        this.fallBack('Streaming disabled on node')
      }
    }, HANDSHAKE_TIMEOUT_MS)

    sse.onmessage = (msg) => {
      try {
        const frame = JSON.parse(msg.data) as NodeFrame
        if (!greeted) {
          greeted = true
          clearTimeout(handshake)
        }
        this.handleFrame(frame, 'sse')
      } catch {
        // ignore keepalive comments / malformed frames
      }
    }
    sse.onerror = () => {
      clearTimeout(handshake)
      // EventSource auto-reconnects on transient drops; a 404 (streaming disabled) closes it.
      if (!greeted || sse.readyState === EventSource.CLOSED) {
        this.teardownPush()
        this.fallBack(greeted ? 'Event stream closed' : 'Streaming disabled on node')
      }
    }
  }

  private fallBack(reason: string) {
    if (this.stopped) return
    this.startPolling(reason)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connectWebSocket()
    }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 120_000)
  }

  private startPolling(reason: string) {
    if (this.pollTimer) return
    const poll = async () => {
      try {
        const status = await nodeRequest<{ height: number }>('get_status', { baseUrl: this.nodeUrl, timeoutMs: 8000 })
        if (this.status.state !== 'live' && (this.status.state !== 'polling' || this.status.error !== reason)) {
          this.setStatus({ state: 'polling', transport: 'polling', error: reason })
        }
        this.emitHeight(status.height, Date.now() / 1000, null)
      } catch (err) {
        if (this.status.state !== 'live') {
          this.setStatus({ state: 'offline', transport: null, error: err instanceof Error ? err.message : 'Node unreachable' })
        }
      }
    }
    void poll()
    this.pollTimer = setInterval(poll, POLL_INTERVAL_MS)
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }
}
