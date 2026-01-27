export interface Address {
  address: string
  balance: string
  usdValue: number
  claimed: boolean
  metadata?: {
    name: string
    description: string
    image: string
  }
  tokens: Token[]
  transactions: Transaction[]
  nonce: number
  createdAt: number
}

export interface Token {
  address: string
  symbol: string
  name: string
  balance: string
  decimals: number
  usdValue: number
  logo?: string
  percentage: number
  type: 'QRC-20' | 'QRC-721' | 'QRC-1155'
}

export interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  status: 'confirmed' | 'pending' | 'failed'
  timestamp: number
  blockNumber: number
  gasUsed: string
  gasPrice: string
  fee: string
  method?: string
  tokenTransfers: TokenTransfer[]
}

export interface TokenTransfer {
  from: string
  to: string
  token: string
  tokenSymbol: string
  amount: string
  usdValue: number
}

export interface Block {
  number: number
  hash: string
  timestamp: number
  validator: string
  transactions: string[]
  gasUsed: string
  gasLimit: string
  difficulty: string
  size: number
}

export interface PnLDataPoint {
  time: number
  value: number
}

export interface ClaimMetadata {
  name: string
  description: string
  image: string
}
