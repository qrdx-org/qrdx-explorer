'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, Cpu, Globe, Radio, Server, Users, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useChain } from '@/components/explorer/ChainProvider'
import {
  CopyButton,
  DetailRow,
  EmptyState,
  ErrorState,
  LoadingState,
  NetworkModeBadge,
  StatCard,
} from '@/components/explorer/common'
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
    <span className={`inline-flex items-center gap-1 ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </span>
  )
}

function Root({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-start gap-1">
      <span className="font-mono text-xs break-all">{value}</span>
      <CopyButton value={value} />
    </span>
  )
}

export default function NetworkPage() {
  const { network, stream, height } = useChain()
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">Network</h1>
          <NetworkModeBadge />
        </div>
        <p className="text-muted-foreground">Health, consensus and peer information from the connected node</p>
      </div>

      {health && !health.online && (
        <div className="mb-6">
          <ErrorState title="Node unreachable" error={`No response from ${network.nodeApiUrl}/healthz`} onRetry={refresh} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Chain Height" icon={Activity} value={height >= 0 ? height.toLocaleString() : status ? status.height.toLocaleString() : '—'} />
        <StatCard
          label="Finalized Epoch"
          icon={CheckCircle2}
          value={metrics?.finalizedEpoch != null && metrics.finalizedEpoch >= 0 ? metrics.finalizedEpoch : '—'}
          hint={metrics ? `Justified ${metrics.justifiedEpoch ?? '—'} · lag ${metrics.finalityLagEpochs ?? '—'} epoch(s)` : undefined}
        />
        <StatCard label="Peers" icon={Users} value={metrics?.peerCount ?? peers?.length ?? '—'} hint={metrics?.blocksReceivedFromPeers != null ? `${formatInteger(metrics.blocksReceivedFromPeers)} blocks received via p2p` : undefined} />
        <StatCard label="Mempool" icon={Cpu} value={metrics?.mempoolPending ?? '—'} hint="Pending transactions" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Node</CardTitle>
            <CardDescription>{network.name}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <DetailRow label="API Endpoint"><span className="font-mono">{network.nodeApiUrl}</span></DetailRow>
            <DetailRow label="Node ID">{status?.nodeId ? <span className="font-mono break-all">{status.nodeId}</span> : '—'}</DetailRow>
            <DetailRow label="Version">{health?.version ?? '—'}</DetailRow>
            <DetailRow label="Uptime">{formatDuration(health?.uptimeSeconds ?? metrics?.uptimeSeconds)}</DetailRow>
            <DetailRow label="Liveness (/healthz)"><Flag ok={health ? health.online : null} label={health?.online ? 'Up' : 'Down'} /></DetailRow>
            <DetailRow label="Readiness (/readyz)"><Flag ok={health ? health.ready : null} label={health?.ready ? 'Serving chain data' : 'Not ready'} /></DetailRow>
            <DetailRow label="Tip Hash">{status?.lastBlockHash ? <Root value={status.lastBlockHash} /> : '—'}</DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Interfaces</CardTitle>
            <CardDescription>APIs the explorer is using on this node</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <DetailRow label="REST API"><Flag ok={status ? true : health ? health.online : null} label="Available" /></DetailRow>
            <DetailRow label="Realtime Stream">
              <Flag ok={stream.state === 'live' ? true : stream.state === 'connecting' ? null : false} label={stream.state === 'live' ? 'Streaming' : 'Unavailable'} />
              <div className="text-xs text-muted-foreground mt-1">
                Transport: {transportLabel}
                {metrics?.streamingEnabled === false && ' · streaming disabled on node (QRDX_ENABLE_STREAMING)'}
                {stream.error && stream.state !== 'live' && ` · ${stream.error}`}
              </div>
            </DetailRow>
            <DetailRow label="JSON-RPC (/rpc)">
              <Flag ok={rpc ? rpc.available : null} label={rpc?.available ? 'eth_* / web3_* enabled' : 'EVM modules disabled'} />
              {rpc?.available && (
                <div className="text-xs text-muted-foreground mt-1">
                  {rpc.clientVersion} · eth_chainId {rpc.chainId}
                  {rpc.gasPrice && ` · gas price ${rpc.gasPrice} Gwei`}
                </div>
              )}
              {rpc && !rpc.available && <div className="text-xs text-muted-foreground mt-1">Start the node with QRDX_RPC_ENABLED=true for contract data.</div>}
            </DetailRow>
            <DetailRow label="Metrics (/metrics)">
              <Flag ok={metrics ? true : metricsError ? false : null} label={metrics ? 'Prometheus exporter' : 'Unavailable'} />
            </DetailRow>
            <DetailRow label="Stream Subscribers">{metrics?.streamSubscribers ?? '—'}</DetailRow>
            <DetailRow label="Slashing Events">{metrics?.slashingEvents ?? '—'}</DetailRow>
            <DetailRow label="Reorgs Handled">{metrics?.reorgs ?? 0}</DetailRow>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Peers</CardTitle>
          <CardDescription>Active, non-banned peers known to this node (<code>/get_nodes</code>)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!peers ? (
            <LoadingState label="Loading peers…" />
          ) : peers.length === 0 ? (
            <EmptyState title="No peers" description="This node currently has no active peers." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium text-muted-foreground">Node ID</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">URL</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Visibility</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Reputation</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {peers.map((peer) => (
                    <tr key={peer.nodeId}>
                      <td className="p-4 font-mono">{peer.nodeId}</td>
                      <td className="p-4 font-mono text-muted-foreground">{peer.url || 'private'}</td>
                      <td className="p-4">{peer.isPublic ? 'Public' : 'Private'}</td>
                      <td className="p-4 text-right font-mono">{peer.reputationScore ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>State Commitments</CardTitle>
            <CardDescription>Unified BLAKE3-512 state root and its domains (<code>/get_unified_state_root</code>)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {roots === undefined ? (
              <LoadingState label="Loading state roots…" />
            ) : roots === null ? (
              <EmptyState title="State roots unavailable" />
            ) : (
              <>
                <DetailRow label="Unified Root"><Root value={roots.unifiedStateRoot} /></DetailRow>
                <DetailRow label="UTXO Root"><Root value={roots.utxoRoot} /></DetailRow>
                <DetailRow label="Account Root"><Root value={roots.accountRoot} /></DetailRow>
                <DetailRow label="Exchange Root"><Root value={roots.exchangeRoot} /></DetailRow>
                <DetailRow label="Token Root"><Root value={roots.tokenRoot} /></DetailRow>
                <DetailRow label="Consensus Enforced">{roots.enforced ? 'Yes' : 'Observed only'}</DetailRow>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RPC Traffic</CardTitle>
            <CardDescription>JSON-RPC calls handled by this node since start</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!metrics ? (
              metricsError ? <EmptyState title="Metrics unavailable" description={metricsError} /> : <LoadingState label="Loading metrics…" />
            ) : metrics.rpcRequests.length === 0 ? (
              <EmptyState title="No RPC traffic yet" />
            ) : (
              <div className="divide-y max-h-[380px] overflow-y-auto">
                {metrics.rpcRequests.map((m) => (
                  <div key={m.method} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="font-mono">{m.method}</span>
                    <span className="font-mono">
                      {formatInteger(m.count)}
                      {m.errors > 0 && <span className="text-red-500"> ({formatInteger(m.errors)} err)</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
