'use client'

import { LoadingState } from '@/components/explorer/common'
import { useRouteSegment } from '@/components/explorer/route-segment'
import { TransactionView } from './TransactionView'

export function TransactionRoute() {
  const hash = useRouteSegment('/tx/')
  if (!hash)
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState label="Loading transaction…" />
      </div>
    )
  // Another transaction is another page: no state carries over.
  return <TransactionView key={hash} hash={hash} />
}
