'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, Hourglass, Layers } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  TxKindBadge,
  TxLink,
} from '@/components/explorer/common'
import SearchBar from '@/components/explorer/SearchBar'
import { getBlockRange, getMempool, type ExplorerBlock, type ExplorerTransaction, type MempoolSnapshot } from '@/lib/qrdx'
import { formatQrdx } from '@/lib/format'

const BLOCK_WINDOW = 50
const KINDS: Array<ExplorerTransaction['kind'] | 'all'> = ['all', 'evm', 'native', 'exchange', 'coinbase', 'genesis']

function TxTable({ transactions }: { transactions: ExplorerTransaction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50 text-sm">
            <th className="text-left p-4 font-medium text-muted-foreground">Transaction</th>
            <th className="text-left p-4 font-medium text-muted-foreground hidden lg:table-cell">Method</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Block</th>
            <th className="text-left p-4 font-medium text-muted-foreground hidden md:table-cell">From → To</th>
            <th className="text-right p-4 font-medium text-muted-foreground">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {transactions.map((tx) => (
            <tr key={`${tx.kind}-${tx.hash}`} className="hover:bg-muted/50 transition-colors">
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <TxKindBadge kind={tx.kind} />
                  <TxLink hash={tx.hash} />
                </div>
              </td>
              <td className="p-4 text-sm hidden lg:table-cell">{tx.method}</td>
              <td className="p-4 text-sm whitespace-nowrap">
                <BlockLink height={tx.blockHeight} />
                <div className="text-xs text-muted-foreground">
                  <TimeAgo timestamp={tx.timestamp} />
                </div>
              </td>
              <td className="p-4 hidden md:table-cell">
                <div className="flex items-center gap-1 text-sm">
                  <AddressLink address={tx.from} />
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <AddressLink address={tx.to} />
                </div>
              </td>
              <td className="p-4 text-right text-sm font-medium whitespace-nowrap">{formatQrdx(tx.value, 6)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TransactionsPage() {
  const { height } = useChain()
  const [page, setPage] = useState(1)
  const [anchor, setAnchor] = useState(-1)
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all')
  const live = useLiveBlocks(BLOCK_WINDOW, { paused: page !== 1 })
  const [history, setHistory] = useState<ExplorerBlock[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [mempool, setMempool] = useState<MempoolSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => getMempool().then((m) => !cancelled && setMempool(m)).catch(() => undefined)
    refresh()
    const id = setInterval(refresh, 8000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (page === 1 || anchor < 0) return
    let cancelled = false
    const top = anchor - (page - 1) * BLOCK_WINDOW
    setHistoryLoading(true)
    setHistoryError(null)
    getBlockRange(top - BLOCK_WINDOW + 1, top)
      .then((b) => !cancelled && setHistory(b))
      .catch((err) => !cancelled && setHistoryError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setHistoryLoading(false))
    return () => {
      cancelled = true
    }
  }, [page, anchor])

  const blocks = page === 1 ? live.blocks : history
  const loading = page === 1 ? live.loading && live.blocks.length === 0 : historyLoading
  const error = page === 1 ? live.error : historyError
  const tip = height >= 0 ? height : live.blocks[0]?.height ?? -1
  const totalPages = tip >= 0 ? Math.ceil((tip + 1) / BLOCK_WINDOW) : 1

  const transactions = useMemo(() => {
    const all = blocks.flatMap((b) => [...b.transactions].reverse())
    return kind === 'all' ? all : all.filter((t) => t.kind === kind)
  }, [blocks, kind])

  const range = blocks.length ? { from: blocks[blocks.length - 1].height, to: blocks[0].height } : null
  const sectionsMissing = blocks.some((b) => !b.sectionsLoaded)

  const goTo = (next: number) => {
    if (page === 1 && next !== 1) setAnchor(tip)
    setPage(Math.min(Math.max(1, next), totalPages))
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <NetworkModeBadge />
        </div>
        <p className="text-muted-foreground mb-6">EVM, native UTXO and exchange transactions included on chain</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="In Current Range" icon={Activity} value={transactions.length.toLocaleString()} hint={range ? `Blocks #${range.from.toLocaleString()}–#${range.to.toLocaleString()}` : undefined} />
          <StatCard label="Pending (Mempool)" icon={Hourglass} value={mempool?.pendingCount ?? '—'} hint={mempool?.error ? 'Count from node metrics' : 'Native mempool'} />
          <StatCard label="Blocks Scanned" icon={Layers} value={blocks.length} hint={sectionsMissing ? 'Some EVM sections unavailable (query budget)' : undefined} />
        </div>

        <SearchBar placeholder="Search by transaction hash" size="md" />
      </div>

      {mempool && mempool.transactions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Pending Transactions</CardTitle>
            <CardDescription>Waiting in the node&apos;s mempool for inclusion</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <TxTable transactions={mempool.transactions} />
          </CardContent>
        </Card>
      )}

      {error && blocks.length === 0 && (
        <div className="mb-6">
          <ErrorState title="Error loading transactions" error={error} onRetry={live.reload} />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>{page === 1 ? 'Latest Transactions' : 'Transactions'}</CardTitle>
              <CardDescription>
                {range ? `Blocks #${range.from.toLocaleString()} to #${range.to.toLocaleString()}` : 'Loading range…'}
                {page === 1 && ' · auto-updating'}
              </CardDescription>
            </div>
            <div className="flex gap-1 flex-wrap">
              {KINDS.map((k) => (
                <Button key={k} size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)} className="capitalize">
                  {k === 'evm' ? 'EVM' : k}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState label="Loading transactions…" />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No transactions in this range"
              description={range ? `None of blocks #${range.from.toLocaleString()}–#${range.to.toLocaleString()} contain ${kind === 'all' ? '' : `${kind} `}transactions. Try older blocks.` : undefined}
            />
          ) : (
            <TxTable transactions={transactions} />
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
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" onClick={() => goTo(page + 1)} disabled={page >= totalPages} className="gap-1">
          Older <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
