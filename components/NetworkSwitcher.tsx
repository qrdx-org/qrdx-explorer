'use client'

import { useState, useEffect } from 'react'
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
import { Network, Check } from 'lucide-react'

type NetworkType = 'mainnet' | 'testnet' | 'local'

interface NetworkConfig {
  type: NetworkType
  name: string
  rpcUrl: string
  nodeApiUrl: string
  chainId: number
}

interface NetworkStatus {
  rpcOnline: boolean
  nodeApiOnline: boolean
  checking: boolean
}

const NETWORKS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    type: 'mainnet',
    name: 'QRDX Mainnet',
    rpcUrl: 'https://rpc.qrdx.org',
    nodeApiUrl: 'https://node.qrdx.org',
    chainId: 1337,
  },
  testnet: {
    type: 'testnet',
    name: 'QRDX Testnet',
    rpcUrl: 'https://rpc.test.qrdx.org',
    nodeApiUrl: 'https://node.test.qrdx.org',
    chainId: 31337,
  },
  local: {
    type: 'local',
    name: 'Local Network',
    rpcUrl: 'http://localhost:3007',
    nodeApiUrl: 'http://localhost:3007',
    chainId: 31337,
  },
}

export default function NetworkSwitcher() {
  const [open, setOpen] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>('mainnet')
  const [customConfigs, setCustomConfigs] = useState<Record<NetworkType, NetworkConfig>>(NETWORKS)
  const [editingNetwork, setEditingNetwork] = useState<NetworkType | null>(null)
  const [networkStatus, setNetworkStatus] = useState<Record<NetworkType, NetworkStatus>>({
    mainnet: { rpcOnline: false, nodeApiOnline: false, checking: false },
    testnet: { rpcOnline: false, nodeApiOnline: false, checking: false },
    local: { rpcOnline: false, nodeApiOnline: false, checking: false },
  })

  // Check network status
  const checkNetworkStatus = async (network: NetworkType) => {
    const config = customConfigs[network]
    setNetworkStatus(prev => ({
      ...prev,
      [network]: { ...prev[network], checking: true }
    }))

    let rpcOnline = false
    let nodeApiOnline = false

    // Check RPC endpoint
    try {
      const rpcResponse = await fetch(config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        signal: AbortSignal.timeout(5000),
      })
      rpcOnline = rpcResponse.ok
    } catch (error) {
      rpcOnline = false
    }

    // Check Node API endpoint
    try {
      const nodeResponse = await fetch(`${config.nodeApiUrl}/get_status`, {
        signal: AbortSignal.timeout(5000),
      })
      nodeApiOnline = nodeResponse.ok
    } catch (error) {
      nodeApiOnline = false
    }

    setNetworkStatus(prev => ({
      ...prev,
      [network]: { rpcOnline, nodeApiOnline, checking: false }
    }))
  }

  useEffect(() => {
    // Load custom configurations from localStorage first
    const customSaved = localStorage.getItem('qrdx-custom-configs')
    if (customSaved) {
      try {
        const customData = JSON.parse(customSaved)
        setCustomConfigs(customData)
      } catch (e) {
        console.error('Failed to parse custom configs:', e)
      }
    }

    // Check URL parameters first
    const params = new URLSearchParams(window.location.search)
    const networkParam = params.get('network')
    const rpcParam = params.get('rpc')
    const apiParam = params.get('api')

    if (networkParam && (networkParam === 'mainnet' || networkParam === 'testnet' || networkParam === 'local')) {
      const networkType = networkParam as NetworkType
      const baseConfig = customSaved ? JSON.parse(customSaved)[networkType] || NETWORKS[networkType] : NETWORKS[networkType]
      const config = { ...baseConfig }
      
      // For local network, allow custom RPC and API from URL
      if (networkType === 'local' && (rpcParam || apiParam)) {
        if (rpcParam) config.rpcUrl = rpcParam
        if (apiParam) config.nodeApiUrl = apiParam
      }
      
      setSelectedNetwork(networkType)
      if (customSaved) {
        const customData = JSON.parse(customSaved)
        customData[networkType] = config
        setCustomConfigs(customData)
        localStorage.setItem('qrdx-custom-configs', JSON.stringify(customData))
      }
      localStorage.setItem('qrdx-network', JSON.stringify(config))
      return
    }

    // Load saved network from localStorage
    const saved = localStorage.getItem('qrdx-network')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.type && NETWORKS[data.type as NetworkType]) {
          setSelectedNetwork(data.type)
        }
      } catch (e) {
        console.error('Failed to parse network config:', e)
      }
    }
  }, [])

  useEffect(() => {
    // Check all network statuses when dialog opens
    if (open) {
      Object.keys(NETWORKS).forEach(network => {
        checkNetworkStatus(network as NetworkType)
      })
    }
  }, [open])

  const handleNetworkChange = (network: NetworkType) => {
    const config = customConfigs[network]
    
    // Save to localStorage before reload
    localStorage.setItem('qrdx-network', JSON.stringify(config))
    localStorage.setItem('qrdx-custom-configs', JSON.stringify(customConfigs))
    
    setSelectedNetwork(network)
    
    // Update environment variables for the app
    if (typeof window !== 'undefined') {
      const w = window as any
      w.__QRDX_RPC_URL__ = config.rpcUrl
      w.__QRDX_NODE_URL__ = config.nodeApiUrl
    }
    
    setOpen(false)
    
    // Small delay to ensure localStorage is written
    setTimeout(() => {
      window.location.reload()
    }, 50)
  }

  const handleCustomConfigChange = (network: NetworkType, field: 'rpcUrl' | 'nodeApiUrl', value: string) => {
    setCustomConfigs(prev => ({
      ...prev,
      [network]: {
        ...prev[network],
        [field]: value
      }
    }))
  }

  const resetToDefaults = (network: NetworkType) => {
    setCustomConfigs(prev => ({
      ...prev,
      [network]: NETWORKS[network]
    }))
  }

  const currentNetwork = customConfigs[selectedNetwork]

  const getStatusIndicator = (status: NetworkStatus) => {
    if (status.checking) {
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">Checking...</span>
        </div>
      )
    }

    const bothOnline = status.rpcOnline && status.nodeApiOnline

    if (bothOnline) {
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400">Online</span>
        </div>
      )
    }

    if (status.rpcOnline || status.nodeApiOnline) {
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          <span className="text-xs text-yellow-600 dark:text-yellow-400">Partial</span>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-red-500" />
        <span className="text-xs text-red-600 dark:text-red-400">Offline</span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Network className="h-4 w-4" />
          <span className="hidden sm:inline">{currentNetwork.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Network</DialogTitle>
          <DialogDescription>
            Choose which QRDX network to connect to
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Mainnet */}
          <button
            onClick={() => handleNetworkChange('mainnet')}
            className={`flex flex-col gap-2 p-4 rounded-lg border-2 transition-colors ${
              selectedNetwork === 'mainnet' 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <div className="font-semibold">QRDX Mainnet</div>
                <div className="text-sm text-muted-foreground">Production network</div>
              </div>
              {selectedNetwork === 'mainnet' && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Chain ID: 1337</span>
              {getStatusIndicator(networkStatus.mainnet)}
            </div>
          </button>

          {/* Testnet */}
          <div className={`p-4 rounded-lg border-2 ${
            selectedNetwork === 'testnet' 
              ? 'border-primary bg-primary/5' 
              : 'border-border'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-left flex-1">
                <div className="font-semibold">QRDX Testnet</div>
                <div className="text-sm text-muted-foreground">Test network</div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIndicator(networkStatus.testnet)}
                {selectedNetwork === 'testnet' && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
            
            {editingNetwork === 'testnet' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="testnet-rpc" className="text-xs">RPC URL</Label>
                  <Input
                    id="testnet-rpc"
                    type="url"
                    value={customConfigs.testnet.rpcUrl}
                    onChange={(e) => handleCustomConfigChange('testnet', 'rpcUrl', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="testnet-api" className="text-xs">Node API URL</Label>
                  <Input
                    id="testnet-api"
                    type="url"
                    value={customConfigs.testnet.nodeApiUrl}
                    onChange={(e) => handleCustomConfigChange('testnet', 'nodeApiUrl', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      handleNetworkChange('testnet')
                      setEditingNetwork(null)
                    }}
                    className="flex-1"
                    size="sm"
                  >
                    Connect
                  </Button>
                  <Button 
                    onClick={() => {
                      resetToDefaults('testnet')
                      setEditingNetwork(null)
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleNetworkChange('testnet')}
                  className="flex-1"
                  size="sm"
                  variant="outline"
                >
                  Connect
                </Button>
                <Button 
                  onClick={() => setEditingNetwork('testnet')}
                  size="sm"
                  variant="ghost"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>

          {/* Local Network */}
          <div className={`p-4 rounded-lg border-2 ${
            selectedNetwork === 'local' 
              ? 'border-primary bg-primary/5' 
              : 'border-border'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-left flex-1">
                <div className="font-semibold">Local Network</div>
                <div className="text-sm text-muted-foreground">Local development</div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIndicator(networkStatus.local)}
                {selectedNetwork === 'local' && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
            
            {editingNetwork === 'local' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="local-rpc" className="text-xs">RPC URL</Label>
                  <Input
                    id="local-rpc"
                    type="url"
                    value={customConfigs.local.rpcUrl}
                    onChange={(e) => handleCustomConfigChange('local', 'rpcUrl', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="local-api" className="text-xs">Node API URL</Label>
                  <Input
                    id="local-api"
                    type="url"
                    value={customConfigs.local.nodeApiUrl}
                    onChange={(e) => handleCustomConfigChange('local', 'nodeApiUrl', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      handleNetworkChange('local')
                      setEditingNetwork(null)
                    }}
                    className="flex-1"
                    size="sm"
                  >
                    Connect
                  </Button>
                  <Button 
                    onClick={() => {
                      resetToDefaults('local')
                      setEditingNetwork(null)
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleNetworkChange('local')}
                  className="flex-1"
                  size="sm"
                  variant="outline"
                >
                  Connect
                </Button>
                <Button 
                  onClick={() => setEditingNetwork('local')}
                  size="sm"
                  variant="ghost"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
