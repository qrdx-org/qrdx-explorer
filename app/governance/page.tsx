'use client'

import { useState } from 'react'
import { ArrowLeftRight, ChevronDown, Crown, Gavel, Landmark, Scale, Settings2, ShieldCheck, Users, Vote } from 'lucide-react'
import { useChain, useHead } from '@/components/explorer/ChainProvider'
import { AddressLink, BlockLink } from '@/components/explorer/common'
import { usePolled } from '@/components/explorer/hooks'
import { Panel, Pill, Row, Tabs, Tile, fmtCompact, fmtNum } from '@/components/explorer/ui'
import { getBridgeAssets, getGovernanceStatus, getProposals, getStakingValidators, type Proposal } from '@/lib/qrdx/consensus'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'executed', label: 'Executed' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'vetoed', label: 'Vetoed' },
  { id: 'expired', label: 'Expired' },
] as const
type Filter = (typeof FILTERS)[number]['id']

const ACTIONS: Record<string, string> = {
  system_spend: 'Treasury spend',
  freeze_master: 'Freeze master controller',
  approve_fork: 'Approve fork',
}

const STATUS_TONE: Record<string, 'primary' | 'bid' | 'ask' | 'warn' | 'muted'> = {
  voting: 'primary',
  passed: 'warn',
  executed: 'bid',
  rejected: 'ask',
  vetoed: 'ask',
  expired: 'muted',
}

export default function GovernancePage() {
  const head = useHead(1000)
  const { clock } = useChain()
  const [filter, setFilter] = useState<Filter>('all')
  const status = usePolled(() => getGovernanceStatus(), 10_000)
  const proposals = usePolled(() => getProposals(filter === 'all' ? undefined : filter, 200), 10_000, [filter])
  const bridge = usePolled(() => getBridgeAssets().catch(() => null), 60_000)
  // The committee is keyed by lower-case address; show each as its validator writes it (0xPQ, checksummed).
  const validators = usePolled(() => getStakingValidators().catch(() => []), 60_000)
  const canonical = new Map((validators.data ?? []).map((v) => [v.address.toLowerCase(), v.address]))
  const display = (a: string) => canonical.get(a.toLowerCase()) ?? a
  // A block a slot (the chain fills nearly every slot): deadlines in time are estimates.
  const blockMs = clock?.slotMs ?? null
  /** Blocks from now as time, at the current block rate. */
  const inBlocks = (blocks: number) => (blockMs ? formatDuration(Math.max(0, (blocks * blockMs) / 1000)) : `${blocks.toLocaleString()} blocks`)

  const s = status.data
  const committee = s ? Object.entries(s.committee).sort((a, b) => Number(b[1]) - Number(a[1])) : []
  const committeeWeight = committee.reduce((sum, [, w]) => sum + Number(w), 0)
  const p = s?.params ?? {}

  if (status.error && !s)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
        <Panel className="mt-6" bodyClassName="py-12 text-center text-sm text-muted-foreground">
          This node does not serve governance_* ({status.error}).
        </Panel>
      </div>
    )

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Validators propose and vote, weighted by stake; a proposal passes at {p.GOV_APPROVAL_THRESHOLD_BPS ? `${(p.GOV_APPROVAL_THRESHOLD_BPS / 100).toFixed(2)}%` : 'two thirds'} of the committee&apos;s weight. QRDX holders can
          veto a passed proposal during its timelock by locking QRDX. Deadlines are block heights.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Open proposals" icon={<Vote className="h-4 w-4" />} value={s ? s.open_proposals : '—'} sub="voting or in timelock" />
        <Tile label="Committee" icon={<Users className="h-4 w-4" />} value={s ? committee.length : '—'} sub={s ? `${fmtCompact(committeeWeight)} QRDX weight` : ''} />
        <Tile label="Approval" icon={<Scale className="h-4 w-4" />} value={p.GOV_APPROVAL_THRESHOLD_BPS ? `${(p.GOV_APPROVAL_THRESHOLD_BPS / 100).toFixed(2)}%` : '—'} sub="of snapshot weight" />
        <Tile label="Veto threshold" icon={<Gavel className="h-4 w-4" />} value={p.GOV_VETO_THRESHOLD_QRDX ? fmtCompact(p.GOV_VETO_THRESHOLD_QRDX) : '—'} sub="QRDX locked" />
        <Tile label="Voting period" icon={<Landmark className="h-4 w-4" />} value={p.GOV_VOTING_PERIOD_BLOCKS ? inBlocks(p.GOV_VOTING_PERIOD_BLOCKS) : '—'} sub={p.GOV_VOTING_PERIOD_BLOCKS ? `${p.GOV_VOTING_PERIOD_BLOCKS.toLocaleString()} blocks` : ''} />
        <Tile
          label="Master controller"
          icon={<Crown className="h-4 w-4" />}
          value={s ? (s.master_controller.authority ? 'Active' : 'Ended') : '—'}
          sub={s ? (s.master_controller.authority ? `sunsets at block ${s.master_controller.sunset_height.toLocaleString()}` : s.master_controller.frozen_at != null ? `frozen at ${s.master_controller.frozen_at.toLocaleString()}` : 'past its sunset') : ''}
        />
      </div>

      <Panel title="Proposals" icon={<Vote className="h-4 w-4" />} right={<Tabs tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))} value={filter} onChange={setFilter} className="border-b-0" />}>
        {!proposals.data ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{proposals.error ?? 'Loading proposals…'}</p>
        ) : proposals.data.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {filter === 'all' ? 'No proposals yet. A committee validator opens one with GOV_PROPOSE: a treasury spend, freezing the master controller, or approving a scheduled fork.' : `No ${filter} proposals.`}
          </p>
        ) : (
          <div className="divide-y">
            {proposals.data.map((x) => (
              <ProposalRow key={x.id} proposal={x} head={head} inBlocks={inBlocks} display={display} />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Committee" icon={<ShieldCheck className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">validators in force at the tip</span>}>
          {committee.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{s ? 'No committee.' : 'Loading…'}</p>
          ) : (
            committee.map(([address, weight]) => {
              const share = committeeWeight ? (Number(weight) / committeeWeight) * 100 : 0
              return (
                <div key={address} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <AddressLink address={display(address)} avatar />
                  </span>
                  <span className="num text-right">
                    {fmtNum(weight, 2)}
                    <span className="block text-[11px] text-muted-foreground">{share.toFixed(2)}% of the vote</span>
                  </span>
                </div>
              )
            })
          )}
        </Panel>

        <Panel title="Parameters" icon={<Settings2 className="h-4 w-4" />}>
          {s ? (
            <>
              <Row k="Voting period">
                {p.GOV_VOTING_PERIOD_BLOCKS?.toLocaleString()} blocks · {inBlocks(p.GOV_VOTING_PERIOD_BLOCKS ?? 0)}
              </Row>
              <Row k="Timelock">
                {p.GOV_TIMELOCK_BLOCKS?.toLocaleString()} blocks · {inBlocks(p.GOV_TIMELOCK_BLOCKS ?? 0)}
              </Row>
              <Row k="Execution window">
                {p.GOV_EXECUTION_WINDOW_BLOCKS?.toLocaleString()} blocks · {inBlocks(p.GOV_EXECUTION_WINDOW_BLOCKS ?? 0)}
              </Row>
              <Row k="Fork approval lead">
                {p.GOV_FORK_APPROVAL_LEAD_BLOCKS?.toLocaleString()} blocks · {inBlocks(p.GOV_FORK_APPROVAL_LEAD_BLOCKS ?? 0)}
              </Row>
              <Row k="Veto escrow">
                <span className="font-mono text-xs">{s.veto_escrow}</span>
              </Row>
              <Row k="Master controller sunset">
                block {s.master_controller.sunset_height.toLocaleString()}
                {head >= 0 && head < s.master_controller.sunset_height ? <span className="text-muted-foreground"> · in {inBlocks(s.master_controller.sunset_height - head)}</span> : null}
              </Row>
              {s.master_controller.reason && <Row k="Controller">{s.master_controller.reason}</Row>}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Fork approvals" icon={<Landmark className="h-4 w-4" />}>
          {!s ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : s.scheduled_forks.length === 0 && s.fork_approvals.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No forks scheduled in this node&apos;s chain spec, and none approved.</p>
          ) : (
            <>
              {s.scheduled_forks.map((f) => (
                <Row key={f.name} k={f.name}>
                  block {f.height.toLocaleString()} · {f.approval?.approved ? 'approved' : `approve by ${f.approval?.approve_by?.toLocaleString() ?? '—'}`}
                </Row>
              ))}
              {s.fork_approvals.map((a) => (
                <Row key={`${a.fork}:${a.definition_hash}`} k={`${a.fork} (approved)`}>
                  at block {a.approved_at.toLocaleString()}
                </Row>
              ))}
            </>
          )}
        </Panel>

        <Panel title="Bridge" icon={<ArrowLeftRight className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">bridge_getAssets</span>}>
          {bridge.loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !bridge.data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">This node does not serve bridge_*.</p>
          ) : bridge.data.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No bridged assets on this network. The chain spec&apos;s BRIDGE_ASSETS lists none.</p>
          ) : (
            bridge.data.map((a) => (
              <div key={a.address} className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
                <span>
                  <span className="font-medium">{a.symbol}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    from chain {a.chain_id} · {String(a.source_token).slice(0, 10)}… · {a.decimals} decimals
                  </span>
                </span>
                <span className="num text-right">
                  {fmtNum(a.supply, 4)}
                  <span className="block text-[11px] text-muted-foreground">supply on QRDX</span>
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>
    </div>
  )
}

function ProposalRow({ proposal: x, head, inBlocks, display }: { proposal: Proposal; head: number; inBlocks: (blocks: number) => string; display: (address: string) => string }) {
  const [open, setOpen] = useState(false)
  const total = Number(x.total_weight) || 0
  const yes = total ? (Number(x.yes) / total) * 100 : 0
  const no = total ? (Number(x.no) / total) * 100 : 0
  const threshold = x.threshold_bps / 100
  const deadline =
    x.status === 'voting' ? { label: 'voting ends', at: x.voting_ends } : x.status === 'passed' && x.timelock_ends != null ? (head < x.timelock_ends ? { label: 'timelock ends', at: x.timelock_ends } : { label: 'execute by', at: x.execute_by ?? 0 }) : null
  return (
    <div className="text-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/40">
        <span className="num mt-0.5 w-10 shrink-0 text-muted-foreground">#{x.id}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{ACTIONS[x.action] ?? x.action}</span>
            <Pill tone={STATUS_TONE[x.status] ?? 'muted'}>{x.status}</Pill>
            {deadline && head >= 0 && (
              <span className="num text-xs text-muted-foreground">
                {deadline.label} at {deadline.at.toLocaleString()}
                {deadline.at > head ? ` · in ${inBlocks(deadline.at - head)}` : ''}
              </span>
            )}
          </span>
          {x.memo && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{x.memo}</span>}
          <span className="relative mt-2 block h-2 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 left-0 bg-bid" style={{ width: `${yes}%` }} />
            <span className="absolute inset-y-0 bg-ask" style={{ left: `${yes}%`, width: `${no}%` }} />
            <span className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${threshold}%` }} title={`Passes at ${threshold.toFixed(2)}%`} />
          </span>
          <span className="num mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>
              yes {yes.toFixed(2)}% · no {no.toFixed(2)}% · {Object.keys(x.votes).length}/{Object.keys(x.weights).length} voted
            </span>
            <span>{Number(x.veto_total) > 0 ? `${fmtCompact(x.veto_total)} QRDX vetoing` : `needs ${threshold.toFixed(2)}%`}</span>
          </span>
        </span>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t bg-muted/20 px-4 py-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proposal</p>
            <Line k="Proposer">
              <AddressLink address={display(x.proposer)} />
            </Line>
            <Line k="Created">
              <BlockLink height={x.created_at} />
            </Line>
            <Line k="Voting ends">
              <BlockLink height={x.voting_ends} />
            </Line>
            {x.passed_at != null && (
              <Line k="Passed">
                <BlockLink height={x.passed_at} />
              </Line>
            )}
            {x.timelock_ends != null && (
              <Line k="Timelock ends">
                <BlockLink height={x.timelock_ends} />
              </Line>
            )}
            {x.execute_by != null && (
              <Line k="Execute by">
                <BlockLink height={x.execute_by} />
              </Line>
            )}
            {x.resolved_at != null && (
              <Line k="Resolved">
                <BlockLink height={x.resolved_at} />
              </Line>
            )}
            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parameters</p>
            <pre className="overflow-x-auto rounded-md border bg-card p-2 text-[11px]">{JSON.stringify(x.params, null, 2)}</pre>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Votes (weight snapshot at creation)</p>
            {Object.entries(x.weights).map(([a, w]) => (
              <Line key={a} k={<AddressLink address={display(a)} />}>
                <span className={cn(x.votes[a] === 'yes' ? 'text-bid' : x.votes[a] === 'no' ? 'text-ask' : 'text-muted-foreground')}>{x.votes[a] ?? 'not voted'}</span> · {fmtNum(w, 2)}
              </Line>
            ))}
            {Object.keys(x.vetoes).length > 0 && (
              <>
                <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vetoes</p>
                {Object.entries(x.vetoes).map(([a, v]) => (
                  <Line key={a} k={<AddressLink address={a} />}>
                    {fmtNum(v, 4)} QRDX
                  </Line>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Line({ k, children }: { k: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="min-w-0 truncate text-muted-foreground">{k}</span>
      <span className="num shrink-0">{children}</span>
    </div>
  )
}
