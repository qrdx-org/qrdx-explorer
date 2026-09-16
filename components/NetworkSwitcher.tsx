'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_NETWORKS,
  getActiveNetwork,
  getNodeHealth,
  NETWORK_STORAGE_KEY,
  normalizeNetworkConfig,
  rpcCall,
  type NetworkConfig,
  type NetworkType,
} from '@/lib/qrdx'

const CUSTOM_CONFIGS_KEY = 'qrdx-custom-configs'
const NETWORK_ORDER: NetworkType[] = ['mainnet', 'testnet', 'local']
const DESCRIPTIONS: Record<NetworkType, string> = {
  mainnet: 'Production network',
  testnet: 'Public test network',
  local: 'Your own node',
}

interface ProbeResult {
  checking: boolean
  online: boolean
  ready: boolean
  version: string | null
  height: number | null
  rpc: boolean
  chainId: number | null
}

const IDLE_PROBE: ProbeResult = { checking: false, online: false, ready: false, version: null, height: null, rpc: false, chainId: null }

function loadCustomConfigs(): Record<NetworkType, NetworkConfig> {
  try {
    const saved = localStorage.getItem(CUSTOM_CONFIGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Record<NetworkType, NetworkConfig>>
      return Object.fromEntries(
        NETWORK_ORDER.map((type) => [
          type,
          parsed[type]?.nodeApiUrl ? normalizeNetworkConfig({ ...DEFAULT_NETWORKS[type], ...parsed[type]!, type }) : DEFAULT_NETWORKS[type],
        ]),
      ) as Record<NetworkType, NetworkConfig>
    }
  } catch {
    // ignore corrupt storage
  }
  return { ...DEFAULT_NETWORKS }
}

export default function NetworkSwitcher() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<NetworkType>('local')
  const [configs, setConfigs] = useState<Record<NetworkType, NetworkConfig>>(DEFAULT_NETWORKS)
  const [editing, setEditing] = useState<NetworkType | null>(null)
  const [probes, setProbes] = useState<Record<NetworkType, ProbeResult>>({ mainnet: IDLE_PROBE, testnet: IDLE_PROBE, local: IDLE_PROBE })

  useEffect(() => {
    const custom = loadCustomConfigs()

    // Shared links carry ?network=…&api=… (see ShareAddressDialog).
    const params = new URLSearchParams(window.location.search)
    const networkParam = params.get('network') as NetworkType | null
    if (networkParam && NETWORK_ORDER.includes(networkParam)) {
      const api = params.get('api')
      const rpc = params.get('rpc')
      const config = normalizeNetworkConfig({
        ...custom[networkParam],
        ...(api ? { nodeApiUrl: api } : {}),
        ...(rpc ? { rpcUrl: rpc } : { rpcUrl: api ? '' : custom[networkParam].rpcUrl }),
        type: networkParam,
      })
      custom[networkParam] = config
      localStorage.setItem(CUSTOM_CONFIGS_KEY, JSON.stringify(custom))
      localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(config))
    }

    setConfigs(custom)
    setSelected(getActiveNetwork().type)
  }, [])

  const probe = useCallback(async (type: NetworkType, config: NetworkConfig) => {
    setProbes((prev) => ({ ...prev, [type]: { ...prev[type], checking: true } }))
    const [health, chainId] = await Promise.all([
      getNodeHealth(config.nodeApiUrl),
      rpcCall<string>('eth_chainId', [], { baseUrl: config.nodeApiUrl, timeoutMs: 6000 }).catch(() => null),
    ])
    setProbes((prev) => ({
      ...prev,
      [type]: {
        checking: false,
        online: health.online,
        ready: health.ready,
        version: health.version,
        height: health.readyHeight,
        rpc: chainId != null,
        chainId: chainId ? parseInt(chainId, 16) : null,
      },
    }))
  }, [])

  useEffect(() => {
    if (!open) return
    NETWORK_ORDER.forEach((type) => void probe(type, configs[type]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const connect = (type: NetworkType) => {
    const config = normalizeNetworkConfig(configs[type])
    const nextConfigs = { ...configs, [type]: config }
    localStorage.setItem(CUSTOM_CONFIGS_KEY, JSON.stringify(nextConfigs))
    localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(config))
    setSelected(type)
    setOpen(false)
    // Drop share-link params so the stored selection wins after reload.
    const url = new URL(window.location.href)
    ;['network', 'api', 'rpc'].forEach((p) => url.searchParams.delete(p))
    window.location.replace(url.toString())
  }

  const updateUrl = (type: NetworkType, field: 'nodeApiUrl' | 'rpcUrl', value: string) => {
    setConfigs((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  const statusBadge = (result: ProbeResult) => {
    if (result.checking) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" /> Checking…
        </span>
      )
    }
    if (!result.online) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Offline
        </span>
      )
    }
    return (
      <span className={`flex items-center gap-1.5 text-xs ${result.ready ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
        <span className={`h-2 w-2 rounded-full ${result.ready ? 'bg-green-500' : 'bg-yellow-500'}`} />
        {result.ready ? 'Online' : 'Syncing'}
      </span>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Network className="h-4 w-4" />
          <span className="hidden sm:inline">{configs[selected].name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Select Network</DialogTitle>
          <DialogDescription>Choose which QRDX node the explorer reads from</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {NETWORK_ORDER.map((type) => {
            const config = configs[type]
            const result = probes[type]
            const isSelected = selected === type
            return (
              <div key={type} className={`p-4 rounded-lg border-2 ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {config.name}
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="text-sm text-muted-foreground">{DESCRIPTIONS[type]}</div>
                  </div>
                  {statusBadge(result)}
                </div>
                <div className="text-xs text-muted-foreground font-mono break-all mb-2">{config.nodeApiUrl}</div>
                {result.online && !result.checking && (
                  <div className="text-xs text-muted-foreground mb-3">
                    {result.version && `v${result.version}`}
                    {result.height != null && ` · height ${result.height.toLocaleString()}`}
                    {result.rpc ? ` · JSON-RPC chain ${result.chainId}` : ' · JSON-RPC disabled'}
                  </div>
                )}

                {editing === type ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`${type}-api`} className="text-xs">Node API URL</Label>
                      <Input id={`${type}-api`} type="url" value={config.nodeApiUrl} onChange={(e) => updateUrl(type, 'nodeApiUrl', e.target.value)} className="mt-1" placeholder="http://127.0.0.1:3007" />
                    </div>
                    <div>
                      <Label htmlFor={`${type}-rpc`} className="text-xs">JSON-RPC URL (optional)</Label>
                      <Input id={`${type}-rpc`} type="url" value={config.rpcUrl} onChange={(e) => updateUrl(type, 'rpcUrl', e.target.value)} className="mt-1" placeholder={`${config.nodeApiUrl}/rpc`} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => connect(type)}>Connect</Button>
                      <Button size="sm" variant="outline" onClick={() => void probe(type, normalizeNetworkConfig(config))}>Test</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setConfigs((prev) => ({ ...prev, [type]: DEFAULT_NETWORKS[type] }))
                          setEditing(null)
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant={isSelected ? 'default' : 'outline'} className="flex-1" onClick={() => connect(type)}>
                      {isSelected ? 'Reconnect' : 'Connect'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(type)}>Edit</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
