/**
 * Native NFTs (qrdx-node docs/NATIVE_TOKENS.md §8): collections and their members, read from the
 * node's NFT registry, and their metadata (the JSON a uri points at), read in the browser.
 *
 * The node keeps no list of a collection's members: they are read by id, 1 up to the number
 * minted (the default numbering), a page at a time.
 */

import { rpcCall } from './client'

export interface NftCollection {
  collection: string
  name: string
  symbol: string
  uri: string
  creator: string
  max_supply: number | null
  supply: number
  minted: number
  burned: number
  royalty_bps: number
  royalty_recipient: string | null
  update_authority: string | null
  mint_authority: string | null
  non_transferable: boolean
  created_height: number
}

export interface Nft {
  collection: string
  token_id: string
  owner: string
  uri: string
  name: string
  approved: string | null
  minted_height: number
  symbol?: string
  collection_name?: string
  royalty_bps?: number
  royalty_recipient?: string | null
  non_transferable?: boolean
}

export interface NftMetadata {
  name?: string
  description?: string
  image?: string
  animation_url?: string
  external_url?: string
  attributes?: { trait_type?: string; value?: string | number; display_type?: string }[]
}

const maybe = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null)

export const getNftCollections = () => rpcCall<NftCollection[]>('exchange_getNftCollections')
export const getNftCollection = (address: string) => maybe(rpcCall<NftCollection | null>('exchange_getNftCollection', [address.toLowerCase()]))
export const getNft = (collection: string, tokenId: string) => maybe(rpcCall<Nft | null>('exchange_getNft', [collection.toLowerCase(), tokenId]))
export const getNftsOf = (owner: string, collection: string | null = null, limit = 500) => rpcCall<Nft[]>('exchange_getNftsOf', [owner, collection, limit])

/** Members `from`..`from+count-1` of a collection's default numbering that exist (burned ones are skipped). */
export async function getCollectionPage(collection: string, from: number, count: number): Promise<Nft[]> {
  const ids = Array.from({ length: count }, (_, i) => String(from + i))
  const out: (Nft | null)[] = new Array(ids.length).fill(null)
  let next = 0
  // The node allows 50 JSON-RPC calls a second per client; 6 in flight stays well inside it.
  await Promise.all(
    Array.from({ length: Math.min(6, ids.length) }, async () => {
      while (next < ids.length) {
        const k = next++
        out[k] = await getNft(collection, ids[k])
      }
    })
  )
  return out.filter((n): n is Nft => !!n)
}

const IPFS = 'https://ipfs.io/ipfs/'

/** An http(s) URL for a metadata or media uri (ipfs:// and ar:// through public gateways). */
export function resolveUri(uri: string | null | undefined): string | null {
  if (!uri) return null
  const u = uri.trim()
  if (u.startsWith('ipfs://')) return IPFS + u.slice(7).replace(/^ipfs\//, '')
  if (u.startsWith('ar://')) return 'https://arweave.net/' + u.slice(5)
  if (/^https?:\/\//.test(u) || u.startsWith('data:')) return u
  return null
}

const cache = new Map<string, Promise<NftMetadata | null>>()

/** The metadata JSON behind a uri, once per page; null when there is none or it is not JSON. */
export function loadMetadata(uri: string | null | undefined): Promise<NftMetadata | null> {
  const url = resolveUri(uri)
  if (!url || /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url)) return Promise.resolve(null)
  let p = cache.get(url)
  if (!p) {
    p = fetch(url, { referrerPolicy: 'no-referrer' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && typeof j === 'object' ? (j as NftMetadata) : null))
      .catch(() => null)
    cache.set(url, p)
  }
  return p
}

/** The image to show for a uri: the uri itself when it is an image, else its metadata's image. */
export function directImage(uri: string | null | undefined): string | null {
  const url = resolveUri(uri)
  return url && /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url) ? url : null
}
