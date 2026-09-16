'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight, Blocks as BlocksIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, Layers, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useChain } from '@/components/explorer/ChainProvider'
import { useAsync } from '@/components/explorer/hooks'
import {
  AddressLink,
  CopyButton,
  DetailRow,
  EmptyState,
  ErrorState,
  LoadingState,
  NetworkModeBadge,
  StatCard,
  TimeAgo,
  TxKindBadge,
  TxLink,
} from '@/components/explorer/common'
import { blockTxCount, getBlock } from '@/lib/qrdx'
import { formatDateTime, formatQrdx } from '@/lib/format'

interface PageProps {
  params: Promise<{ number: string }>
}

function Mono({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-start gap-1 max-w-full">
      <span className="font-mono break-all">{value}</span>
      <CopyButton value={value} />
    </span>
  )
}

export default function BlockPage({ params }: PageProps) {
  const { number } = use(params)
  const router = useRouter()
  const { height: tip, finalizedEpoch } = useChain()
  const { data: block, loading, error, reload } = useAsync(() => getBlock(number), [number])
  const [waitingForBlock, setWaitingForBlock] = useState(false)

  // A future height: wait for the chain to reach it instead of erroring.
  const requestedHeight = /^\d+$/.test(number) ? Number(number) : null
  useEffect(() => {
    if (!loading && !block && requestedHeight != null && tip >= 0 && requestedHeight > tip) {
      setWaitingForBlock(true)
    } else if (waitingForBlock && requestedHeight != null && tip >= requestedHeight) {
      setWaitingForBlock(false)
      reload()
    }
  }, [loading, block, requestedHeight, tip, waitingForBlock, reload])

  if (loading && !block) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState label="Loading block…" />
      </div>
    )
  }

  if (waitingForBlock && requestedHeight != null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Clock className="h-10 w-10 text-primary mx-auto mb-3 animate-pulse" />
            <h2 className="text-xl font-semibold mb-1">Block #{requestedHeight.toLocaleString()} has not been produced yet</h2>
            <p className="text-muted-foreground">
              Current height is #{tip.toLocaleString()} — this page will update automatically when the block arrives.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !block) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState title="Block not found" error={error ?? `No block matches "${number}".`} onRetry={reload} />
      </div>
    )
  }

  const header = block.header
  const finalized = block.height === 0 || (finalizedEpoch != null && block.epoch != null && block.epoch <= finalizedEpoch)
  const txCount = blockTxCount(block)
  const confirmations = tip >= block.height ? tip - block.height : null

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Link href="/blocks" className="text-muted-foreground hover:text-primary transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-3xl font-bold">Block #{block.height.toLocaleString()}</h1>
          {block.height === 0 ? (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 border border-gray-500/30">Genesis</span>
          ) : finalized ? (
            <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30">Finalized</span>
          ) : finalizedEpoch == null ? (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-muted-foreground border border-gray-500/30">Checking finality…</span>
          ) : (
            <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">Unfinalized</span>
          )}
          <NetworkModeBadge />
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="font-mono break-all">{block.hash}</span>
          <CopyButton value={block.hash} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" disabled={block.height <= 0} onClick={() => router.push(`/block/${block.height - 1}`)}>
          <ChevronLeft className="h-4 w-4 mr-2" /> Previous
        </Button>
        <Button variant="outline" disabled={tip >= 0 && block.height >= tip} onClick={() => router.push(`/block/${block.height + 1}`)}>
          Next <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Transactions" icon={Activity} value={block.sectionsLoaded ? txCount : `${txCount}+`} hint={block.sectionsLoaded ? undefined : 'EVM/exchange sections unavailable'} />
        <StatCard label="Slot / Epoch" icon={Layers} value={block.slot != null ? `${block.slot} / ${block.epoch}` : '—'} />
        <StatCard label="Attestations" icon={ShieldCheck} value={block.attestationCount} />
        <StatCard label="Confirmations" icon={CheckCircle2} value={confirmations != null ? confirmations.toLocaleString() : '—'} />
      </div>

      <Tabs defaultValue={txCount > 0 ? 'transactions' : 'overview'} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ({block.transactions.length})</TabsTrigger>
          {header.kind === 'pos' && <TabsTrigger value="attestations">Attestations ({header.attestations.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-2">
              <DetailRow label="Block Height">{block.height.toLocaleString()}</DetailRow>
              <DetailRow label="Timestamp">
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(block.timestamp)} (<TimeAgo timestamp={block.timestamp} />)
                </span>
              </DetailRow>
              <DetailRow label="Block Hash"><Mono value={block.hash} /></DetailRow>
              <DetailRow label="Parent Hash">
                {block.parentHash && block.height > 0 ? (
                  <span className="inline-flex items-start gap-1">
                    <Link href={`/block/${block.parentHash}`} className="font-mono break-all text-primary hover:underline">
                      {block.parentHash}
                    </Link>
                    <CopyButton value={block.parentHash} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </DetailRow>

              {header.kind === 'pos' && (
                <>
                  <DetailRow label="Proposer"><AddressLink address={header.proposer} full avatar copy /></DetailRow>
                  <DetailRow label="Slot">{header.slot.toLocaleString()}</DetailRow>
                  <DetailRow label="Epoch">
                    {header.epoch.toLocaleString()}
                    {finalizedEpoch != null && <span className="text-muted-foreground"> (finalized through {finalizedEpoch})</span>}
                  </DetailRow>
                  <DetailRow label="State Root"><Mono value={header.stateRoot} /></DetailRow>
                  <DetailRow label="Transactions Root"><Mono value={header.transactionsRoot} /></DetailRow>
                  <DetailRow label="RANDAO Reveal"><Mono value={header.randaoReveal} /></DetailRow>
                  <DetailRow label="Proposer Signature">
                    ML-DSA-65 (Dilithium) · {header.proposerSignatureBytes.toLocaleString()} bytes · public key {header.proposerPublicKeyBytes.toLocaleString()} bytes
                  </DetailRow>
                  <DetailRow label="Slashing Evidence">{header.slashingEvidenceCount}</DetailRow>
                  {header.graffiti && <DetailRow label="Graffiti">{header.graffiti}</DetailRow>}
                </>
              )}

              {header.kind === 'genesis' && (
                <>
                  <DetailRow label="Network">{header.networkName} (chain ID {header.chainId})</DetailRow>
                  <DetailRow label="Genesis Time">{formatDateTime(header.genesisTime)}</DetailRow>
                  <DetailRow label="State Root"><Mono value={header.stateRoot} /></DetailRow>
                  <DetailRow label="RANDAO Seed"><Mono value={header.randaoSeed} /></DetailRow>
                  <DetailRow label="Allocations">
                    {header.prefundedAccounts} prefunded accounts · {header.systemWallets} system wallets · {header.validators} validators
                  </DetailRow>
                  {header.systemWalletController && (
                    <DetailRow label="System Wallet Controller"><AddressLink address={header.systemWalletController} full copy /></DetailRow>
                  )}
                </>
              )}

              {header.kind === 'pow' && (
                <>
                  <DetailRow label="Miner"><AddressLink address={header.miner} full copy /></DetailRow>
                  <DetailRow label="Merkle Root"><Mono value={header.merkleRoot} /></DetailRow>
                  <DetailRow label="Difficulty">{header.difficulty}</DetailRow>
                  <DetailRow label="Nonce">{header.nonce}</DetailRow>
                </>
              )}

              {header.kind === 'unknown' && block.proposer && (
                <DetailRow label="Proposer"><AddressLink address={block.proposer} full copy /></DetailRow>
              )}

              <DetailRow label="Transaction Sections">
                {block.nativeTxCount} native
                {block.evmTxCount != null ? ` · ${block.evmTxCount} EVM` : ' · EVM unavailable'}
                {block.exchangeTxCount != null ? ` · ${block.exchangeTxCount} exchange` : ''}
              </DetailRow>
              <DetailRow label="Header Size">{Math.round(block.contentBytes).toLocaleString()} bytes (stored)</DetailRow>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>
                {block.sectionsLoaded
                  ? `${block.transactions.length} transaction${block.transactions.length === 1 ? '' : 's'} in this block`
                  : 'Native transactions only — the node declined the block-section query (per-IP query budget). Try again later.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {block.transactions.length === 0 ? (
                <EmptyState title="No transactions" description="This block contains no transactions." />
              ) : (
                <div className="divide-y">
                  {block.transactions.map((tx) => (
                    <div key={`${tx.kind}-${tx.hash}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <TxKindBadge kind={tx.kind} />
                          <TxLink hash={tx.hash} />
                          <span className="text-xs text-muted-foreground hidden sm:inline">{tx.method}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 flex-wrap">
                          <AddressLink address={tx.from} />
                          <ArrowRight className="h-3 w-3" />
                          <AddressLink address={tx.to} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-medium">{formatQrdx(tx.value, 6)}</div>
                        {tx.fee && tx.fee !== '0' && <div className="text-xs text-muted-foreground">Fee ≤ {formatQrdx(tx.fee, 8)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {header.kind === 'pos' && (
          <TabsContent value="attestations">
            <Card>
              <CardHeader>
                <CardTitle>Included Attestations</CardTitle>
                <CardDescription>Validator votes carried in this block&apos;s body</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {header.attestations.length === 0 ? (
                  <EmptyState title="No attestations" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">Validator</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Slot</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Epoch</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Source → Target</th>
                          <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Attested Block</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {header.attestations.map((att, i) => (
                          <tr key={`${att.validatorAddress}-${att.slot}-${i}`}>
                            <td className="p-3"><AddressLink address={att.validatorAddress} avatar /></td>
                            <td className="p-3 text-right font-mono">{att.slot}</td>
                            <td className="p-3 text-right font-mono">{att.epoch}</td>
                            <td className="p-3 text-right font-mono">{att.sourceEpoch} → {att.targetEpoch}</td>
                            <td className="p-3 hidden md:table-cell">
                              <Link href={`/block/${att.blockHash}`} className="font-mono text-primary hover:underline">
                                {att.blockHash.slice(0, 16)}…
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <div className="mt-6 text-xs text-muted-foreground flex items-center gap-2">
        <BlocksIcon className="h-3 w-3" /> Data served by the connected node&apos;s REST API (<code>/get_block</code>, <code>/get_blocks</code>).
      </div>
    </div>
  )
}
