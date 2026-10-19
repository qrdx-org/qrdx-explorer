'use client'

import { Suspense, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AccountView } from '@/components/address/AccountView'
import { TokenView } from '@/components/address/TokenView'
import { ErrorState } from '@/components/explorer/common'
import { detectAddressFormat } from '@/lib/qrdx'
import { getToken, type NativeToken } from '@/lib/qrdx/indexed'
import { getNftCollection, type NftCollection } from '@/lib/qrdx/nfts'
import { CollectionView } from '@/components/nft/CollectionView'

/**
 * An address: a native token gets the token view (price, markets, pools, trades); a native NFT
 * collection the collection view (its NFTs, ?nft=ID for one); anything else the account view
 * (holdings, NFTs, activity, history, trading, validator, and a contract's code and events).
 */
export function AddressView({ address }: { address: string }) {
  const format = detectAddressFormat(address)
  const evm = /^0x[0-9a-fA-F]{40}$/.test(address)
  const [token, setToken] = useState<NativeToken | null | undefined>(evm ? undefined : null)
  const [collection, setCollection] = useState<NftCollection | null | undefined>(evm ? undefined : null)

  useEffect(() => {
    if (!evm) return
    let live = true
    getToken(address).then((t) => live && setToken(t))
    getNftCollection(address).then((c) => live && setCollection(c))
    return () => {
      live = false
    }
  }, [address, evm])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {!format ? (
        <ErrorState title="Invalid address" error={`"${address}" is not a QRDX address. Supported: 0xPQ… (post-quantum), 0x… (EVM or token), Q…/R… (legacy).`} />
      ) : token === undefined || (!token && collection === undefined) ? (
        <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading address…
        </p>
      ) : token ? (
        <TokenView token={token} />
      ) : collection ? (
        <Suspense>
          <CollectionView collection={collection} />
        </Suspense>
      ) : (
        <AccountView address={address} />
      )}
    </div>
  )
}
