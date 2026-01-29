/**
 * QRDX Node API Client
 * Interfaces with the QRDX blockchain node via the OpenAPI endpoints
 */

// Get the API base URL from network configuration or environment variable
function getApiBaseUrl(): string {
  // Check if we're in the browser and have a stored network config
  if (typeof window !== 'undefined') {
    const savedNetwork = localStorage.getItem('qrdx-network')
    if (savedNetwork) {
      try {
        const config = JSON.parse(savedNetwork)
        return config.nodeApiUrl || config.rpcUrl
      } catch (e) {
        console.error('Failed to parse network config:', e)
      }
    }
    // Check for runtime override
    if ((window as any).__QRDX_NODE_URL__) {
      return (window as any).__QRDX_NODE_URL__
    }
  }
  
  // Fallback to environment variable or default
  return process.env.NEXT_PUBLIC_QRDX_NODE_URL || 'http://localhost:3007'
}

const API_BASE_URL = getApiBaseUrl()

interface ApiResponse<T> {
  data?: T
  error?: string
}

// API Response Types based on openapi.json
export interface AddressInfoResponse {
  address: string
  balance: string
  nonce: number
  transactions: TransactionResponse[]
  total_transactions: number
  pending_transactions?: TransactionResponse[]
}

export interface TransactionResponse {
  hash: string
  from: string
  to: string
  value: string
  nonce: number
  timestamp: number
  block_number?: number
  block_hash?: string
  gas_price: string
  gas_limit: string
  gas_used?: string
  status: 'confirmed' | 'pending' | 'failed'
  signature?: string
  data?: string
  contract_address?: string
  logs?: TransactionLog[]
}

export interface TransactionLog {
  address: string
  topics: string[]
  data: string
  log_index: number
  transaction_index: number
  block_number: number
}

export interface BlockResponse {
  number: number
  hash: string
  parent_hash: string
  timestamp: number
  miner: string
  difficulty: string
  total_difficulty: string
  size: number
  gas_used: string
  gas_limit: string
  nonce: string
  transactions: string[] | TransactionResponse[]
  transactions_root: string
  state_root: string
  receipts_root: string
}

export interface StatusResponse {
  height: number
  last_block_hash: string
  node_id: string
  version?: string
  network?: string
}

export interface PendingTransactionsResponse {
  transactions: TransactionResponse[]
  count: number
}

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  total_supply: string
  type: 'QRC-20' | 'QRC-721' | 'QRC-1155'
  logo?: string
  description?: string
}

export interface AddressToken {
  token: TokenInfo
  balance: string
  balance_formatted: number
}

export interface AddressTokensResponse {
  address: string
  tokens: AddressToken[]
  total_count: number
}

/**
 * Get address information including balance and transaction history
 */
export async function getAddressInfo(
  address: string,
  options: {
    transactionsCountLimit?: number
    page?: number
    showPending?: boolean
    verify?: boolean
  } = {}
): Promise<ApiResponse<AddressInfoResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({
      address,
      transactions_count_limit: (options.transactionsCountLimit || 50).toString(),
      page: (options.page || 1).toString(),
      show_pending: (options.showPending || false).toString(),
      verify: (options.verify || false).toString(),
    })

    const response = await fetch(`${apiUrl}/get_address_info?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching address info:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get transaction details by hash
 */
export async function getTransaction(
  txHash: string,
  verify: boolean = false
): Promise<ApiResponse<TransactionResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({
      tx_hash: txHash,
      verify: verify.toString(),
    })

    const response = await fetch(`${apiUrl}/get_transaction?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching transaction:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get block information
 */
export async function getBlock(
  blockIdentifier: string | number,
  fullTransactions: boolean = false
): Promise<ApiResponse<BlockResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({
      block: blockIdentifier.toString(),
      full_transactions: fullTransactions.toString(),
    })

    const response = await fetch(`${apiUrl}/get_block?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching block:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get multiple blocks with pagination
 */
export async function getBlocks(
  offset: number,
  limit: number
): Promise<ApiResponse<BlockResponse[]>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: Math.min(limit, 512).toString(), // Max 512 per API
    })

    const response = await fetch(`${apiUrl}/get_blocks?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching blocks:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get blockchain status (current height, last block hash, node ID)
 */
export async function getStatus(): Promise<ApiResponse<StatusResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const response = await fetch(`${apiUrl}/get_status`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching status:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get pending transactions from mempool
 */
export async function getPendingTransactions(): Promise<ApiResponse<PendingTransactionsResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const response = await fetch(`${apiUrl}/get_pending_transactions`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching pending transactions:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Submit a signed transaction to the network
 */
export async function submitTransaction(transaction: any): Promise<ApiResponse<{ hash: string }>> {
  try {
    const apiUrl = getApiBaseUrl()
    const response = await fetch(`${apiUrl}/submit_tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transaction),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error submitting transaction:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get all tokens owned by an address
 */
export async function getAddressTokens(
  address: string,
  tokenType?: 'QRC-20' | 'QRC-721' | 'QRC-1155'
): Promise<ApiResponse<AddressTokensResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({ address })
    if (tokenType) {
      params.append('token_type', tokenType)
    }

    const response = await fetch(`${apiUrl}/get_address_tokens?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching address tokens:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get detailed information about a token
 */
export async function getTokenInfo(
  tokenAddress: string
): Promise<ApiResponse<TokenInfo>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({ token_address: tokenAddress })

    const response = await fetch(`${apiUrl}/get_token_info?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching token info:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get top addresses by balance or transaction count
 */
export async function getTopAddresses(
  limit: number = 100,
  orderBy: 'balance' | 'transaction_count' = 'balance'
): Promise<ApiResponse<TopAddressesResponse>> {
  try {
    const apiUrl = getApiBaseUrl()
    const params = new URLSearchParams({
      limit: limit.toString(),
      order_by: orderBy,
    })

    const response = await fetch(`${apiUrl}/get_top_addresses?${params}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('Error fetching top addresses:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
