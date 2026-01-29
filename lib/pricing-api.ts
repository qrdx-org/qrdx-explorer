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
