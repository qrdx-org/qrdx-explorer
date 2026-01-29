import { Address, Token, Transaction, Block, PnLDataPoint } from './types'

export function generateMockAddress(address: string): Address {
  const isClaimed = Math.random() > 0.7 // 30% chance of being claimed
  
  return {
    address,
    balance: (Math.random() * 1000).toFixed(4),
    usdValue: Math.random() * 5000000,
    claimed: isClaimed,
    metadata: isClaimed ? {
      name: `Wallet ${address.slice(0, 6)}`,
      description: `This is a verified QRDX wallet. Quantum-resistant and secure.`,
      image: `/logo.png`
    } : undefined,
    tokens: generateMockTokens(),
    transactions: generateMockTransactions(address, 20),
    nonce: Math.floor(Math.random() * 1000),
    createdAt: Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
  }
}

export function generateMockTokens(): Token[] {
  const tokens = [
    { symbol: 'USDT', name: 'Tether USD', logo: '/logo.png', type: 'QRC-20' },
    { symbol: 'USDC', name: 'USD Coin', logo: '/logo.png', type: 'QRC-20' },
    { symbol: 'WETH', name: 'Wrapped Ether', logo: '/logo.png', type: 'QRC-20' },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', logo: '/logo.png', type: 'QRC-20' },
    { symbol: 'DAI', name: 'Dai Stablecoin', logo: '/logo.png', type: 'QRC-20' },
  ]

  return tokens.slice(0, Math.floor(Math.random() * 4) + 2).map(token => {
    const balance = (Math.random() * 1000).toFixed(6)
    const price = Math.random() * 50000
    const usdValue = parseFloat(balance) * price
    
    return {
      address: `0x${Math.random().toString(16).slice(2, 42)}`,
      symbol: token.symbol,
      name: token.name,
      balance,
      decimals: 18,
      usdValue,
      logo: token.logo,
      percentage: 0, // Will be calculated
      type: token.type as 'QRC-20' | 'QRC-721' | 'QRC-1155',
    }
  }).map(token => {
    const total = tokens.reduce((sum, t) => sum + (t as any).usdValue || 0, 0)
    return {
      ...token,
      percentage: total > 0 ? (token.usdValue / total) * 100 : 0
    }
  })
}

export function generateMockTransactions(address: string, count: number = 10): Transaction[] {
  const transactions: Transaction[] = []
  const statuses: Array<'confirmed' | 'pending' | 'failed'> = ['confirmed', 'confirmed', 'confirmed', 'confirmed', 'pending', 'failed']
  const methods = ['Transfer', 'Swap', 'Approve', 'Stake', 'Claim', 'Bridge']

  for (let i = 0; i < count; i++) {
    const isOutgoing = Math.random() > 0.5
    const hash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
    const otherAddress = `0x${Math.random().toString(16).slice(2, 42)}`
    const gasUsed = (21000 + Math.random() * 200000).toFixed(0)
    const gasPrice = (Math.random() * 100).toFixed(2)
    
    transactions.push({
      hash,
      from: isOutgoing ? address : otherAddress,
      to: isOutgoing ? otherAddress : address,
      value: (Math.random() * 10).toFixed(6),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      timestamp: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
      blockNumber: 12345678 - Math.floor(Math.random() * 10000),
      gasUsed,
      gasPrice,
      fee: ((parseFloat(gasUsed) * parseFloat(gasPrice)) / 1e9).toFixed(6),
      method: methods[Math.floor(Math.random() * methods.length)],
      tokenTransfers: []
    })
  }

  return transactions.sort((a, b) => b.timestamp - a.timestamp)
}

export function generateMockBlock(number: number): Block {
  return {
    number,
    hash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
    timestamp: Date.now() - Math.random() * 60 * 60 * 1000,
    validator: `0x${Math.random().toString(16).slice(2, 42)}`,
    transactions: Array.from({ length: Math.floor(Math.random() * 50) + 10 }, () => 
      `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
    ),
    gasUsed: (Math.random() * 15000000).toFixed(0),
    gasLimit: '15000000',
    difficulty: (Math.random() * 1000000000000).toFixed(0),
    size: Math.floor(Math.random() * 100000) + 10000
  }
}

export function generateMockPnLData(days: number = 7): PnLDataPoint[] {
  const data: PnLDataPoint[] = []
  let baseValue = 10000
  
  for (let i = days; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)
    
    baseValue += (Math.random() - 0.5) * 1000
    data.push({
      time: Math.floor(date.getTime() / 1000),
      value: Math.max(0, baseValue)
    })
  }
  
  return data
}

export function formatAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (address.length < startChars + endChars) return address
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
}

export function formatHash(hash: string): string {
  return formatAddress(hash, 10, 8)
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`
  return `${seconds} sec${seconds > 1 ? 's' : ''} ago`
}

export function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`
  return num.toFixed(decimals)
}

export function formatUSD(amount: number): string {
  return `$${formatNumber(amount, 2)}`
}

export function formatBalance(amount: number, decimals: number = 4): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}
