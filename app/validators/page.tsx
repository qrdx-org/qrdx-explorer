'use client'

import { useMemo, useState } from 'react'
import { Coins, Gauge, Layers, PiggyBank, Settings2, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { useChain, useLive } from '@/components/explorer/ChainProvider'
import { AddressLink, BlockLink } from '@/components/explorer/common'
import { useChainStats, useLiveBlocks, usePolled } from '@/components/explorer/hooks'
import { Panel, Pill, Row, Tabs, Tile, fmtCompact, fmtNum } from '@/components/explorer/ui'
import { getValidators } from '@/lib/qrdx'
import { epochMs, getStakingParams, getStakingPools, getStakingValidators, type StakingValidator } from '@/lib/qrdx/consensus'
import { formatDuration, formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUSES = ['all', 'active', 'pending', 'exiting', 'exited'] as const

/** Staking reads; on a node without staking_*, the validator registry (no weights, delegation or rewards). */
async function loadValidators(): Promise<{ list: StakingValidator[]; staking: boolean }> {
  try {
    return { list: await getStakingValidators(), staking: true }
  } catch {
    const v = await getValidators()
    return {
      staking: false,
      list: v.map((x) => ({ address: x.address, status: x.status, stake: x.stake, effective_stake: x.effectiveStake, delegated: '0', weight: x.effectiveStake, earned: '0', activation_epoch: x.activationEpoch, exit_epoch: x.exitEpoch, slashed: x.slashed })),
    }
  }
}

export default function ValidatorsPage() {
  const { clock } = useChain()
  const stats = useChainStats(0)
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const validators = usePolled(loadValidators, 15_000)
  const pools = usePolled(() => getStakingPools().catch(() => []), 30_000)
  const params = usePolled(() => getStakingParams().catch(() => null), 120_000)
  // Keep the newest headers coming, so proposal counts cover the blocks as they arrive.
  useLiveBlocks(32)
  const headers = useLive((l) => l.headers())

  const list = validators.data?.list ?? null
  const active = (list ?? []).filter((v) => v.status === 'active')
  const totalWeight = active.reduce((s, v) => s + Number(v.weight), 0)
  const totalDelegated = (list ?? []).reduce((s, v) => s + Number(v.delegated), 0)
  const totalEarned = (list ?? []).reduce((s, v) => s + Number(v.earned), 0)
  const slashed = (list ?? []).filter((v) => v.slashed).length
  const poolBy = new Map((pools.data ?? []).map((p) => [p.validator.toLowerCase(), p]))

  const proposals = useMemo(() => {
    const map = new Map<string, { proposed: number; last: number; attested: number }>()
    for (const b of headers) {
      if (b.proposer) {
        const k = b.proposer.toLowerCase()
        const e = map.get(k) ?? { proposed: 0, last: -1, attested: 0 }
        e.proposed++
        e.last = Math.max(e.last, b.height)
        map.set(k, e)
      }
      if (b.header.kind === 'pos')
        for (const a of b.header.attestations) {
          const k = a.validatorAddress.toLowerCase()
          const e = map.get(k) ?? { proposed: 0, last: -1, attested: 0 }
          e.attested++
          map.set(k, e)
        }
    }
    return map
  }, [headers])
  const coverage = headers.length ? `${headers.length.toLocaleString()} headers read this visit (#${headers[0].height.toLocaleString()} – #${headers[headers.length - 1].height.toLocaleString()})` : 'no headers read yet'

  const filtered = (list ?? []).filter((v) => status === 'all' || v.status === status)
  const ep = clock ? epochMs(clock) : null
  const span = (epochs: number | undefined) => (epochs != null && ep ? formatDuration((epochs * ep) / 1000) : '—')

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Validators</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Proof of stake with ML-DSA-65 signatures. A validator proposes in the slots its weight (own stake plus delegated) wins, and votes on finality every epoch.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Active" icon={<ShieldCheck className="h-4 w-4" />} value={list ? active.length : '—'} sub={list ? `${list.length} in the set` : ''} />
        <Tile label="Voting weight" icon={<Gauge className="h-4 w-4" />} value={list ? `${fmtCompact(totalWeight)}` : '—'} sub="QRDX, active validators" />
        <Tile label="Delegated" icon={<Users className="h-4 w-4" />} value={list ? fmtCompact(totalDelegated) : '—'} sub={pools.data ? `${pools.data.length} pool${pools.data.length === 1 ? '' : 's'}` : 'QRDX in pools'} />
        <Tile label="Rewards earned" icon={<PiggyBank className="h-4 w-4" />} value={list ? fmtNum(totalEarned, 4) : '—'} sub={params.data ? `${(params.data.reward_rate_bps_per_year / 100).toFixed(2)}% a year` : 'QRDX'} />
        <Tile label="Finalized epoch" icon={<Layers className="h-4 w-4" />} value={stats.finalizedEpoch != null ? stats.finalizedEpoch.toLocaleString() : '—'} sub={stats.finalityLagEpochs != null && ep ? `${stats.finalityLagEpochs} behind · ${formatMs(stats.finalityLagEpochs * ep)}` : ''} />
        <Tile label="Slashed" icon={<ShieldAlert className="h-4 w-4" />} value={list ? slashed : '—'} sub="validators" />
      </div>

      <Panel
        title="Validator set"
        icon={<ShieldCheck className="h-4 w-4" />}
        right={<Tabs tabs={STATUSES.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))} value={status} onChange={setStatus} className="border-b-0" />}
      >
        {!list ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{validators.error ?? 'Loading validators…'}</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No validators{status === 'all' ? '' : ` with status ${status}`}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium">Validator</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Weight</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Own stake</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Delegated</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Earned</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium xl:table-cell">Pool</th>
                  <th className="px-3 py-2.5 text-right font-medium">Proposed</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Last block</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const p = proposals.get(v.address.toLowerCase())
                  const pool = poolBy.get(v.address.toLowerCase())
                  const share = totalWeight > 0 && v.status === 'active' ? (Number(v.weight) / totalWeight) * 100 : 0
                  return (
                    <tr key={v.address} className="border-b last:border-b-0 hover:bg-accent/40">
                      <td className="max-w-[260px] px-4 py-2.5">
                        <AddressLink address={v.address} avatar />
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill tone={v.slashed ? 'ask' : v.status === 'active' ? 'bid' : 'warn'}>{v.slashed ? 'slashed' : v.status}</Pill>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          from epoch {v.activation_epoch ?? '—'}
                          {v.exit_epoch != null ? ` · exits ${v.exit_epoch}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div>{fmtNum(v.weight, 2)}</div>
                        <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-muted" title={`${share.toFixed(2)}% of active weight`}>
                          <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 text-right lg:table-cell">
                        {fmtNum(v.effective_stake, 2)}
                        <div className="text-[11px] text-muted-foreground">bonded {fmtNum(v.stake, 0)}</div>
                      </td>
                      <td className="hidden px-3 py-2.5 text-right lg:table-cell">{fmtNum(v.delegated, 2)}</td>
                      <td className="hidden px-3 py-2.5 text-right md:table-cell">{fmtNum(v.earned, 6)}</td>
                      <td className="hidden px-3 py-2.5 text-right xl:table-cell">
                        {pool ? (
                          <>
                            {(pool.commission_bps / 100).toFixed(2)}%<div className="text-[11px] text-muted-foreground">{pool.delegators} delegator{pool.delegators === 1 ? '' : 's'}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {p?.proposed ?? 0}
                        {p?.attested ? <div className="text-[11px] text-muted-foreground">{p.attested} att.</div> : null}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right sm:table-cell">{p && p.last >= 0 ? <BlockLink height={p.last} /> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          {validators.data?.staking === false ? 'This node has no staking_* methods: stake from the registry, without delegation or rewards. ' : 'From staking_getValidators. '}
          Proposals and attestations counted over the {coverage}.
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Delegation pools" icon={<Coins className="h-4 w-4" />}>
          {!pools.data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading pools…</p>
          ) : pools.data.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No delegation pools yet. A validator&apos;s pool opens with its first delegation (STAKE_DELEGATE).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="num w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b text-left">
                    <th className="px-4 py-2.5 font-medium">Validator</th>
                    <th className="px-3 py-2.5 text-right font-medium">Value</th>
                    <th className="px-3 py-2.5 text-right font-medium">Share price</th>
                    <th className="px-3 py-2.5 text-right font-medium">Commission</th>
                    <th className="px-4 py-2.5 text-right font-medium">Warming up</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.data.map((p) => (
                    <tr key={p.validator} className="border-b last:border-b-0">
                      <td className="max-w-[200px] px-4 py-2">
                        <AddressLink address={p.validator} />
                        <div className="text-[11px] text-muted-foreground">{p.delegators} delegators</div>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtNum(p.value, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(p.share_price, 6)}</td>
                      <td className="px-3 py-2 text-right">
                        {(p.commission_bps / 100).toFixed(2)}%
                        {p.next_commission_bps != null && p.next_commission_bps !== p.commission_bps && <div className="text-[11px] text-warn">→ {(p.next_commission_bps / 100).toFixed(2)}%</div>}
                      </td>
                      <td className="px-4 py-2 text-right">{fmtNum(p.warming_up, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Staking parameters" icon={<Settings2 className="h-4 w-4" />}>
          {params.data ? (
            <>
              <Row k="Minimum validator stake">{fmtNum(params.data.min_validator_stake, 0)} QRDX</Row>
              <Row k="Minimum delegation">{fmtNum(params.data.min_delegation, 4)} QRDX</Row>
              <Row k="Reward rate">
                {(params.data.reward_rate_bps_per_year / 100).toFixed(2)}% a year · {Number(params.data.reward_rate_per_epoch).toExponential(4)} an epoch
              </Row>
              <Row k="Default commission">{(params.data.default_commission_bps / 100).toFixed(2)}%</Row>
              <Row k="Warm-up">
                {params.data.warmup_epochs} epochs · {span(params.data.warmup_epochs)}
              </Row>
              <Row k="Unbonding">
                {params.data.unbonding_epochs.toLocaleString()} epochs · {span(params.data.unbonding_epochs)}
              </Row>
              <Row k="Withdrawal delay">
                {params.data.withdrawal_delay_epochs.toLocaleString()} epochs · {span(params.data.withdrawal_delay_epochs)}
              </Row>
              {clock && (
                <Row k="Epoch">
                  {clock.slotsPerEpoch} slots × {formatMs(clock.slotMs)} = {formatMs(epochMs(clock))}
                </Row>
              )}
            </>
          ) : (
            <p className={cn('py-10 text-center text-sm text-muted-foreground')}>{params.loading ? 'Loading…' : 'This node does not serve staking_getParams.'}</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
