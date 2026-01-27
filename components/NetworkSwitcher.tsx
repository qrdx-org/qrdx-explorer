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

type NetworkType = 'mainnet' | 'testnet' | 'custom'

interface NetworkConfig {
  type: NetworkType
  name: string
  rpcUrl: string
  chainId: number
}

const NETWORKS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    type: 'mainnet',
    name: 'QRDX Mainnet',
    rpcUrl: 'https://rpc.qrdx.org',
    chainId: 1337,
  },
  testnet: {
    type: 'testnet',
    name: 'QRDX Testnet',
    rpcUrl: 'https://testnet-rpc.qrdx.org',
    chainId: 31337,
  },
  custom: {
    type: 'custom',
    name: 'Custom RPC',
    rpcUrl: 'http://localhost:8545',
    chainId: 31337,
  },
}

export default function NetworkSwitcher() {
  const [open, setOpen] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>('mainnet')
  const [customRpc, setCustomRpc] = useState('http://localhost:8545')
  const [customChainId, setCustomChainId] = useState('31337')

  useEffect(() => {
    // Load saved network from localStorage
    const saved = localStorage.getItem('qrdx-network')
    if (saved) {
      const data = JSON.parse(saved)
      setSelectedNetwork(data.type)
      if (data.type === 'custom') {
        setCustomRpc(data.rpcUrl)
        setCustomChainId(data.chainId.toString())
      }
    }
  }, [])

  const handleNetworkChange = (network: NetworkType) => {
    const config = network === 'custom' 
      ? { type: 'custom', name: 'Custom RPC', rpcUrl: customRpc, chainId: parseInt(customChainId) }
      : NETWORKS[network]
    
    setSelectedNetwork(network)
    localStorage.setItem('qrdx-network', JSON.stringify(config))
    setOpen(false)
    
    // In a real app, this would trigger a network switch and reload data
    window.location.reload()
  }

  const currentNetwork = selectedNetwork === 'custom'
    ? { type: 'custom', name: 'Custom RPC', rpcUrl: customRpc, chainId: parseInt(customChainId) }
    : NETWORKS[selectedNetwork]

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
            className={`flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
              selectedNetwork === 'mainnet' 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="text-left">
              <div className="font-semibold">QRDX Mainnet</div>
              <div className="text-sm text-muted-foreground">Production network</div>
              <div className="text-xs text-muted-foreground mt-1">Chain ID: 1337</div>
            </div>
            {selectedNetwork === 'mainnet' && (
              <Check className="h-5 w-5 text-primary" />
            )}
          </button>

          {/* Testnet */}
          <button
            onClick={() => handleNetworkChange('testnet')}
            className={`flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
              selectedNetwork === 'testnet' 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="text-left">
              <div className="font-semibold">QRDX Testnet</div>
              <div className="text-sm text-muted-foreground">Test network</div>
              <div className="text-xs text-muted-foreground mt-1">Chain ID: 31337</div>
            </div>
            {selectedNetwork === 'testnet' && (
              <Check className="h-5 w-5 text-primary" />
            )}
          </button>

          {/* Custom RPC */}
          <div className={`p-4 rounded-lg border-2 ${
            selectedNetwork === 'custom' 
              ? 'border-primary bg-primary/5' 
              : 'border-border'
          }`}>
            <div className="font-semibold mb-3">Custom RPC</div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="rpc-url" className="text-xs">RPC URL</Label>
                <Input
                  id="rpc-url"
                  type="url"
                  placeholder="http://localhost:8545"
                  value={customRpc}
                  onChange={(e) => setCustomRpc(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="chain-id" className="text-xs">Chain ID</Label>
                <Input
                  id="chain-id"
                  type="number"
                  placeholder="31337"
                  value={customChainId}
                  onChange={(e) => setCustomChainId(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button 
                onClick={() => handleNetworkChange('custom')}
                className="w-full"
                size="sm"
              >
                Connect to Custom RPC
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
