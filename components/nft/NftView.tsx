'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { AddressLink, BlockLink, CopyButton } from '@/components/explorer/common'
import { Panel, Pill, Row } from '@/components/explorer/ui'
import { getNft, resolveUri, type Nft, type NftCollection } from '@/lib/qrdx/nfts'
import { getActiveNetwork } from '@/lib/qrdx/client'
import { NftImage, useNftMetadata } from './NftMedia'

/** One NFT: its image and traits, owner, approval, mint height and metadata. */
export function NftView({ collection, tokenId, onBack }: { collection: NftCollection; tokenId: string; onBack: () => void }) {
  const [nft, setNft] = useState<{ id: string; nft: Nft | null } | null>(null)
  useEffect(() => {
    let live = true
    getNft(collection.collection, tokenId).then((n) => live && setNft({ id: tokenId, nft: n }))
    return () => {
      live = false
    }
  }, [collection.collection, tokenId])
  const n = nft && nft.id === tokenId ? nft.nft : undefined
  const meta = useNftMetadata(n?.uri || undefined)
  const name = n?.name || meta?.name || `${collection.name} #${tokenId}`
  const net = getActiveNetwork()
  const trade = net.tradeUrl ? `${net.tradeUrl}/nfts/${collection.collection}?item=${tokenId}&network=${net.type}` : null

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {collection.name}
      </button>
      {n === undefined ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading NFT…</p>
      ) : n === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {collection.name} has no NFT #{tokenId}: never minted, or burned.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div>
            <NftImage uri={n.uri} name={name} />
            {resolveUri(meta?.animation_url) && (
              <a href={resolveUri(meta?.animation_url)!} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Media <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                <Pill tone="primary">NFT</Pill>
                {collection.non_transferable && <Pill tone="warn">Soulbound</Pill>}
              </div>
              {meta?.description && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{meta.description}</p>}
            </div>
            <Panel>
              <Row k="Owner">
                <AddressLink address={n.owner} copy />
              </Row>
              <Row k="Collection">
                <AddressLink address={collection.collection} />
              </Row>
              <Row k="Token id">
                <span className="inline-flex items-center gap-1.5">
                  #{n.token_id} <CopyButton value={n.token_id} />
                </span>
              </Row>
              <Row k="Minted">
                <BlockLink height={n.minted_height} />
              </Row>
              <Row k="Approved account">{n.approved ? <AddressLink address={n.approved} /> : 'None'}</Row>
              <Row k="Royalty">{collection.royalty_bps ? `${(collection.royalty_bps / 100).toFixed(2)} % to ${collection.royalty_recipient?.slice(0, 12) ?? ''}…` : 'None'}</Row>
              <Row k="Metadata" wrap>
                {n.uri ? (
                  <a href={resolveUri(n.uri) ?? '#'} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                    {n.uri}
                  </a>
                ) : (
                  'None'
                )}
              </Row>
            </Panel>
            {meta?.attributes && meta.attributes.length > 0 && (
              <Panel title="Traits">
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                  {meta.attributes.map((a, i) => (
                    <div key={i} className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      <div className="truncate text-muted-foreground">{a.trait_type ?? 'trait'}</div>
                      <div className="truncate font-medium">{String(a.value ?? '')}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            {!collection.non_transferable && trade && (
              <a href={trade} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Buy or sell it on QRDX Trade <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
