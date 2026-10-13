'use client'

import { Loader2 } from 'lucide-react'
import { useRouteSegment } from '@/components/explorer/route-segment'
import { AddressView } from './AddressView'

export function AddressRoute() {
  const address = useRouteSegment('/address/')
  if (!address)
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading address…
        </p>
      </div>
    )
  // A new address is a new page: no state carries over from the last one.
  return <AddressView key={address} address={address} />
}
