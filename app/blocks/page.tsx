'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Blocks, ChevronLeft, ChevronRight, ChevronsLeft, Clock, Database, Layers } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SearchBar from '@/components/explorer/SearchBar'
import { useChain } from '@/components/explorer/ChainProvider'
import { useLiveBlocks } from '@/components/explorer/hooks'
import {
  AddressLink,
  BlockLink,
  EmptyState,
  ErrorState,
  LoadingState,
  NetworkModeBadge,
  StatCard,
  TimeAgo,
} from '@/components/explorer/common'
import { blockTxCount, getBlockRange, type ExplorerBlock } from '@/lib/qrdx'
import { formatHash } from '@/lib/format'

const PAGE_SIZE = 20

export default function BlocksPage() {
  const { height, finalizedEpoch } = useChain()
  const [page, setPage] = useState(1)
  const live = useLiveBlocks(PAGE_SIZE, { paused: page !== 1 })
  const [pageBlocks, setPageBlocks] = useState<ExplorerBlock[]>([])
  const [pageLoading, setPageLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  // Freeze the tip used for paging so pages don't shift while browsing history.
  const [anchor, setAnchor] = useState(-1)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    if (page === 1 || anchor < 0) return
    let cancelled = false
    const top = anchor - (page - 1) * PAGE_SIZE
    setPageLoading(true)
    setPageError(null)
    getBlockRange(top - PAGE_SIZE + 1, top)
      .then((blocks) => !cancelled && setPageBlocks(blocks))
      .catch((err) => !cancelled && setPageError(err instanceof Error ? err.message : 'Failed to load blocks'))
      .finally(() => !cancelled && setPageLoading(false))
    return () => {
      cancelled = true
    }
  }, [page, anchor, reloadNonce])

  const blocks = page === 1 ? live.blocks : pageBlocks
  const loading = page === 1 ? live.loading && live.blocks.length === 0 : pageLoading
  const error = page === 1 ? live.error : pageError
  const tip = height >= 0 ? height : live.blocks[0]?.height ?? -1
  const totalPages = tip >= 0 ? Math.ceil((tip + 1) / PAGE_SIZE) : 1

  const goTo = (next: number) => {
    if (page === 1 && next !== 1) setAnchor(tip)
    setPage(Math.min(Math.max(1, next), totalPages))
  }

  const avgBlockTime = useMemo(() => {
    const timed = live.blocks.filter((b) => b.timestamp != null && b.height > 0)
    if (timed.length < 2) return null
    const a = timed[0]
    const b = timed[timed.length - 1]
    return (a.timestamp! - b.timestamp!) / Math.max(1, a.height - b.height)
  }, [live.blocks])

  const sectionsMissing = blocks.some((b) => !b.sectionsLoaded)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">Blocks</h1>
          <NetworkModeBadge />
        </div>
        <p className="text-muted-foreground mb-6">Every block proposed on the QRDX chain, newest first</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Latest Block" icon={Blocks} value={tip >= 0 ? tip.toLocaleString() : '—'} />
          <StatCard label="Avg Block Time" icon={Clock} value={avgBlockTime != null ? `${avgBlockTime.toFixed(2)}s` : '—'} />
          <StatCard label="Current Epoch" icon={Layers} value={live.blocks.find((b) => b.epoch != null)?.epoch ?? '—'} hint={finalizedEpoch != null ? `Finalized through epoch ${finalizedEpoch}` : undefined} />
          <StatCard label="Total Blocks" icon={Database} value={tip >= 0 ? (tip + 1).toLocaleString() : '—'} hint="Including genesis" />
        </div>

        <SearchBar placeholder="Search by block number or block hash" size="md" />
      </div>

      {error && blocks.length === 0 && (
        <div className="mb-6">
          <ErrorState title="Error loading blocks" error={error} onRetry={page === 1 ? live.reload : () => setReloadNonce((n) => n + 1)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {page === 1 ? 'Latest Blocks' : 'Blocks'}
            {page === 1 && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">auto-updating</span>}
          </CardTitle>
          <CardDescription>
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
            {sectionsMissing && ' · EVM/exchange counts unavailable for some blocks (node query budget reached)'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState label="Loading blocks…" />
          ) : blocks.length === 0 ? (
            <EmptyState title="No blocks found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50 text-sm">
                    <th className="text-left p-4 font-medium text-muted-foreground">Block</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Age</th>
                    <th className="text-left p-4 font-medium text-muted-foreground hidden lg:table-cell">Slot / Epoch</th>
                    <th className="text-left p-4 font-medium text-muted-foreground hidden md:table-cell">Proposer</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Txns</th>
                    <th className="text-right p-4 font-medium text-muted-foreground hidden xl:table-cell">Attestations</th>
                    <th className="text-right p-4 font-medium text-muted-foreground hidden sm:table-cell">Finality</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {blocks.map((block) => {
                    const finalized = finalizedEpoch != null && block.epoch != null && block.epoch <= finalizedEpoch
                    return (
                      <tr key={block.hash} className="hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                          <BlockLink height={block.height} className="font-bold" />
                          <div className="text-xs text-muted-foreground font-mono hidden sm:block">{formatHash(block.hash, 8, 6)}</div>
                        </td>
                        <td className="p-4 text-sm whitespace-nowrap">
                          <TimeAgo timestamp={block.timestamp} />
                        </td>
                        <td className="p-4 text-sm font-mono hidden lg:table-cell">
                          {block.slot != null ? `${block.slot} / ${block.epoch}` : '—'}
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          {block.proposer ? <AddressLink address={block.proposer} avatar /> : <span className="text-sm text-muted-foreground">Genesis</span>}
                        </td>
                        <td className="p-4 text-right">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Activity className="h-3 w-3 text-muted-foreground" />
                            {blockTxCount(block)}
                            {!block.sectionsLoaded && <span className="text-muted-foreground" title="EVM/exchange sections not loaded">+</span>}
                          </span>
                        </td>
                        <td className="p-4 text-right hidden xl:table-cell font-mono text-sm">{block.attestationCount}</td>
                        <td className="p-4 text-right hidden sm:table-cell">
                          {block.height === 0 ? (
                            <span className="text-xs text-muted-foreground">Genesis</span>
                          ) : finalized ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">Finalized</span>
                          ) : finalizedEpoch == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">Unfinalized</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-6 gap-2">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => goTo(1)} disabled={page === 1} className="gap-1">
            <ChevronsLeft className="h-4 w-4" /> Latest
          </Button>
          <Button variant="outline" onClick={() => goTo(page - 1)} disabled={page === 1} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Newer
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          Page {page.toLocaleString()} of {totalPages.toLocaleString()}
        </span>
        <Button variant="outline" onClick={() => goTo(page + 1)} disabled={page >= totalPages} className="gap-1">
          Older <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
