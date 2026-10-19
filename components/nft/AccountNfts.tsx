'use client'

import { useEffect, useState } from 'react'
import { getNftsOf, type Nft } from '@/lib/qrdx/nfts'
import { NftCard } from './CollectionView'

/** The NFTs an account owns (either address form), by collection. */
export function AccountNfts({ address, onCount }: { address: string; onCount?: (n: number) => void }) {
  const [state, setState] = useState<{ address: string; nfts: Nft[] | null; error: string | null } | null>(null)
  useEffect(() => {
    let live = true
    getNftsOf(address)
      .then((nfts) => {
        if (!live) return
        setState({ address, nfts, error: null })
        onCount?.(nfts.length)
      })
      .catch((e) => live && setState({ address, nfts: null, error: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
    }
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = state && state.address === address ? state : null
  if (!current) return <p className="py-10 text-center text-sm text-muted-foreground">Loading NFTs…</p>
  if (!current.nfts) return <p className="py-10 text-center text-sm text-muted-foreground">{current.error}</p>
  if (!current.nfts.length) return <p className="py-10 text-center text-sm text-muted-foreground">This account owns no NFTs.</p>
  const groups = new Map<string, Nft[]>()
  for (const n of current.nfts) groups.set(n.collection, [...(groups.get(n.collection) ?? []), n])
  return (
    <div className="space-y-5 p-4">
      {[...groups.entries()].map(([collection, nfts]) => (
        <div key={collection}>
          <a href={`/address/${collection}`} className="mb-2 inline-block text-sm font-medium hover:underline">
            {nfts[0].collection_name ?? collection} <span className="text-muted-foreground">· {nfts.length}</span>
          </a>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {nfts.map((n) => (
              <NftCard key={n.token_id} nft={n} fallbackName={n.collection_name ?? ''} href={`/address/${collection}?nft=${n.token_id}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
