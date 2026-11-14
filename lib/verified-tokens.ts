import { getActiveNetwork, type NetworkType } from './qrdx/client'

/**
 * Tokens QRDX has checked: the address is the asset its symbol claims to be on that
 * network. Anyone can deploy a token called "USDC", so the symbol alone proves nothing;
 * these get their logo and a verified mark, everything else is shown as its creator set it.
 *
 * The same list trade.qrdx.org pins (qrdx-trade lib/assets.ts). Addresses are lower-case
 * and per network: a native token's address derives from its deploy transaction, so a
 * regenesis gives it a new one.
 */
export interface VerifiedToken {
  address: string
  symbol: string
  name: string
  /** Logo under /public. */
  logo: string
  /** What was checked, for the badge's tooltip. */
  note: string
}

const VERIFIED: Record<NetworkType, VerifiedToken[]> = {
  mainnet: [],
  testnet: [
    {
      // Created at block 9,837 after the regenesis onto node 3.0.0; 18 decimals.
      address: '0xa0ad4f35bf2d518a62ebb7e39a32a8f791703362',
      symbol: 'USDC',
      name: 'USD Coin',
      logo: '/tokens/usdc.svg',
      note: 'The testnet’s USDC: the token QRDX markets quote in. It is test money, not bridged USDC.',
    },
  ],
  local: [],
}

/** Native QRDX has no token address; it is always itself. */
export const QRDX_LOGO = '/tokens/qrdx.svg'

export function verifiedToken(address: string | null | undefined, network: NetworkType = getActiveNetwork().type): VerifiedToken | null {
  if (!address) return null
  const a = address.toLowerCase()
  return VERIFIED[network]?.find((t) => t.address === a) ?? null
}

/** A token that carries a verified token's symbol or name without being it. */
export function impersonates(token: { token_address: string; symbol: string; name: string }, network: NetworkType = getActiveNetwork().type): VerifiedToken | null {
  const a = token.token_address.toLowerCase()
  const sym = token.symbol.trim().toLowerCase()
  const name = token.name.trim().toLowerCase()
  return VERIFIED[network]?.find((t) => t.address !== a && (t.symbol.toLowerCase() === sym || t.name.toLowerCase() === name)) ?? null
}
