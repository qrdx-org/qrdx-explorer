'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { CalendarClock, CheckCheck, Clock, Cpu, Fingerprint, Gauge, Grid3x3, Layers, ListChecks, Settings2, Timer } from 'lucide-react'
import { useChain } from '@/components/explorer/ChainProvider'
import { CopyButton, formatPreciseTime } from '@/components/explorer/common'
import { BlockTimeChart, EpochProgress, FinalityStrip, SlotMap } from '@/components/explorer/consensus'
import { useChainStats, usePolled } from '@/components/explorer/hooks'
import { Panel, Pill, Row, Tile, fmtNum } from '@/components/explorer/ui'
import { getNodeMetrics } from '@/lib/qrdx'
import { epochMs, slotStartMs, type ChainSpec, type SlotClock } from '@/lib/qrdx/consensus'
import { formatDuration, formatMs } from '@/lib/format'

type Unit = 'ms' | 'slots' | 'epochs' | 'blocks' | 'seconds' | 'bps' | 'qrdx' | 'wei' | 'height' | 'count' | 'list' | 'text'

/** What each chain-spec parameter is, and how to read its value. */
const PARAMS: Record<string, { label: string; unit: Unit; group: 'Consensus' | 'Staking' | 'Governance' | 'Perpetuals' | 'Exchange' | 'Bridge' | 'System' }> = {
  SLOT_DURATION_MS: { label: 'Slot length', unit: 'ms', group: 'Consensus' },
  SLOTS_PER_EPOCH: { label: 'Slots an epoch', unit: 'slots', group: 'Consensus' },
  MIN_VALIDATORS: { label: 'Minimum validators', unit: 'count', group: 'Consensus' },
  UNBONDING_PERIOD_EPOCHS: { label: 'Unbonding period', unit: 'epochs', group: 'Staking' },
  ACTIVATION_DELAY_EPOCHS: { label: 'Activation delay', unit: 'epochs', group: 'Staking' },
  WITHDRAWAL_DELAY_EPOCHS: { label: 'Withdrawal delay', unit: 'epochs', group: 'Staking' },
  STAKING_REWARD_RATE_BPS: { label: 'Staking reward rate', unit: 'bps', group: 'Staking' },
  ORACLE_REPORTERS: { label: 'Oracle reporters', unit: 'list', group: 'Perpetuals' },
  PERP_VAULT_LOCKUP_SECONDS: { label: 'Vault lockup', unit: 'seconds', group: 'Perpetuals' },
  PERP_VAULT_SEEDERS: { label: 'Vault seeders', unit: 'list', group: 'Perpetuals' },
  PERP_COLLATERAL_TOKEN: { label: 'Collateral token', unit: 'text', group: 'Perpetuals' },
  PERP_QUOTE: { label: 'Quote currency', unit: 'text', group: 'Perpetuals' },
  PERP_ORACLE_VOTE_MAX_AGE: { label: 'Oracle vote max age', unit: 'seconds', group: 'Perpetuals' },
  PERP_ORACLE_STALE_SECONDS: { label: 'Oracle price goes stale after', unit: 'seconds', group: 'Perpetuals' },
  PERP_FUNDING_INTERVAL_SECONDS: { label: 'Funding interval', unit: 'seconds', group: 'Perpetuals' },
  PERP_MARKET_LISTING_FEE: { label: 'Market listing fee', unit: 'qrdx', group: 'Perpetuals' },
  BRIDGE_ASSETS: { label: 'Bridged assets', unit: 'list', group: 'Bridge' },
  EXCHANGE_MIN_GAS_PRICE_WEI: { label: 'Minimum gas price', unit: 'wei', group: 'Exchange' },
  GOV_VOTING_PERIOD_BLOCKS: { label: 'Voting period', unit: 'blocks', group: 'Governance' },
  GOV_TIMELOCK_BLOCKS: { label: 'Timelock', unit: 'blocks', group: 'Governance' },
  GOV_EXECUTION_WINDOW_BLOCKS: { label: 'Execution window', unit: 'blocks', group: 'Governance' },
  GOV_APPROVAL_THRESHOLD_BPS: { label: 'Approval threshold', unit: 'bps', group: 'Governance' },
  GOV_VETO_THRESHOLD_QRDX: { label: 'Veto threshold', unit: 'qrdx', group: 'Governance' },
  GOV_FORK_APPROVAL_LEAD_BLOCKS: { label: 'Fork approval lead', unit: 'blocks', group: 'Governance' },
  SYSTEM_WALLET_MASTER_SUNSET_HEIGHT: { label: 'Master controller sunset', unit: 'height', group: 'System' },
}
const GROUPS = ['Consensus', 'Staking', 'Governance', 'Perpetuals', 'Exchange', 'Bridge', 'System'] as const

function paramValue(unit: Unit, value: unknown, clock: SlotClock | null, blockMs: number | null): { main: string; sub?: string } {
  const n = Number(value)
  switch (unit) {
    case 'ms':
      return { main: formatMs(n) }
    case 'slots':
      return { main: `${n.toLocaleString()} slots`, sub: clock ? formatMs(n * clock.slotMs) : undefined }
    case 'epochs':
      return { main: `${n.toLocaleString()} epochs`, sub: clock ? formatDuration((n * epochMs(clock)) / 1000) : undefined }
    case 'blocks':
      return { main: `${n.toLocaleString()} blocks`, sub: blockMs ? `about ${formatDuration((n * blockMs) / 1000)}` : undefined }
    case 'seconds':
      return { main: formatDuration(n) }
    case 'bps':
      return { main: `${(n / 100).toFixed(2)}%`, sub: `${n.toLocaleString()} bps` }
    case 'qrdx':
      return { main: `${fmtNum(n, 4)} QRDX` }
    case 'wei':
      return { main: `${fmtNum(n / 1e9, 4)} Gwei`, sub: `${n.toLocaleString()} wei` }
    case 'height':
      return { main: `block ${n.toLocaleString()}` }
    case 'count':
      return { main: n.toLocaleString() }
    case 'list':
      return { main: Array.isArray(value) ? (value.length ? `${value.length} configured` : 'none') : String(value) }
    default:
      return { main: String(value) }
  }
}

export default function ConsensusPage() {
  const { spec, clock } = useChain()
  const stats = useChainStats(96)
  const metrics = usePolled(() => getNodeMetrics(), 8_000)
  const blockMs = stats.avg1000Ms ?? stats.avg100Ms ?? clock?.slotMs ?? null
  const headSlotLag = stats.currentSlot != null && stats.headBlock?.slot != null ? stats.currentSlot - stats.headBlock.slot : null
  const maxMs = stats.intervals.length ? Math.max(...stats.intervals.map((i) => i.ms)) : null

  const groups = useMemo(() => {
    if (!spec) return []
    const known = GROUPS.map((g) => ({
      group: g as string,
      rows: Object.entries(spec.params)
        .filter(([k]) => PARAMS[k]?.group === g)
        .map(([k, v]) => ({ key: k, label: PARAMS[k].label, ...paramValue(PARAMS[k].unit, v, clock, blockMs) })),
    }))
    const other = Object.entries(spec.params)
      .filter(([k]) => !PARAMS[k])
      .map(([k, v]) => ({ key: k, label: k, main: typeof v === 'object' ? JSON.stringify(v) : String(v) as string, sub: undefined as string | undefined }))
    return [...known, { group: 'Other', rows: other }].filter((g) => g.rows.length)
  }, [spec, clock, blockMs])

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consensus</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          QR-PoS: time runs in slots of {clock ? formatMs(clock.slotMs) : '—'} from genesis, {clock?.slotsPerEpoch ?? '—'} slots to an epoch. One validator, picked by stake, proposes in each slot; votes at
          each epoch boundary justify and then finalize it. Everything here is read from the node&apos;s chain spec, its blocks and its metrics.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Slot length" icon={<Timer className="h-4 w-4" />} value={clock ? formatMs(clock.slotMs) : '—'} sub={clock ? `${(1000 / clock.slotMs).toFixed(0)} slots a second` : ''} />
        <Tile label="Epoch length" icon={<Layers className="h-4 w-4" />} value={clock ? formatMs(epochMs(clock)) : '—'} sub={clock ? `${clock.slotsPerEpoch} slots` : ''} />
        <Tile label="Current slot" icon={<Clock className="h-4 w-4" />} value={stats.currentSlot?.toLocaleString() ?? '—'} sub={stats.slotInEpoch != null && clock ? `${stats.slotInEpoch + 1} of ${clock.slotsPerEpoch} in epoch ${stats.currentEpoch?.toLocaleString()}` : ''} />
        <Tile
          label="Head slot"
          icon={<Cpu className="h-4 w-4" />}
          value={stats.headBlock?.slot?.toLocaleString() ?? '—'}
          sub={headSlotLag != null ? (headSlotLag <= 1 ? 'on time' : `${headSlotLag} slots behind the clock`) : 'reading the head'}
        />
        <Tile
          label="Slots filled"
          icon={<Gauge className="h-4 w-4" />}
          value={stats.fillSinceGenesis != null ? `${(stats.fillSinceGenesis * 100).toFixed(3)}%` : '—'}
          sub={stats.missedSinceGenesis != null ? `${stats.missedSinceGenesis.toLocaleString()} missed since genesis` : ''}
        />
        <Tile
          label="Finality lag"
          icon={<CheckCheck className="h-4 w-4" />}
          value={stats.finalityLagEpochs != null ? `${stats.finalityLagEpochs} epoch${stats.finalityLagEpochs === 1 ? '' : 's'}` : '—'}
          sub={stats.finalityLagEpochs != null && clock ? formatMs(stats.finalityLagEpochs * epochMs(clock)) : ''}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Slot map" icon={<Grid3x3 className="h-4 w-4" />} bodyClassName="space-y-4 p-4">
          {clock && <EpochProgress clock={clock} />}
          <SlotMap stats={stats} epochs={3} />
        </Panel>
        <div className="space-y-6">
          <Panel title="Block times" icon={<Timer className="h-4 w-4" />} bodyClassName="p-4" right={<span className="num text-xs text-muted-foreground">{stats.intervals.length} consecutive blocks</span>}>
            <BlockTimeChart stats={stats} count={96} height={120} />
            <div className="mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-xs sm:grid-cols-6">
              <Stat k="Median" v={formatMs(stats.p50Ms)} />
              <Stat k="p95" v={formatMs(stats.p95Ms)} />
              <Stat k="Longest" v={formatMs(maxMs)} />
              <Stat k="100 blocks" v={formatMs(stats.avg100Ms, 1)} />
              <Stat k="1,000 blocks" v={formatMs(stats.avg1000Ms, 1)} />
              <Stat k="Genesis" v={formatMs(stats.avgSinceGenesisMs, 1)} />
            </div>
          </Panel>
          <Panel title="Finality" icon={<CheckCheck className="h-4 w-4" />} bodyClassName="space-y-3 p-4">
            <FinalityStrip stats={stats} />
            <div className="grid grid-cols-3 gap-3 border-t pt-3 text-xs">
              <Stat k="Finalized" v={metrics.data?.finalizedEpoch != null ? metrics.data.finalizedEpoch.toLocaleString() : '—'} />
              <Stat k="Justified" v={metrics.data?.justifiedEpoch != null ? metrics.data.justifiedEpoch.toLocaleString() : '—'} />
              <Stat k="Node's lag" v={metrics.data?.finalityLagEpochs != null ? `${metrics.data.finalityLagEpochs} epoch${metrics.data.finalityLagEpochs === 1 ? '' : 's'}` : '—'} />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Chain identity" icon={<Fingerprint className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">/chain_spec</span>}>
          {spec ? <Identity spec={spec} clock={clock} /> : <p className="py-10 text-center text-sm text-muted-foreground">This node does not serve a chain spec.</p>}
        </Panel>
        <Panel title="Upgrade schedule" icon={<CalendarClock className="h-4 w-4" />}>
          {spec ? <Forks spec={spec} blockMs={blockMs} /> : <p className="py-10 text-center text-sm text-muted-foreground">—</p>}
        </Panel>
      </div>

      <Panel title="Protocol parameters" icon={<Settings2 className="h-4 w-4" />} right={<span className="text-xs text-muted-foreground">fixed at genesis; every node on the network holds the same</span>}>
        {!spec ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Reading the chain spec…</p>
        ) : (
          <div className="grid md:grid-cols-2">
            {groups.map((g) => (
              <div key={g.group} className="border-b md:odd:border-r">
                <div className="bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</div>
                {g.rows.map((r) => (
                  <div key={r.key} className="flex items-start justify-between gap-4 border-t px-4 py-2 text-sm first:border-t-0">
                    <span>
                      {r.label}
                      <span className="block font-mono text-[10px] text-muted-foreground">{r.key}</span>
                    </span>
                    <span className="num text-right">
                      {r.main}
                      {r.sub && <span className="block text-[11px] text-muted-foreground">{r.sub}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {spec && (
        <Panel title="Protocol features" icon={<ListChecks className="h-4 w-4" />}>
          {Object.entries(spec.supported_features).map(([name, text]) => {
            const activeNow = spec.active_features.includes(name)
            const atGenesis = spec.genesis_features.includes(name)
            const scheduled = spec.forks.find((f) => f.features?.includes(name))
            return (
              <div key={name} className="flex items-start gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                <Pill tone={activeNow ? 'bid' : scheduled ? 'warn' : 'muted'} className="mt-0.5 shrink-0">
                  {activeNow ? (atGenesis ? 'active from genesis' : 'active') : scheduled ? `fork ${scheduled.name}` : 'not scheduled'}
                </Pill>
                <span>
                  <span className="font-mono text-xs font-medium">{name}</span>
                  <span className="mt-0.5 block text-muted-foreground">{text}</span>
                </span>
              </div>
            )
          })}
        </Panel>
      )}
    </div>
  )
}

function Identity({ spec, clock }: { spec: ChainSpec; clock: SlotClock | null }) {
  return (
    <>
      <Row k="Network">
        {spec.network} {spec.dev && <Pill tone="warn">dev</Pill>}
      </Row>
      <Row k="Chain ID">
        {spec.chain_id} <span className="text-muted-foreground">(0x{spec.chain_id.toString(16)})</span>
      </Row>
      <Row k="Genesis">{clock ? formatPreciseTime(clock.genesisMs / 1000) : '—'}</Row>
      <Row k="Genesis block" wrap>
        <Copyable value={spec.genesis_block_hash} href="/block/0" />
      </Row>
      <Row k="Spec hash" wrap>
        <Copyable value={spec.spec_hash} />
      </Row>
      <Row k="Spec format">{spec.spec_format}</Row>
      <Row k="Fork ID">
        <span className="font-mono text-xs">{spec.fork_id.hash}</span>
        <span className="text-muted-foreground"> · next {spec.fork_id.next ? `at ${spec.fork_id.next.toLocaleString()}` : 'none'}</span>
      </Row>
      <Row k="Node version">
        {spec.node_version}
        {spec.build ? <span className="text-muted-foreground"> · build {spec.build.version}</span> : null}
      </Row>
      {clock && (
        <Row k="Epoch 0 ends">{formatPreciseTime(slotStartMs(clock, clock.slotsPerEpoch) / 1000)}</Row>
      )}
    </>
  )
}

function Forks({ spec, blockMs }: { spec: ChainSpec; blockMs: number | null }) {
  if (!spec.forks.length)
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No forks scheduled. Active: {spec.active_features.length ? spec.active_features.join(', ') : 'genesis rules only'}.
        <span className="mt-1 block text-xs">A fork activates at its height only if governance approved it in time (approve_fork).</span>
      </div>
    )
  return (
    <div className="divide-y">
      {spec.forks.map((f) => (
        <div key={f.name} className="px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{f.name}</span>
            <Pill tone={f.status?.startsWith('active') ? 'bid' : f.status?.includes('approved') ? 'primary' : 'warn'}>{f.status ?? 'scheduled'}</Pill>
            <span className="num ml-auto text-muted-foreground">
              block {f.height.toLocaleString()}
              {f.blocks_until ? ` · in ${f.blocks_until.toLocaleString()} blocks${blockMs ? ` (about ${formatDuration((f.blocks_until * blockMs) / 1000)})` : ''}` : ''}
            </span>
          </div>
          {f.features?.length ? <p className="mt-1 text-xs text-muted-foreground">Features: {f.features.join(', ')}</p> : null}
          {f.approval && (
            <p className="mt-1 text-xs text-muted-foreground">
              {f.approval.approved ? 'Approved on chain' : `Needs approval by block ${f.approval.approve_by.toLocaleString()}`}
              {f.approval.definition_hash ? ` · definition ${String(f.approval.definition_hash).slice(0, 16)}…` : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function Copyable({ value, href }: { value: string; href?: string }) {
  return (
    <span className="inline-flex items-start gap-1">
      {href ? (
        <Link href={href} className="break-all text-left font-mono text-xs text-primary hover:underline">
          {value}
        </Link>
      ) : (
        <span className="break-all text-left font-mono text-xs">{value}</span>
      )}
      <CopyButton value={value} />
    </span>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{k}</div>
      <div className="num mt-0.5 font-medium">{v}</div>
    </div>
  )
}
