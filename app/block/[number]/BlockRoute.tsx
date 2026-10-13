'use client'

import { useRouteSegment } from '@/components/explorer/route-segment'
import { BlockView } from './BlockView'

export function BlockRoute() {
  const number = useRouteSegment('/block/')
  if (!number) return <p className="py-16 text-center text-sm text-muted-foreground">Loading block…</p>
  // Another block is another page: no state carries over.
  return <BlockView key={number} number={number} />
}
