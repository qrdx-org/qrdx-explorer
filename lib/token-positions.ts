/**
 * Token Position Calculator
 * Calculates token positions and holdings from transaction history on the client side
 */

import type { TransactionResponse, TransactionLog } from './api-client'

export interface TokenPosition {
  hash: string
  timestamp: number
  amount: string
  value: number
  type: 'incoming' | 'outgoing'
  from: string
  to: string
  price_at_time?: number
}

export interface TokenHolding {
  address: string
  symbol: string
  name: string
  balance: number
  decimals: number
  type: 'QRC-20' | 'QRC-721' | 'QRC-1155'
  positions: TokenPosition[]
  averageBuyPrice?: number
  totalInvested?: number
  unrealizedPnL?: number
}

// QRC-20 Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/**
 * Parse QRC-20 token transfers from transaction logs
 */
function parseTokenTransfers(
  tx: TransactionResponse,
  userAddress: string
): Array<{ token: string; from: string; to: string; amount: bigint }> {
  if (!tx.logs || tx.logs.length === 0) return []

  const transfers: Array<{ token: string; from: string; to: string; amount: bigint }> = []

  for (const log of tx.logs) {
    // Check if this is a Transfer event
    if (log.topics[0] === TRANSFER_EVENT_SIGNATURE && log.topics.length >= 3) {
      try {
        const token = log.address
        // Topics are indexed parameters: [signature, from, to]
        const from = '0x' + log.topics[1].slice(-40) // Last 20 bytes (40 hex chars)
        const to = '0x' + log.topics[2].slice(-40)
        
        // Amount is in the data field (non-indexed parameter)
        const amount = BigInt(log.data || '0x0')

        // Only include transfers involving the user
        if (from.toLowerCase() === userAddress.toLowerCase() || 
            to.toLowerCase() === userAddress.toLowerCase()) {
          transfers.push({ token, from, to, amount })
        }
      } catch (error) {
        console.error('Error parsing token transfer:', error)
      }
    }
  }

  return transfers
}

/**
 * Calculate token positions from transaction history
 */
export function calculateTokenPositions(
  transactions: TransactionResponse[],
  userAddress: string,
  tokenAddress: string,
  decimals: number = 18
): TokenPosition[] {
  const positions: TokenPosition[] = []
  const userAddr = userAddress.toLowerCase()
  const tokenAddr = tokenAddress.toLowerCase()

  for (const tx of transactions) {
    // Parse token transfers from logs
    const transfers = parseTokenTransfers(tx, userAddress)

    for (const transfer of transfers) {
      if (transfer.token.toLowerCase() !== tokenAddr) continue

      const amountFormatted = Number(transfer.amount) / Math.pow(10, decimals)
      const isIncoming = transfer.to.toLowerCase() === userAddr
      const isOutgoing = transfer.from.toLowerCase() === userAddr

      if (isIncoming || isOutgoing) {
        positions.push({
          hash: tx.hash,
          timestamp: tx.timestamp,
          amount: amountFormatted.toString(),
          value: 0, // Will be filled in with price data
          type: isIncoming ? 'incoming' : 'outgoing',
          from: transfer.from,
          to: transfer.to,
        })
      }
    }

    // Also check native token transfers (QRDX)
    if (tokenAddress.toLowerCase() === 'native' || tokenAddress.toLowerCase() === 'qrdx') {
      const from = tx.from.toLowerCase()
      const to = tx.to.toLowerCase()
      const value = parseFloat(tx.value || '0')

      if (value > 0 && (from === userAddr || to === userAddr)) {
        positions.push({
          hash: tx.hash,
          timestamp: tx.timestamp,
          amount: value.toString(),
          value: 0,
          type: to === userAddr ? 'incoming' : 'outgoing',
          from: tx.from,
          to: tx.to,
        })
      }
    }
  }

  return positions.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Calculate current token balance from positions
 */
export function calculateTokenBalance(positions: TokenPosition[]): number {
  let balance = 0

  for (const position of positions) {
    const amount = parseFloat(position.amount)
    if (position.type === 'incoming') {
      balance += amount
    } else {
      balance -= amount
    }
  }

  return Math.max(0, balance) // Can't have negative balance
}

/**
 * Calculate average buy price from positions
 */
export function calculateAverageBuyPrice(positions: TokenPosition[]): number {
  let totalCost = 0
  let totalAmount = 0

  for (const position of positions) {
    if (position.type === 'incoming' && position.price_at_time) {
      const amount = parseFloat(position.amount)
      totalCost += amount * position.price_at_time
      totalAmount += amount
    }
  }

  return totalAmount > 0 ? totalCost / totalAmount : 0
}

/**
 * Calculate unrealized P&L
 */
export function calculateUnrealizedPnL(
  positions: TokenPosition[],
  currentPrice: number
): { pnl: number; pnlPercentage: number; invested: number } {
  const avgBuyPrice = calculateAverageBuyPrice(positions)
  const balance = calculateTokenBalance(positions)
  const invested = avgBuyPrice * balance
  const currentValue = currentPrice * balance
  const pnl = currentValue - invested
  const pnlPercentage = invested > 0 ? (pnl / invested) * 100 : 0

  return { pnl, pnlPercentage, invested }
}

/**
 * Group transactions by token and calculate holdings
 */
export function calculateTokenHoldings(
  transactions: TransactionResponse[],
  userAddress: string,
  tokenList: Array<{ address: string; symbol: string; name: string; decimals: number; type: 'QRC-20' | 'QRC-721' | 'QRC-1155' }>,
  priceMap: Map<string, number> = new Map()
): TokenHolding[] {
  const holdings: TokenHolding[] = []

  for (const token of tokenList) {
    const positions = calculateTokenPositions(
      transactions,
      userAddress,
      token.address,
      token.decimals
    )

    if (positions.length === 0) continue

    // Update position values with prices
    positions.forEach(position => {
      const price = priceMap.get(token.symbol.toLowerCase()) || 0
      position.value = parseFloat(position.amount) * price
      position.price_at_time = price // For simplicity, using current price
    })

    const balance = calculateTokenBalance(positions)
    if (balance === 0) continue // Skip tokens with zero balance

    const currentPrice = priceMap.get(token.symbol.toLowerCase()) || 0
    const { pnl, pnlPercentage, invested } = calculateUnrealizedPnL(positions, currentPrice)
    const avgBuyPrice = calculateAverageBuyPrice(positions)

    holdings.push({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      balance,
      decimals: token.decimals,
      type: token.type,
      positions,
      averageBuyPrice: avgBuyPrice,
      totalInvested: invested,
      unrealizedPnL: pnl,
    })
  }

  // Sort by value (balance * price)
  holdings.sort((a, b) => {
    const aValue = a.balance * (priceMap.get(a.symbol.toLowerCase()) || 0)
    const bValue = b.balance * (priceMap.get(b.symbol.toLowerCase()) || 0)
    return bValue - aValue
  })

  return holdings
}

/**
 * Calculate portfolio statistics
 */
export function calculatePortfolioStats(holdings: TokenHolding[], priceMap: Map<string, number>) {
  let totalValue = 0
  let totalInvested = 0
  let totalPnL = 0

  for (const holding of holdings) {
    const price = priceMap.get(holding.symbol.toLowerCase()) || 0
    totalValue += holding.balance * price
    totalInvested += holding.totalInvested || 0
    totalPnL += holding.unrealizedPnL || 0
  }

  const pnlPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  return {
    totalValue,
    totalInvested,
    totalPnL,
    pnlPercentage,
    tokenCount: holdings.length,
  }
}
