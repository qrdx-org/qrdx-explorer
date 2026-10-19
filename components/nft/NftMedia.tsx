'use client'

import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { directImage, loadMetadata, resolveUri, type NftMetadata } from '@/lib/qrdx/nfts'
import { cn } from '@/lib/utils'

/** An NFT's or collection's metadata: undefined while loading, null when there is none. */
export function useNftMetadata(uri: string | null | undefined): NftMetadata | null | undefined {
  const [state, setState] = useState<{ uri: string | null | undefined; meta: NftMetadata | null } | null>(null)
  useEffect(() => {
    let live = true
    loadMetadata(uri).then((meta) => live && setState({ uri, meta }))
    return () => {
      live = false
    }
  }, [uri])
  return state && state.uri === uri ? state.meta : undefined
}

export function NftImage({ uri, name, className }: { uri: string | null | undefined; name: string; className?: string }) {
  const meta = useNftMetadata(uri)
  const src = directImage(uri) ?? resolveUri(meta?.image)
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={meta?.name ?? name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(src)} className={cn('aspect-square w-full rounded-lg bg-muted object-cover', className)} />
  return (
    <div className={cn('flex aspect-square w-full items-center justify-center rounded-lg bg-gradient-to-br from-muted to-accent text-muted-foreground', className)} aria-label={name}>
      {meta === undefined && uri ? <span className="h-4 w-4 animate-pulse rounded-full bg-muted-foreground/30" /> : src ? <ImageOff className="h-5 w-5" /> : <span className="text-lg font-semibold uppercase">{name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '#'}</span>}
    </div>
  )
}
