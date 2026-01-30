/**
 * QRDX Trade Pricing API Client
 * Fetches real-time token prices from the QRDX exchange
 */

const PRICING_API_BASE = 'https://trade.qrdx.org/api/price'

export interface TokenPrice {
  token: string
  price_usd: number
  price_qrdx?: number
  volume_24h?: number
  change_24h?: number
  market_cap?: number
  last_updated: number
}

export interface HistoricalPricePoint {
  timestamp: number
  price_usd: number
  volume?: number
}

export interface HistoricalPriceData {
  token: string
  interval: string
  data: HistoricalPricePoint[]
}

interface PricingCache {
  [key: string]: {
    data: TokenPrice
    timestamp: number
  }
}

// Cache prices for 30 seconds to avoid excessive API calls
const CACHE_DURATION = 30 * 1000
const priceCache: PricingCache = {}

/**
 * Get token price from QRDX exchange
 * @param tokenAddressOrSymbol - Token contract address or symbol (e.g., 'QRDX', 'ETH', '0x...')
 * @returns Token price information or null if not found
 */
export async function getTokenPrice(tokenAddressOrSymbol: string): Promise<TokenPrice | null> {
  const cacheKey = tokenAddressOrSymbol.toLowerCase()
  
  // Check cache first
  if (priceCache[cacheKey]) {
    const cached = priceCache[cacheKey]
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data
    }
  }

  try {
    const response = await fetch(`${PRICING_API_BASE}/${tokenAddressOrSymbol}`, {
      next: { revalidate: 30 } // Next.js caching
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Price not found for token: ${tokenAddressOrSymbol}`)
        return null
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data: TokenPrice = await response.json()
    
    // Update cache
    priceCache[cacheKey] = {
      data,
      timestamp: Date.now()
    }
    
    return data
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddressOrSymbol}:`, error)
    return null
  }
}

/**
 * Get prices for multiple tokens in a single batch
 * Note: This makes individual requests but returns them together
 * Could be optimized with a batch endpoint if available
 * Returns -1 price for tokens that fail to fetch
 */
export async function getTokenPrices(tokens: string[]): Promise<Map<string, TokenPrice>> {
  const priceMap = new Map<string, TokenPrice>()
  
  const promises = tokens.map(async (token) => {
    try {
      const price = await getTokenPrice(token)
      if (price) {
        priceMap.set(token.toLowerCase(), price)
      } else {
        // Price not found - set to -1 to indicate unknown
        priceMap.set(token.toLowerCase(), {
          token: token,
          price_usd: -1,
          last_updated: Date.now()
        })
      }
    } catch (error) {
      // Error fetching price - set to -1 to indicate error
      console.warn(`Failed to fetch price for ${token}, marking as unknown`)
      priceMap.set(token.toLowerCase(), {
        token: token,
        price_usd: -1,
        last_updated: Date.now()
      })
    }
  })
  
  await Promise.all(promises)
  return priceMap
}

/**
 * Calculate USD value for a token amount
 */
export async function calculateTokenValue(
  tokenAddressOrSymbol: string,
  amount: number
): Promise<number> {
  const price = await getTokenPrice(tokenAddressOrSymbol)
  if (!price) return 0
  return amount * price.price_usd
}

/**
 * Get QRDX price (main native token)
 */
export async function getQRDXPrice(): Promise<number> {
  const price = await getTokenPrice('QRDX')
  return price?.price_usd || 0
}

/**
 * Get historical prices for a token
 * @param tokenAddressOrSymbol - Token contract address or symbol
 * @param interval - Time interval: '1h', '1d', '1w', '1m'
 * @param limit - Number of data points to return (default: 168 for 7 days hourly)
 * @returns Historical price data or null if not found
 */
export async function getHistoricalPrices(
  tokenAddressOrSymbol: string,
  interval: '1h' | '1d' | '1w' | '1m' = '1d',
  limit: number = 7
): Promise<HistoricalPriceData | null> {
  try {
    const response = await fetch(
      `${PRICING_API_BASE}/${tokenAddressOrSymbol}/history?interval=${interval}&limit=${limit}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    )
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Historical prices not found for token: ${tokenAddressOrSymbol}`)
        return null
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data: HistoricalPriceData = await response.json()
    return data
  } catch (error) {
    console.error(`Error fetching historical prices for ${tokenAddressOrSymbol}:`, error)
    return null
  }
}

/**
 * Generate stub historical data based on current price and transaction timeline
 */
export function generateHistoricalDataFromTransactions(
  currentPrice: number,
  transactions: Array<{ timestamp: number; value?: number }>,
  days: number = 7
): HistoricalPricePoint[] {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const points: HistoricalPricePoint[] = []
  
  // If we have transactions, use their timeline
  if (transactions.length > 0) {
    // Group transactions by day
    const txByDay = new Map<number, number[]>()
    transactions.forEach(tx => {
      const dayIndex = Math.floor((now - tx.timestamp) / dayMs)
      if (dayIndex < days) {
        if (!txByDay.has(dayIndex)) {
          txByDay.set(dayIndex, [])
        }
        txByDay.get(dayIndex)!.push(tx.timestamp)
      }
    })
    
    // Generate price points with some volatility based on transaction activity
    for (let i = days - 1; i >= 0; i--) {
      const timestamp = now - (i * dayMs)
      const txCount = txByDay.get(i)?.length || 0
      // More transactions = more volatility
      const volatility = txCount > 0 ? 0.05 : 0.02
      const change = (Math.random() - 0.5) * volatility
      const price = currentPrice * (1 + change * (i / days))
      
      points.push({
        timestamp: Math.floor(timestamp / 1000),
        price_usd: price,
        volume: txCount * currentPrice * (Math.random() * 1000)
      })
    }
  } else {
    // No transactions, generate simple trend data
    for (let i = days - 1; i >= 0; i--) {
      const timestamp = now - (i * dayMs)
      const variance = (Math.random() - 0.5) * currentPrice * 0.1
      points.push({
        timestamp: Math.floor(timestamp / 1000),
        price_usd: currentPrice + variance
      })
    }
  }
  
  return points
}

/**
 * Stub pricing for development/testing when exchange API is not available
 * This can be used as fallback or for local development
 */
export const STUB_PRICES: Record<string, number> = {
  'QRDX': 3500,
  'ETH': 3000,
  'BTC': 60000,
  'USDT': 1,
  'USDC': 1,
  'DAI': 1,
}

/**
 * Get token price with stub fallback
 */
export async function getTokenPriceWithFallback(tokenAddressOrSymbol: string): Promise<number> {
  // Try real API first
  const price = await getTokenPrice(tokenAddressOrSymbol)
  if (price) return price.price_usd
  
  // Fallback to stub prices for known tokens
  const symbol = tokenAddressOrSymbol.toUpperCase()
  if (symbol in STUB_PRICES) {
    return STUB_PRICES[symbol]
  }
  
  // Default to 0 for unknown tokens
  return 0
}
