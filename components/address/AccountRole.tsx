'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Boxes, KeyRound, Layers, ShieldCheck, Users, Vault } from 'lucide-react'
import { AddressLink, TxLink } from '@/components/explorer/common'
import { useTokenMap } from '@/components/explorer/data'
import { Panel, Pill, Row, fmtNum, toneOf } from '@/components/explorer/ui'
import {
  getBackstopVault,
  getPool,
  getProtocolAddresses,
  getSpotBook,
  getSubaccounts,
  getUserVault,
  holderOwner,
  type BackstopVault,
  type BookSummary,
  type Controlled,
  type PoolDetail,
  type ProtocolKind,
  type Subaccount,
  type UserVaultDetail,
} from '@/lib/qrdx/accounts'
import { assetSymbol, getPerpAccount, getSubaccountTransfers, tradeLink, type IndexedTx, type PerpAccount } from '@/lib/qrdx/indexed'
import type { Authority } from '@/lib/qrdx/qns'
import { cn } from '@/lib/utils'

const date = (t: string | number) => new Date(Number(t) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const days = (s: string | number) => `${Math.round(Number(s) / 86400)} days`
const pct = (part: string, whole: string) => (Number(whole) > 0 ? `${((Number(part) / Number(whole)) * 100).toFixed(2)}%` : '—')

/** What a protocol account belongs to, read once: its vault, pool, book or the backstop vault. */
export interface RoleData {
  vault?: UserVaultDetail | null
  backstop?: BackstopVault | null
  pool?: PoolDetail | null
  book?: BookSummary | null
  /** A sub-account's own entry in its master's list (number, name). */
  sub?: Subaccount | null
  /** Where the backstop vault is, for the protocol-shares holder. */
  backstopAddress?: string | null
  /** A sub-account's transfers with its master (filed under the master by the node's index). */
  transfers?: IndexedTx[] | null
}

export function useRoleData(address: string, kind: ProtocolKind | null, authority: Authority | null): RoleData {
  const [data, setData] = useState<RoleData>({})
  const master = authority?.subaccount_of ?? null
  useEffect(() => {
    if (!kind) return
    let live = true
    const set = (d: RoleData) => live && setData((x) => ({ ...x, ...d }))
    if (kind.tag === 'UVLT') getUserVault(address).then((vault) => set({ vault }))
    if (kind.tag === 'HLPV' || kind.tag === 'PROT') getBackstopVault().then((backstop) => set({ backstop }))
    if (kind.tag === 'PROT') getProtocolAddresses().then((p) => set({ backstopAddress: p?.backstop_vault ?? null }))
    if (kind.tag === 'POOL' || kind.tag === 'CLOB')
      holderOwner(address).then((o) => {
        if (o?.poolId) getPool(o.poolId).then((pool) => set({ pool }))
        else if (o?.pair) getSpotBook(o.pair).then((book) => set({ book }))
        else set({ pool: null, book: null })
      })
    return () => {
      live = false
    }
  }, [address, kind])
  useEffect(() => {
    if (!master) return
    let live = true
    getSubaccounts(master).then((list) => live && setData((x) => ({ ...x, sub: list?.find((s) => s.subaccount.toLowerCase() === address.toLowerCase()) ?? null })))
    getSubaccountTransfers(master, address).then(
      (transfers) => live && setData((x) => ({ ...x, transfers })),
      () => live && setData((x) => ({ ...x, transfers: null }))
    )
    return () => {
      live = false
    }
  }, [address, master])
  return data
}

/** The page's title for a protocol account: its vault's name, its pool's pair, or its kind. */
export function roleTitle(kind: ProtocolKind, data: RoleData, sym: (a: string) => string): string {
  if (kind.tag === 'UVLT' && data.vault) return data.vault.managed ? `${data.vault.managed} liquidity vault` : data.vault.name || 'Vault'
  if (kind.tag === 'POOL' && data.pool) return `${sym(data.pool.token0)} / ${sym(data.pool.token1)} pool`
  if (kind.tag === 'CLOB' && data.book) return `${sym(data.book.base)} / ${sym(data.book.quote)} book escrow`
  if (kind.tag === 'SUBA' && data.sub) return data.sub.name || `Sub-account #${data.sub.index}`
  return kind.label
}

function Positions({ positions }: { positions: Record<string, { size: string; entry_price?: string }> }) {
  const rows = Object.entries(positions).filter(([, p]) => Number(p.size) !== 0)
  if (!rows.length) return <Row k="Positions">None open</Row>
  return (
    <div className="border-b last:border-b-0">
      <div className="px-4 pt-2.5 text-sm text-muted-foreground">Positions</div>
      <div className="divide-y">
        {rows.map(([id, p]) => (
          <div key={id} className="num flex items-center gap-3 px-4 py-2 text-sm">
            <span className="font-medium">{id}</span>
            <Pill tone={Number(p.size) > 0 ? 'bid' : 'ask'}>{Number(p.size) > 0 ? 'Long' : 'Short'}</Pill>
            <span className="ml-auto">{fmtNum(p.size.replace('-', ''))}</span>
            {p.entry_price && <span className="text-muted-foreground">at {fmtNum(p.entry_price, 4)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** What this account is: a sub-account and its master, a vault and its leader, a pool, a book escrow, a multisig. */
export function RolePanel({ address, kind, authority, data }: { address: string; kind: ProtocolKind | null; authority: Authority | null; data: RoleData }) {
  const tokens = useTokenMap()
  const sym = (a: string) => assetSymbol(a, tokens)
  const multisig = authority?.multisig

  if (!kind && !multisig) return null
  const icon = kind?.tag === 'UVLT' || kind?.tag === 'HLPV' ? <Vault className="h-4 w-4" /> : kind ? <Boxes className="h-4 w-4" /> : <Users className="h-4 w-4" />

  return (
    <Panel title={kind ? kind.label : `Multisig, ${multisig!.threshold} of ${multisig!.members.length}`} icon={icon}>
      <p className="border-b px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        {kind
          ? kind.about
          : `An m-of-n of post-quantum keys: a transaction from it needs ${multisig!.threshold} of its ${multisig!.members.length} members to sign.`}
      </p>

      {kind?.tag === 'SUBA' && (
        <>
          <Row k="Master account">{authority?.subaccount_of ? <AddressLink address={authority.subaccount_of} /> : '—'}</Row>
          {data.sub && <Row k="Number">#{data.sub.index}</Row>}
          {data.sub?.name && <Row k="Name">{data.sub.name}</Row>}
          <div className="border-b last:border-b-0">
            <div className="px-4 pt-2.5 text-sm text-muted-foreground">Transfers with its master</div>
            {data.transfers === undefined ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Reading the master&apos;s history…</p>
            ) : !data.transfers?.length ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{data.transfers === null ? 'The node’s index is not available.' : 'None yet.'}</p>
            ) : (
              <div className="divide-y">
                {data.transfers.map((t) => {
                  const p = (t.detail?.params ?? {}) as Record<string, unknown>
                  const inward = p.direction !== 'from_sub'
                  return (
                    <div key={t.tx_hash} className="num flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                      <Pill tone={t.status === 'failed' ? 'ask' : inward ? 'bid' : 'muted'}>{t.status === 'failed' ? 'Failed' : inward ? 'In' : 'Out'}</Pill>
                      <span className="font-medium">
                        {fmtNum(String(p.amount ?? ''), 6)} {sym(String(p.asset ?? 'QRDX'))}
                      </span>
                      <span className="text-muted-foreground">{inward ? 'from the master' : 'to the master'}</span>
                      <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                        {new Date(t.timestamp * 1000).toLocaleString()}
                        <TxLink hash={t.tx_hash} />
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {kind?.tag === 'UVLT' &&
        (data.vault === undefined ? (
          <Row k="Vault">Loading…</Row>
        ) : data.vault === null ? (
          <Row k="Vault">The node has no vault at this address</Row>
        ) : (
          <>
            {data.vault.managed ? (
              <>
                <Row k="Quotes market">{data.vault.managed}</Row>
                <Row k="Traded by">the protocol, on the market&apos;s book</Row>
                <Row k="Funded by">
                  <AddressLink address={data.vault.leader} />
                </Row>
              </>
            ) : (
              <>
                <Row k="Name">{data.vault.name || '—'}</Row>
                <Row k="Leader">
                  <AddressLink address={data.vault.leader} />
                </Row>
                <Row k="Leader's profit share">{fmtNum(Number(data.vault.profit_share) * 100, 2)}%</Row>
              </>
            )}
            <Row k="Created">{date(data.vault.created)}</Row>
            <Row k="Net asset value">{fmtNum(data.vault.nav, 2)}</Row>
            <Row k="Share value">{data.vault.share_value ? fmtNum(data.vault.share_value, 6) : '—'}</Row>
            <Row k="Shares">
              {fmtNum(data.vault.total_shares, 2)}
              <span className="text-muted-foreground"> · leader {pct(data.vault.leader_shares, data.vault.total_shares)}</span>
            </Row>
            <Row k="Depositors">{data.vault.holders}</Row>
            <Row k="Withdrawable now">{fmtNum(data.vault.withdrawable, 2)}</Row>
            <Row k="Deposit lockup">{days(data.vault.lockup_seconds)}</Row>
            <Positions positions={data.vault.positions} />
          </>
        ))}

      {(kind?.tag === 'HLPV' || kind?.tag === 'PROT') &&
        (data.backstop ? (
          <>
            {kind.tag === 'PROT' && data.backstopAddress && (
              <Row k="Backstop vault">
                <AddressLink address={data.backstopAddress} />
              </Row>
            )}
            <Row k="Net asset value">{fmtNum(data.backstop.nav, 2)}</Row>
            <Row k="Collateral">{fmtNum(data.backstop.collateral, 2)}</Row>
            <Row k="Share value">{data.backstop.share_value ? fmtNum(data.backstop.share_value, 6) : '—'}</Row>
            <Row k="Shares">
              {fmtNum(data.backstop.total_shares, 2)}
              <span className="text-muted-foreground"> · protocol {pct(data.backstop.protocol_shares, data.backstop.total_shares)}</span>
            </Row>
            <Row k="Depositors">{data.backstop.depositors}</Row>
            <Row k="Deposit lockup">{days(data.backstop.lockup_seconds)}</Row>
            {kind.tag === 'HLPV' && <Positions positions={data.backstop.positions} />}
          </>
        ) : (
          <Row k="Vault">{data.backstop === null ? 'Not served by this node' : 'Loading…'}</Row>
        ))}

      {kind?.tag === 'POOL' &&
        (data.pool ? (
          <>
            <Row k="Pair">
              <TokenLink token={data.pool.token0} sym={sym} /> / <TokenLink token={data.pool.token1} sym={sym} />
            </Row>
            <Row k="Pool">{data.pool.pool_id}</Row>
            <Row k="Fee">{fmtNum(Number(data.pool.fee_rate) * 100, 4)}%</Row>
            <Row k="Price">
              1 {sym(data.pool.token0)} = {fmtNum(data.pool.price, 8)} {sym(data.pool.token1)}
            </Row>
            <Row k="Liquidity">{fmtNum(data.pool.liquidity, 2)}</Row>
            <Row k="Liquidity positions">{data.pool.positions}</Row>
            <Row k="Volume">
              {fmtNum(data.pool.volume[0], 2)} {sym(data.pool.token0)} · {fmtNum(data.pool.volume[1], 2)} {sym(data.pool.token1)}
            </Row>
            <Row k="Creator">
              <AddressLink address={data.pool.creator} />
            </Row>
            {data.pool.paused && <Row k="Status">Paused</Row>}
            {tradeLink(`/pools/${data.pool.pool_id}`) && (
              <Row k="Trade">
                <a href={tradeLink(`/pools/${data.pool.pool_id}`)!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Open on QRDX Trade
                </a>
              </Row>
            )}
          </>
        ) : (
          <Row k="Pool">{data.pool === null ? 'Not found in the node’s protocol addresses' : 'Loading…'}</Row>
        ))}

      {kind?.tag === 'CLOB' &&
        (data.book ? (
          <>
            <Row k="Book">
              <TokenLink token={data.book.base} sym={sym} /> / <TokenLink token={data.book.quote} sym={sym} />
            </Row>
            <Row k="Best bid">{data.book.best_bid ? fmtNum(data.book.best_bid, 8) : '—'}</Row>
            <Row k="Best ask">{data.book.best_ask ? fmtNum(data.book.best_ask, 8) : '—'}</Row>
            <Row k="Levels">
              {data.book.bids.length} bid · {data.book.asks.length} ask
            </Row>
          </>
        ) : (
          <Row k="Book">{data.book === null ? 'Not found in the node’s protocol addresses' : 'Loading…'}</Row>
        ))}

      {kind?.tag === 'PERP' && (
        <Row k="Markets">
          <Link href="/trading" className="text-primary hover:underline">
            Perpetual markets and vaults
          </Link>
        </Row>
      )}
      {kind?.tag === 'VETO' && (
        <Row k="Proposals">
          <Link href="/governance" className="text-primary hover:underline">
            Governance
          </Link>
        </Row>
      )}
      {kind?.tag === 'BRDG' && (
        <Row k="Bridged assets">
          <Link href="/bridge" className="text-primary hover:underline">
            Bridge
          </Link>
        </Row>
      )}
      {kind?.tag === 'FEES' && (
        <Row k="Paid to">
          <Link href="/validators" className="text-primary hover:underline">
            Validators and their delegators
          </Link>
        </Row>
      )}

      {multisig && (
        <div className="divide-y">
          {multisig.members.map((m, i) => (
            <div key={m} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground">Key {i + 1}</span>
              <AddressLink address={m} className="min-w-0" />
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function TokenLink({ token, sym }: { token: string; sym: (a: string) => string }) {
  if (token.toUpperCase() === 'QRDX') return <span>QRDX</span>
  return (
    <Link href={`/address/${token}`} className="text-primary hover:underline">
      {sym(token)}
    </Link>
  )
}

interface SubRow extends Subaccount {
  perp: PerpAccount | null
}

/**
 * Who acts for this account (its agents and controllers) and what it acts for: its
 * sub-accounts with their margin, the vaults it leads, the accounts it controls, is an agent
 * or a guardian for, and the multisigs it is a member of.
 */
export function ControlsPanel({ address, controlled, authority }: { address: string; controlled: Controlled | null; authority: Authority | null }) {
  const [subs, setSubs] = useState<SubRow[] | null>(null)
  const [vaults, setVaults] = useState<(UserVaultDetail | null)[] | null>(null)
  const subCount = controlled?.subaccounts.length ?? 0
  const led = controlled?.vaults_led ?? []

  useEffect(() => {
    if (!subCount) return
    let live = true
    getSubaccounts(address).then(async (list) => {
      const rows = await Promise.all((list ?? []).map(async (s) => ({ ...s, perp: await getPerpAccount(s.subaccount) })))
      if (live) setSubs(rows)
    })
    return () => {
      live = false
    }
  }, [address, subCount])

  const ledKey = led.join(',')
  useEffect(() => {
    if (!ledKey) return
    let live = true
    Promise.all(ledKey.split(',').map((v) => getUserVault(v))).then((r) => live && setVaults(r))
    return () => {
      live = false
    }
  }, [ledKey])

  const agents = authority?.agents ?? []
  const lists: { k: string; items: string[] }[] = [
    { k: 'Controls', items: controlled?.controls ?? [] },
    { k: 'Agent for', items: controlled?.agent_for ?? [] },
    { k: 'Multisig member of', items: controlled?.multisigs ?? [] },
    { k: 'Guardian of', items: controlled?.guardian_of ?? [] },
  ].filter((l) => l.items.length > 0)
  if (!subCount && !led.length && !agents.length && !lists.length) return null

  return (
    <Panel title="Accounts it acts for" icon={<KeyRound className="h-4 w-4" />}>
      {subCount > 0 && (
        <div className="border-b">
          <div className="flex items-center gap-2 px-4 pt-3 text-sm font-medium">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" /> Sub-accounts <span className="text-muted-foreground">({subCount})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Sub-account</th>
                  <th className="px-3 py-2 text-right font-medium">Perps equity</th>
                  <th className="px-4 py-2 text-right font-medium">Positions</th>
                </tr>
              </thead>
              <tbody>
                {(subs ?? controlled!.subaccounts.map((s, i) => ({ subaccount: s, index: i, name: '', perp: null }))).map((s) => {
                  const open = Object.values(s.perp?.positions ?? {}).filter((p) => Number(p.size) !== 0).length
                  return (
                    <tr key={s.subaccount} className="border-t hover:bg-accent/40">
                      <td className="px-4 py-2 text-muted-foreground">{s.index}</td>
                      <td className="max-w-[320px] px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {s.name && <span className="shrink-0 font-medium">{s.name}</span>}
                          <AddressLink address={s.subaccount} className="min-w-0" />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{subs ? (s.perp && Number(s.perp.equity) !== 0 ? fmtNum(s.perp.equity, 2) : '—') : '…'}</td>
                      <td className="px-4 py-2 text-right">{subs ? open || '—' : '…'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {led.length > 0 && (
        <div className="border-b">
          <div className="flex items-center gap-2 px-4 pt-3 text-sm font-medium">
            <Vault className="h-3.5 w-3.5 text-muted-foreground" /> Vaults it leads <span className="text-muted-foreground">({led.length})</span>
          </div>
          <div className="divide-y">
            {led.map((v, i) => {
              const d = vaults?.[i]
              return (
                <div key={v} className="num flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <span className="font-medium">{d ? (d.managed ? `${d.managed} liquidity vault` : d.name || 'Vault') : '…'}</span>
                  <AddressLink address={v} className="min-w-0" />
                  {d && (
                    <span className="ml-auto text-muted-foreground">
                      NAV {fmtNum(d.nav, 2)} · {d.holders} depositor{d.holders === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {agents.length > 0 && (
        <div className="border-b">
          <div className="flex items-center gap-2 px-4 pt-3 text-sm font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /> Trading agents it approved
          </div>
          <div className="divide-y">
            {agents.map((a) => {
              const expired = Number(a.valid_until) > 0 && Number(a.valid_until) * 1000 < Date.now()
              return (
                <div key={a.agent} className="num flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  {a.name && <span className="font-medium">{a.name}</span>}
                  <AddressLink address={a.agent} className="min-w-0" />
                  <span className={cn('ml-auto text-xs', expired ? toneOf(-1) : 'text-muted-foreground')}>
                    {Number(a.valid_until) > 0 ? `${expired ? 'expired' : 'until'} ${date(a.valid_until)}` : 'until revoked'}
                    {a.max_notional_per_day ? ` · ${fmtNum(a.max_notional_per_day, 0)} a day` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {lists.map((l) => (
        <div key={l.k} className="flex items-start justify-between gap-4 border-b px-4 py-2.5 text-sm last:border-b-0">
          <span className="shrink-0 text-muted-foreground">{l.k}</span>
          <span className="flex min-w-0 flex-col items-end gap-1">
            {l.items.map((a) => (
              <AddressLink key={a} address={a} />
            ))}
          </span>
        </div>
      ))}
    </Panel>
  )
}

