/**
 * Network utilities for handling URL parameters and network configurations
 */

export type NetworkType = 'mainnet' | 'testnet' | 'local'

export interface NetworkConfig {
  type: NetworkType
  name: string
  rpcUrl: string
  nodeApiUrl: string
  chainId: number
}

/**
 * Generate URL with network parameters
 */
export function getNetworkUrl(
  basePath: string,
  network: NetworkType,
  customRpc?: string,
  customApi?: string
): string {
  const url = new URL(basePath, window.location.origin)
  
  url.searchParams.set('network', network)
  
  if (network === 'local' && (customRpc || customApi)) {
    if (customRpc) url.searchParams.set('rpc', customRpc)
    if (customApi) url.searchParams.set('api', customApi)
  }
  
  return url.toString()
}

/**
 * Parse network from URL parameters
 */
export function parseNetworkFromUrl(): {
  network?: NetworkType
  rpc?: string
  api?: string
} {
  if (typeof window === 'undefined') {
    return {}
  }
  
  const params = new URLSearchParams(window.location.search)
  const network = params.get('network')
  const rpc = params.get('rpc')
  const api = params.get('api')
  
  if (network && (network === 'mainnet' || network === 'testnet' || network === 'local')) {
    return {
      network: network as NetworkType,
      rpc: rpc || undefined,
      api: api || undefined,
    }
  }
  
  return {}
}

/**
 * Get current network configuration
 */
export function getCurrentNetworkConfig(): NetworkConfig | null {
  if (typeof window === 'undefined') {
    return null
  }
  
  const saved = localStorage.getItem('qrdx-network')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse network config:', e)
    }
  }
  
  return null
}

/**
 * Update URL with current network parameters (without reload)
 * Only updates if network parameter already exists in URL
 */
export function updateUrlWithNetwork(basePath?: string) {
  if (typeof window === 'undefined') {
    return
  }
  
  // Only update URL if network parameter already exists
  const currentParams = new URLSearchParams(window.location.search)
  if (!currentParams.has('network')) {
    return
  }
  
  const config = getCurrentNetworkConfig()
  if (!config) {
    return
  }
  
  const path = basePath || window.location.pathname
  let url: string
  
  if (config.type === 'local') {
    // Check if using custom URLs (different from defaults)
    const defaultRpc = 'http://localhost:3007'
    const defaultApi = 'http://localhost:3007'
    
    const customRpc = config.rpcUrl !== defaultRpc ? config.rpcUrl : undefined
    const customApi = config.nodeApiUrl !== defaultApi ? config.nodeApiUrl : undefined
    
    url = getNetworkUrl(path, config.type, customRpc, customApi)
  } else if (config.type === 'testnet' || config.type === 'mainnet') {
    url = getNetworkUrl(path, config.type)
  } else {
    return
  }
  
  // Update URL without reload
  window.history.replaceState({}, '', url)
}
