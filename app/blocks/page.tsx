'use client'

import { useMemo, useState } from 'react'
import { Blocks, ChevronLeft, ChevronRight, ChevronsLeft, Clock, Database, Gauge, Layers, Pause, Play, Timer } from 'lucide-react'
import SearchBar from '@/components/explorer/SearchBar'
import { useChain } from '@/components/explorer/ChainProvider'
import { BlockTimeChart, EpochProgress } from '@/components/explorer/consensus'
import { useChainStats, useHeaders, useLiveBlocks } from '@/components/explorer/hooks'
import { BlocksTable } from '@/components/explorer/live-blocks'
import { Panel, Tile } from '@/components/explorer/ui'
import type { LiveBlock } from '@/lib/qrdx/live'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

export default function BlocksPage() {
  const { clock } = useChain()
  const stats = useChainStats(64)
  const [page, setPage] = useState(1)
  const [paused, setPaused] = useState(false)
  // Freeze the tip used for paging so pages don't shift while browsing history.
  const [anchor, setAnchor] = useState(-1)
  const live = useLiveBlocks(PAGE_SIZE + 1, { paused: paused || page !== 1 })

  const tip = stats.head
  const totalPages = tip >= 0 ? Math.ceil((tip + 1) / PAGE_SIZE) : 1
  const top = page === 1 ? -1 : anchor - (page - 1) * PAGE_SIZE
  // The page plus the block below it, so its oldest row has a parent to time against.
  const heights = useMemo(() => (top < 0 ? [] : Array.from({ length: PAGE_SIZE + 1 }, (_, i) => top - i).filter((h) => h >= 0)), [top])
  const history = useHeaders(heights, 1)
  const historyRows = useMemo<LiveBlock[]>(
    () => heights.map((h) => ({ height: h, hash: history.get(h)?.hash ?? null, observedAt: null, block: history.get(h) ?? null })),
    [heights, history],
  )

  const rows = page === 1 ? live.blocks : historyRows
  const shown = rows.slice(0, PAGE_SIZE)
  const read = shown.filter((r) => r.block).length

  const goTo = (next: number) => {
    if (page === 1 && next !== 1) setAnchor(tip)
    setPage(Math.min(Math.max(1, next), totalPages))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blocks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every block on the chain, newest first{clock ? `: one slot every ${formatMs(clock.slotMs)}, ${clock.slotsPerEpoch} slots an epoch` : ''}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Latest block" icon={<Blocks className="h-4 w-4" />} value={tip >= 0 ? `#${tip.toLocaleString()}` : '—'} sub={tip >= 0 ? `${(tip + 1).toLocaleString()} blocks with genesis` : ''} />
        <Tile label="Current slot" icon={<Clock className="h-4 w-4" />} value={stats.currentSlot != null ? stats.currentSlot.toLocaleString() : '—'} sub={stats.currentEpoch != null ? `epoch ${stats.currentEpoch.toLocaleString()}` : ''} />
        <Tile label="Block time" icon={<Timer className="h-4 w-4" />} value={formatMs(stats.avg100Ms ?? stats.avgSinceGenesisMs, 1)} sub={stats.avg100Ms != null ? 'mean, last 100 blocks' : 'mean since genesis'} />
        <Tile label="Median / p95" icon={<Gauge className="h-4 w-4" />} value={stats.p50Ms != null ? `${formatMs(stats.p50Ms)}` : '—'} sub={stats.p95Ms != null ? `p95 ${formatMs(stats.p95Ms)} · ${stats.intervals.length} blocks` : 'from consecutive headers'} />
        <Tile
          label="Missed slots"
          icon={<Database className="h-4 w-4" />}
          value={stats.missedSinceGenesis != null ? stats.missedSinceGenesis.toLocaleString() : '—'}
          sub={stats.fillSinceGenesis != null ? `${(stats.fillSinceGenesis * 100).toFixed(2)}% of slots filled` : 'since genesis'}
        />
        <Tile
          label="Finalized epoch"
          icon={<Layers className="h-4 w-4" />}
          value={stats.finalizedEpoch != null ? stats.finalizedEpoch.toLocaleString() : '—'}
          sub={stats.finalityLagEpochs != null ? `${stats.finalityLagEpochs} behind the clock` : ''}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Block times" icon={<Timer className="h-4 w-4" />} bodyClassName="p-4" right={<span className="text-xs text-muted-foreground">slots × slot length, per block</span>}>
          <BlockTimeChart stats={stats} count={64} height={110} />
        </Panel>
        <Panel title="Epoch" icon={<Layers className="h-4 w-4" />} bodyClassName="space-y-3 p-4">
          {clock ? <EpochProgress clock={clock} /> : <p className="text-sm text-muted-foreground">Reading the chain spec…</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">
            A block takes its slot&apos;s time, so the gap between two blocks is a whole number of slots. A gap of more than one slot means a proposer missed its slot; the next proposer in line
            fills the one after.
          </p>
        </Panel>
      </div>

      <SearchBar placeholder="Search by block number or block hash" size="md" />

      <Panel
        title={page === 1 ? (paused ? 'Latest blocks (paused)' : 'Latest blocks') : `Blocks #${Math.max(0, top - PAGE_SIZE + 1).toLocaleString()} – #${top.toLocaleString()}`}
        icon={<Blocks className="h-4 w-4" />}
        right={
          <>
            {page === 1 && (
              <button
                onClick={() => setPaused((p) => !p)}
                className={cn('flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors hover:bg-accent', paused ? 'border-warn/40 text-warn' : 'text-muted-foreground')}
                title={paused ? 'Resume the live list' : 'Hold the list still: four blocks arrive every second'}
              >
                {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {paused ? 'Resume' : 'Pause'}
              </button>
            )}
            <span className="num text-xs text-muted-foreground">
              {read}/{shown.length} headers read
            </span>
          </>
        }
      >
        {shown.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Waiting for blocks…</p> : <BlocksTable rows={rows} limit={PAGE_SIZE} live={page === 1 && !paused} />}
      </Panel>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <PageButton onClick={() => goTo(1)} disabled={page === 1}>
            <ChevronsLeft className="h-4 w-4" /> Latest
          </PageButton>
          <PageButton onClick={() => goTo(page - 1)} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" /> Newer
          </PageButton>
        </div>
        <span className="num text-sm text-muted-foreground">
          Page {page.toLocaleString()} of {totalPages.toLocaleString()}
        </span>
        <PageButton onClick={() => goTo(page + 1)} disabled={page >= totalPages}>
          Older <ChevronRight className="h-4 w-4" />
        </PageButton>
      </div>
    </div>
  )
}

function PageButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 items-center gap-1 rounded-md border bg-card px-3 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
