'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ExternalLink, Image as ImageIcon, Layers } from 'lucide-react'
import { AddressLink, BlockLink, CopyButton } from '@/components/explorer/common'
import { HistoryTable } from '@/components/explorer/HistoryTable'
import { Panel, Pill, Row, Tabs, Tile } from '@/components/explorer/ui'
import { getAddressHistory } from '@/lib/qrdx/indexed'
import { getCollectionPage, resolveUri, type Nft, type NftCollection } from '@/lib/qrdx/nfts'
import { NftImage, useNftMetadata } from './NftMedia'
import { NftView } from './NftView'

const PAGE = 60

/**
 * A native NFT collection (its address is also an ERC-721 in the EVM): what it is, its
 * authorities and royalty, its members a page at a time, and its history. ?nft=ID opens one.
 */
export function CollectionView({ collection }: { collection: NftCollection }) {
  const router = useRouter()
  const nftParam = useSearchParams().get('nft')
  const meta = useNftMetadata(collection.uri)
  const [tab, setTab] = useState<'items' | 'history'>('items')
  const [items, setItems] = useState<Nft[] | null>(null)
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(false)
  const name = meta?.name ?? collection.name

  const more = async (from: number) => {
    setBusy(true)
    const page = await getCollectionPage(collection.collection, from + 1, Math.min(PAGE, Math.max(0, collection.minted - from)))
    setItems((prev) => [...(from ? prev ?? [] : []), ...page])
    setShown(Math.min(collection.minted, from + PAGE))
    setBusy(false)
  }
  useEffect(() => {
    void more(0)
  }, [collection.collection]) // eslint-disable-line react-hooks/exhaustive-deps

  const owners = useMemo(() => new Set((items ?? []).map((i) => i.owner.toLowerCase())).size, [items])
  const open = (id: string | null) => router.replace(id ? `/address/${collection.collection}?nft=${id}` : `/address/${collection.collection}`, { scroll: false })
  const site = resolveUri(meta?.external_url)

  if (nftParam && /^\d+$/.test(nftParam)) return <NftView collection={collection} tokenId={nftParam} onBack={() => open(null)} />

  return (
    <div className="space-y-6">
      <section className="hero-glow -mx-4 border-b px-4 pb-6 pt-2">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 shrink-0">
            <NftImage uri={collection.uri} name={collection.name} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              <Pill tone="primary">NFT collection</Pill>
              <Pill>{collection.symbol}</Pill>
              {collection.non_transferable && <Pill tone="warn">Soulbound</Pill>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              {collection.collection} <CopyButton value={collection.collection} />
            </div>
            {meta?.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{meta.description}</p>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Items" icon={<ImageIcon className="h-4 w-4" />} value={collection.supply.toLocaleString()} sub={collection.max_supply ? `of at most ${collection.max_supply.toLocaleString()}` : collection.mint_authority ? 'no supply cap' : 'supply fixed'} />
        <Tile label="Minted" icon={<Layers className="h-4 w-4" />} value={collection.minted.toLocaleString()} sub={`${collection.burned.toLocaleString()} burned`} />
        <Tile label="Owners" value={items ? owners.toLocaleString() : '—'} sub={shown < collection.minted ? `of the first ${shown.toLocaleString()}` : 'holding its NFTs'} />
        <Tile label="Royalty" value={collection.royalty_bps ? `${(collection.royalty_bps / 100).toFixed(2)} %` : 'None'} sub="ERC-2981, for marketplaces" />
      </div>

      <Panel title="Collection">
        <Row k="Creator">
          <AddressLink address={collection.creator} />
        </Row>
        <Row k="Created">
          <BlockLink height={collection.created_height} />
        </Row>
        <Row k="Mint authority">{collection.mint_authority ? <AddressLink address={collection.mint_authority} /> : 'None: no more can be minted'}</Row>
        <Row k="Update authority">{collection.update_authority ? <AddressLink address={collection.update_authority} /> : 'None: metadata is frozen'}</Row>
        {collection.royalty_bps > 0 && (
          <Row k="Royalty recipient">
            <AddressLink address={collection.royalty_recipient} />
          </Row>
        )}
        <Row k="Metadata" wrap>
          {collection.uri ? (
            <a href={resolveUri(collection.uri) ?? '#'} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
              {collection.uri}
            </a>
          ) : (
            '—'
          )}
        </Row>
        {site && (
          <Row k="Website">
            <a href={site} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
              {site} <ExternalLink className="h-3 w-3" />
            </a>
          </Row>
        )}
        <Row k="In the EVM">ERC-721 at this address (ownerOf, tokenURI, transferFrom, royaltyInfo)</Row>
      </Panel>

      <Panel>
        <Tabs
          className="px-2"
          tabs={[
            { id: 'items' as const, label: `NFTs (${collection.supply.toLocaleString()})` },
            { id: 'history' as const, label: 'Transactions' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'items' ? (
          <div className="p-4">
            {!items ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading NFTs…</p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{collection.minted ? 'Every NFT read so far has been burned.' : 'Nothing minted yet.'}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {items.map((n) => (
                  <NftCard key={n.token_id} nft={n} fallbackName={collection.name} onOpen={() => open(n.token_id)} />
                ))}
              </div>
            )}
            {shown < collection.minted && (
              <button onClick={() => void more(shown)} disabled={busy} className="mt-4 w-full rounded-md border py-2 text-sm hover:bg-accent disabled:opacity-50">
                {busy ? 'Loading…' : `Load more (${(collection.minted - shown).toLocaleString()} left)`}
              </button>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              NFTs are read by token id, 1 up to the number minted. Ids a minter chose itself are reachable by URL: /address/{collection.collection.slice(0, 10)}…?nft=ID.
            </p>
          </div>
        ) : (
          <HistoryTable load={(q) => getAddressHistory(collection.collection, q)} address={collection.collection} />
        )}
      </Panel>
    </div>
  )
}

export function NftCard({ nft, fallbackName, onOpen, href }: { nft: Nft; fallbackName: string; onOpen?: () => void; href?: string }) {
  const meta = useNftMetadata(nft.uri)
  const name = nft.name || meta?.name || `${fallbackName} #${nft.token_id}`
  const body = (
    <>
      <NftImage uri={nft.uri} name={name} className="rounded-b-none" />
      <div className="p-2">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">#{nft.token_id}</div>
      </div>
    </>
  )
  const cls = 'block overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50'
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={cls}>
      {body}
    </button>
  )
}
