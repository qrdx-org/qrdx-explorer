import knownAddressesData from './known-addresses.json'

export interface AddressBadge {
  text: string
  color: string
  bgColor: string
  textColor: string
  borderColor: string
}

export interface KnownAddress {
  name: string
  description: string
  image: string
  badges: AddressBadge[]
  category: 'system' | 'treasury' | 'defi' | 'security' | 'distribution'
  verified: boolean
  featured: boolean
}

export type KnownAddresses = Record<string, KnownAddress>

const knownAddresses: KnownAddresses = knownAddressesData.addresses as KnownAddresses

/**
 * Get metadata for a known address
 */
export function getKnownAddress(address: string): KnownAddress | null {
  // Try exact match first
  if (knownAddresses[address]) {
    return knownAddresses[address]
  }
  
  // Try case-insensitive match
  const normalizedAddress = address.toLowerCase()
  for (const key in knownAddresses) {
    if (key.toLowerCase() === normalizedAddress) {
      return knownAddresses[key]
    }
  }
  
  return null
}

/**
 * Check if an address is a known/special address
 */
export function isKnownAddress(address: string): boolean {
  return getKnownAddress(address) !== null
}

/**
 * Get all known addresses
 */
export function getAllKnownAddresses(): KnownAddresses {
  return knownAddresses
}

/**
 * Get known addresses by category
 */
export function getKnownAddressesByCategory(
  category: KnownAddress['category']
): Record<string, KnownAddress> {
  const filtered: Record<string, KnownAddress> = {}
  
  Object.entries(knownAddresses).forEach(([address, data]) => {
    if (data.category === category) {
      filtered[address] = data
    }
  })
  
  return filtered
}

/**
 * Get featured addresses
 */
export function getFeaturedAddresses(): Record<string, KnownAddress> {
  const filtered: Record<string, KnownAddress> = {}
  
  Object.entries(knownAddresses).forEach(([address, data]) => {
    if (data.featured) {
      filtered[address] = data
    }
  })
  
  return filtered
}

/**
 * Search known addresses by name or description
 */
export function searchKnownAddresses(query: string): Record<string, KnownAddress> {
  const filtered: Record<string, KnownAddress> = {}
  const lowerQuery = query.toLowerCase()
  
  Object.entries(knownAddresses).forEach(([address, data]) => {
    if (
      data.name.toLowerCase().includes(lowerQuery) ||
      data.description.toLowerCase().includes(lowerQuery) ||
      address.toLowerCase().includes(lowerQuery)
    ) {
      filtered[address] = data
    }
  })
  
  return filtered
}

export default knownAddresses
