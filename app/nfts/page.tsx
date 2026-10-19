'use client'

import Link from 'next/link'
import { Image as ImageIcon } from 'lucide-react'
import { AddressLink } from '@/components/explorer/common'
import { usePolled } from '@/components/explorer/hooks'
import { Panel, Pill, Tile } from '@/components/explorer/ui'
import { NftImage, useNftMetadata } from '@/components/nft/NftMedia'
import { getNftCollections, type NftCollection } from '@/lib/qrdx/nfts'

/** Every native NFT collection on the network (qrdx-node docs/NATIVE_TOKENS.md §8). */
export default function NftsPage() {
  const data = usePolled(() => getNftCollections(), 30_000)
  const list = [...(data.data ?? [])].sort((a, b) => b.supply - a.supply || b.created_height - a.created_height)
  const items = list.reduce((s, c) => s + c.supply, 0)
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">NFTs</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Native NFT collections: registry entries held in consensus, each also an ERC-721 inside the EVM. Only a collection&apos;s mint authority can mint into it, so every
          member is verified.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Collections" icon={<ImageIcon className="h-4 w-4" />} value={data.data ? list.length : '—'} />
        <Tile label="NFTs" value={data.data ? items.toLocaleString() : '—'} sub="minted and not burned" />
        <Tile label="Soulbound collections" value={data.data ? list.filter((c) => c.non_transferable).length : '—'} />
      </div>
      <Panel title="Collections">
        {!data.data ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{data.error ?? 'Loading collections…'}</p>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No NFT collections on this network yet.</p>
        ) : (
          <div className="divide-y">
            {list.map((c) => (
              <CollectionRow key={c.collection} c={c} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function CollectionRow({ c }: { c: NftCollection }) {
  const meta = useNftMetadata(c.uri)
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <Link href={`/address/${c.collection}`} className="w-11 shrink-0">
        <NftImage uri={c.uri} name={c.name} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/address/${c.collection}`} className="font-medium hover:underline">
          {meta?.name ?? c.name}
        </Link>{' '}
        <span className="text-xs text-muted-foreground">{c.symbol}</span>
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            by <AddressLink address={c.creator} />
          </span>
          {c.royalty_bps > 0 && <span>{(c.royalty_bps / 100).toFixed(2)} % royalty</span>}
          {c.non_transferable && <Pill tone="warn">Soulbound</Pill>}
        </div>
      </div>
      <div className="num shrink-0 text-right">
        <div className="font-medium">{c.supply.toLocaleString()}</div>
        <div className="text-[11px] text-muted-foreground">{c.max_supply ? `of ${c.max_supply.toLocaleString()}` : 'items'}</div>
      </div>
    </div>
  )
}
