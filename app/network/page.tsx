'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, Cpu, Globe, Radio, Server, Users, XCircle } from 'lucide-react'
import { useChain, useHead } from '@/components/explorer/ChainProvider'
import { CopyButton } from '@/components/explorer/common'
import { Panel, Row, Tile } from '@/components/explorer/ui'
import {
  getChainStatus,
  getNodeHealth,
  getNodeMetrics,
  getPeers,
  getRpcInfo,
  getStateRoots,
  type ChainStatus,
  type NodeHealth,
  type NodeMetrics,
  type PeerInfo,
  type RpcInfo,
  type StateRoots,
} from '@/lib/qrdx'
import { formatDuration, formatInteger } from '@/lib/format'

function Flag({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok == null) return <span className="text-muted-foreground">Unknown</span>
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? 'text-bid' : 'text-ask'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </span>
  )
}

function Hash({ value }: { value: string | undefined | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-start gap-1">
      <span className="break-all text-left font-mono text-xs">{value}</span>
      <CopyButton value={value} />
    </span>
  )
}

export default function NetworkPage() {
  const { network, stream, spec } = useChain()
  const height = useHead(1000)
  const [health, setHealth] = useState<NodeHealth | null>(null)
  const [status, setStatus] = useState<ChainStatus | null>(null)
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [peers, setPeers] = useState<PeerInfo[] | null>(null)
  const [rpc, setRpc] = useState<RpcInfo | null>(null)
  const [roots, setRoots] = useState<StateRoots | null | undefined>(undefined)

  const refresh = useCallback(() => {
    getNodeHealth().then(setHealth)
    getChainStatus().then(setStatus).catch(() => undefined)
    getNodeMetrics()
      .then((m) => (setMetrics(m), setMetricsError(null)))
      .catch((err) => setMetricsError(err instanceof Error ? err.message : 'Metrics unavailable'))
    getPeers().then(setPeers).catch(() => setPeers([]))
    getStateRoots().then(setRoots)
  }, [])

  useEffect(() => {
    refresh()
    getRpcInfo().then(setRpc)
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [refresh])

  const transportLabel =
    stream.transport === 'websocket' ? 'WebSocket (/ws)' : stream.transport === 'sse' ? 'Server-Sent Events (/stream)' : stream.transport === 'polling' ? 'HTTP polling (/get_status)' : '—'
  const chainId = spec?.chain_id ?? rpc?.chainId ?? null

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Network</h1>
        <p className="mt-1 text-sm text-muted-foreground">The connected node: health, interfaces, peers and state commitments.</p>
      </div>

      {health && !health.online && (
        <Panel bodyClassName="flex items-center justify-between gap-4 p-4">
          <span className="text-sm text-ask">No response from {network.nodeApiUrl}/healthz</span>
          <button onClick={refresh} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Retry
          </button>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Chain height" icon={<Activity className="h-4 w-4" />} value={height >= 0 ? height.toLocaleString() : status ? status.height.toLocaleString() : '—'} sub={chainId != null ? `chain ID ${chainId}` : ''} />
        <Tile
          label="Finalized epoch"
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={metrics?.finalizedEpoch != null && metrics.finalizedEpoch >= 0 ? metrics.finalizedEpoch.toLocaleString() : '—'}
          sub={metrics ? `justified ${metrics.justifiedEpoch ?? '—'} · lag ${metrics.finalityLagEpochs ?? '—'}` : ''}
        />
        <Tile label="Peers" icon={<Users className="h-4 w-4" />} value={metrics?.peerCount ?? peers?.length ?? '—'} sub={spec?.peers ? `${spec.peers.reporting} announce their fork id` : ''} />
        <Tile label="Mempool" icon={<Cpu className="h-4 w-4" />} value={metrics?.mempoolPending ?? '—'} sub="pending transactions" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Node" icon={<Server className="h-4 w-4" />}>
          <Row k="API endpoint">
            <span className="font-mono text-xs">{network.nodeApiUrl}</span>
          </Row>
          <Row k="Node ID" wrap>
            {status?.nodeId ? <span className="font-mono text-xs">{status.nodeId}</span> : '—'}
          </Row>
          <Row k="Version">{health?.version ?? spec?.node_version ?? '—'}</Row>
          <Row k="Build">{spec?.build ? `${spec.build.version} · commit ${spec.build.commit}` : '—'}</Row>
          <Row k="Network">{spec ? `${spec.network}${spec.dev ? ' (dev)' : ''}` : '—'}</Row>
          <Row k="Fork ID">{spec ? <span className="font-mono text-xs">{spec.fork_id.hash}</span> : '—'}</Row>
          <Row k="Uptime">{formatDuration(health?.uptimeSeconds ?? metrics?.uptimeSeconds)}</Row>
          <Row k="Liveness (/healthz)">
            <Flag ok={health ? health.online : null} label={health?.online ? 'Up' : 'Down'} />
          </Row>
          <Row k="Readiness (/readyz)">
            <Flag ok={health ? health.ready : null} label={health?.ready ? 'Serving chain data' : 'Not ready'} />
          </Row>
          <Row k="Tip hash" wrap>
            <Hash value={status?.lastBlockHash} />
          </Row>
        </Panel>

        <Panel title="Interfaces" icon={<Radio className="h-4 w-4" />}>
          <Row k="REST API">
            <Flag ok={status ? true : health ? health.online : null} label="Available" />
          </Row>
          <Row k="Realtime stream">
            <Flag ok={stream.state === 'live' ? true : stream.state === 'connecting' ? null : false} label={stream.state === 'live' ? `Streaming · ${transportLabel}` : 'Unavailable'} />
          </Row>
          {metrics?.streamingEnabled === false && <Row k="Note">Streaming disabled on the node (QRDX_ENABLE_STREAMING)</Row>}
          {stream.error && stream.state !== 'live' && <Row k="Stream error">{stream.error}</Row>}
          <Row k="JSON-RPC (/rpc)">
            <Flag ok={rpc ? rpc.available : null} label={rpc?.available ? `${rpc.clientVersion ?? 'enabled'}` : 'EVM modules disabled'} />
          </Row>
          {rpc?.gasPrice && <Row k="Gas price">{rpc.gasPrice} Gwei</Row>}
          <Row k="Chain spec (/chain_spec)">
            <Flag ok={spec ? true : null} label={spec ? `format ${spec.spec_format}` : 'Not served'} />
          </Row>
          <Row k="Metrics (/metrics)">
            <Flag ok={metrics ? true : metricsError ? false : null} label={metrics ? 'Prometheus exporter' : 'Unavailable'} />
          </Row>
          <Row k="Stream subscribers">{metrics?.streamSubscribers ?? '—'}</Row>
          <Row k="Slashing events">{metrics?.slashingEvents ?? '—'}</Row>
          <Row k="Reorgs handled">{metrics?.reorgs ?? 0}</Row>
        </Panel>
      </div>

      <Panel title="Peers" icon={<Globe className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">/get_nodes</span>}>
        {!peers ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading peers…</p>
        ) : peers.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">This node has no active peers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">Node ID</th>
                  <th className="px-3 py-2.5 font-medium">URL</th>
                  <th className="px-3 py-2.5 font-medium">Visibility</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reputation</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((peer) => (
                  <tr key={peer.nodeId} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{peer.nodeId}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{peer.url || 'private'}</td>
                    <td className="px-3 py-2">{peer.isPublic ? 'Public' : 'Private'}</td>
                    <td className="px-4 py-2 text-right">{peer.reputationScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="State commitments" icon={<CheckCircle2 className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">/get_unified_state_root</span>}>
          {roots === undefined ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading state roots…</p>
          ) : roots === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">State roots unavailable.</p>
          ) : (
            <>
              <Row k="Unified root" wrap>
                <Hash value={roots.unifiedStateRoot} />
              </Row>
              <Row k="UTXO root" wrap>
                <Hash value={roots.utxoRoot} />
              </Row>
              <Row k="Account root" wrap>
                <Hash value={roots.accountRoot} />
              </Row>
              <Row k="Exchange root" wrap>
                <Hash value={roots.exchangeRoot} />
              </Row>
              <Row k="Token root" wrap>
                <Hash value={roots.tokenRoot} />
              </Row>
              <Row k="Consensus enforced">{roots.enforced ? 'Yes' : 'Observed only'}</Row>
              {spec?.active_features.includes('incremental_state_root') && <Row k="Commitment">LtHash accumulators, updated per change</Row>}
            </>
          )}
        </Panel>

        <Panel title="RPC traffic" icon={<Activity className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">since the node started</span>}>
          {!metrics ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{metricsError ?? 'Loading metrics…'}</p>
          ) : metrics.rpcRequests.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No RPC traffic yet.</p>
          ) : (
            <div className="max-h-[380px] divide-y overflow-y-auto">
              {metrics.rpcRequests.map((m) => (
                <div key={m.method} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-mono text-xs">{m.method}</span>
                  <span className="num">
                    {formatInteger(m.count)}
                    {m.errors > 0 && <span className="text-ask"> ({formatInteger(m.errors)} err)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
