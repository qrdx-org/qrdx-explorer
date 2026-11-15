'use client'

import { useEffect, useMemo, useState } from 'react'
import { AddressLink, EmptyState, LoadingState } from '@/components/explorer/common'
import { useTokenMap } from '@/components/explorer/data'
import { Pill } from '@/components/explorer/ui'
import { formatQrdx } from '@/lib/format'
import { getAddressBalance } from '@/lib/qrdx'
import { getProtocolAddresses, protocolKind } from '@/lib/qrdx/accounts'
import { assetSymbol, getPools } from '@/lib/qrdx/indexed'
import { getUserVaults } from '@/lib/qrdx/trading'

interface Row {
  address: string
  name: string
  balance?: string | null
}

/**
 * The addresses the protocol holds funds at (exchange_getProtocolAddresses): the perps
 * clearinghouse, the backstop vault, every pool's reserves, every book's escrow, every vault,
 * the escrows and authorities. None has a key; each page says what it holds.
 */
export function ProtocolAccounts({ filter }: { filter: string }) {
  const tokens = useTokenMap()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([getProtocolAddresses(), getPools().catch(() => []), getUserVaults()]).then(([p, pools, vaults]) => {
      if (!live) return
      if (!p) return setError('This node does not list its protocol addresses (exchange_getProtocolAddresses).')
      const sym = (a: string) => assetSymbol(a, tokens)
      const pair = (id: string) => {
        const pool = pools.find((x) => x.pool_id === id)
        return pool ? `${sym(pool.token0)} / ${sym(pool.token1)}` : id
      }
      const list: Row[] = [
        { address: p.perps_holder, name: 'Perps clearinghouse' },
        { address: p.backstop_vault, name: 'Backstop vault' },
        { address: p.protocol_vault_shares, name: 'Protocol vault shares' },
        ...(vaults ?? []).map((v) => ({ address: v.vault, name: v.managed ? `${v.managed} liquidity vault` : `Vault: ${v.name || 'unnamed'}` })),
        ...p.pools.map((x) => ({ address: x.holder, name: `${pair(x.pool_id)} pool` })),
        ...p.order_books.map((b) => ({ address: b.escrow, name: `${b.pair.split(':').map(sym).join(' / ')} book escrow` })),
        { address: p.veto_escrow, name: 'Governance veto escrow' },
        { address: p.bridge_mint_authority, name: 'Bridge mint authority' },
        ...(p.qns_mint_authority ? [{ address: p.qns_mint_authority, name: 'QNS mint authority' }] : []),
        ...(p.staker_fees ? [{ address: p.staker_fees, name: 'Staker fees' }] : []),
      ]
      setRows(list)
      list.forEach((r) =>
        getAddressBalance(r.address).then(
          (balance) => live && setRows((prev) => prev?.map((x) => (x.address === r.address ? { ...x, balance } : x)) ?? prev),
          () => live && setRows((prev) => prev?.map((x) => (x.address === r.address ? { ...x, balance: null } : x)) ?? prev),
        ),
      )
    })
    return () => {
      live = false
    }
  }, [tokens])

  const q = filter.trim().toLowerCase()
  const shown = useMemo(() => (rows ?? []).filter((r) => !q || r.address.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)), [rows, q])

  if (error) return <EmptyState title="Not available" description={error} />
  if (!rows) return <LoadingState label="Loading protocol accounts…" />
  if (!shown.length) return <EmptyState title="No matching accounts" />
  return (
    <div className="divide-y">
      {shown.map((r) => (
        <div key={r.address} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <Pill>{protocolKind(r.address)?.label ?? 'Protocol'}</Pill>
            </div>
            <AddressLink address={r.address} full className="mt-1" />
          </div>
          <div className="shrink-0 text-right font-medium">
            {r.balance === undefined ? <span className="text-muted-foreground">…</span> : r.balance === null ? <span className="text-muted-foreground">—</span> : formatQrdx(r.balance, 4)}
          </div>
        </div>
      ))}
    </div>
  )
}
