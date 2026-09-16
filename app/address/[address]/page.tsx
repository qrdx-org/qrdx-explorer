'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Blocks, Coins, FileCode2, Hash, ShieldCheck, Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AddressAvatar from '@/components/AddressAvatar'
import ShareAddressDialog from '@/components/ShareAddressDialog'
import { useChain } from '@/components/explorer/ChainProvider'
import {
  AddressLink,
  BlockLink,
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
import {
  detectAddressFormat,
  getAddress,
  getAddressActivity,
  getAddressTokens,
  getAttestations,
  getBlock,
  transactionInvolves,
  type AddressActivity,
  type AddressSummary,
  type AddressToken,
  type AttestationRecord,
} from '@/lib/qrdx'
import { formatAmount, formatQrdx, formatUSD } from '@/lib/format'
import { getKnownAddress } from '@/lib/known-addresses'
import { getTokenPrice } from '@/lib/pricing-api'

interface PageProps {
  params: Promise<{ address: string }>
}

const FORMAT_LABELS = {
  pq: { label: 'Post-Quantum (ML-DSA)', className: 'bg-primary/15 text-primary border-primary/30' },
  evm: { label: 'EVM Account', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  legacy: { label: 'Legacy UTXO', className: 'bg-gray-500/15 text-gray-600 dark:text-gray-300 border-gray-500/30' },
} as const

const SCAN_STEPS = [300, 1000, 3000]

export default function AddressPage({ params }: PageProps) {
  const { address: rawAddress } = use(params)
  const address = decodeURIComponent(rawAddress)
  const { subscribeBlocks } = useChain()
  const known = getKnownAddress(address)
  const format = detectAddressFormat(address)

  const [summary, setSummary] = useState<AddressSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [activity, setActivity] = useState<AddressActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [scanStep, setScanStep] = useState(0)
  const [tokens, setTokens] = useState<AddressToken[] | null>(null)
  const [attestations, setAttestations] = useState<AttestationRecord[] | null>(null)
  const [usdPrice, setUsdPrice] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getAddress(address))
      setSummaryError(null)
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to load address')
    }
  }, [address])

  useEffect(() => {
    setSummary(null)
    void loadSummary()
    getTokenPrice('QRDX').then((p) => setUsdPrice(p?.price_usd ?? null)).catch(() => undefined)
    getAddressTokens(address).then(setTokens).catch(() => setTokens([]))
  }, [address, loadSummary, nonce])

  useEffect(() => {
    if (!summary) return
    let cancelled = false
    setActivityLoading(true)
    getAddressActivity(address, { maxBlocks: SCAN_STEPS[scanStep], spendableOutputs: summary.spendableOutputs })
      .then((result) => !cancelled && setActivity(result))
      .catch(() => !cancelled && setActivity({ transactions: [], proposedBlocks: [], scanned: null, scanLimited: true }))
      .finally(() => !cancelled && setActivityLoading(false))
    return () => {
      cancelled = true
    }
    // Only rescan when the scan depth or the address changes, not on every balance refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, scanStep, summary !== null])

  useEffect(() => {
    if (!summary?.validator) return
    getAttestations({ validatorAddress: address, limit: 50 }).then(setAttestations).catch(() => setAttestations([]))
  }, [address, summary?.validator])

  // Live: inspect each new block for activity touching this address.
  useEffect(() => {
    return subscribeBlocks(async (event) => {
      const block = await getBlock(event.height).catch(() => null)
      if (!block) return
      const touching = block.transactions.filter((tx) => transactionInvolves(tx, address))
      const proposed = block.proposer?.toLowerCase() === address.toLowerCase()
      if (!touching.length && !proposed) return
      setActivity((prev) => {
        if (!prev) return prev
        const seen = new Set(prev.transactions.map((t) => t.hash))
        return {
          ...prev,
          transactions: [...touching.filter((t) => !seen.has(t.hash)), ...prev.transactions],
          proposedBlocks: proposed && !prev.proposedBlocks.some((b) => b.height === block.height)
            ? [block, ...prev.proposedBlocks]
            : prev.proposedBlocks,
          scanned: prev.scanned ? { ...prev.scanned, to: Math.max(prev.scanned.to, block.height) } : prev.scanned,
        }
      })
      void loadSummary()
    })
  }, [address, subscribeBlocks, loadSummary])

  if (!format) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          title="Invalid address"
          error={`"${address}" is not a QRDX address. Supported formats: 0xPQ… (post-quantum), 0x… (EVM), Q…/R… (legacy).`}
        />
      </div>
    )
  }

  if (summaryError && !summary) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState title="Error loading address" error={summaryError} onRetry={() => setNonce((n) => n + 1)} />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState label="Loading address…" />
      </div>
    )
  }

  const validator = summary.validator
  const balanceUsd = usdPrice != null ? Number(summary.balance) * usdPrice : null
  const needle = address.toLowerCase()
  const formatStyle = FORMAT_LABELS[format]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4 min-w-0">
          <AddressAvatar address={address} size={72} imageUrl={known?.image} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold">{known?.name ?? (validator ? 'Validator' : summary.isContract ? 'Contract' : 'Address')}</h1>
              <span className={`px-2 py-0.5 text-xs rounded-full border ${formatStyle.className}`}>{formatStyle.label}</span>
              {validator && (
                <span className="px-2 py-0.5 text-xs rounded-full border bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 capitalize">
                  {validator.slashed ? 'Slashed validator' : `${validator.status} validator`}
                </span>
              )}
              {summary.isContract && (
                <span className="px-2 py-0.5 text-xs rounded-full border bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30">Contract</span>
              )}
              {known?.badges.map((badge) => (
                <span key={badge.text} className={`px-2 py-0.5 text-xs rounded-full border ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}>
                  {badge.text}
                </span>
              ))}
              <NetworkModeBadge />
            </div>
            {known?.description && <p className="text-muted-foreground mb-2">{known.description}</p>}
            <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
              <span className="break-all">{address}</span>
              <CopyButton value={address} />
            </div>
          </div>
        </div>
        <ShareAddressDialog address={address} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Balance"
          icon={Wallet}
          value={formatQrdx(summary.balance, 6)}
          hint={balanceUsd != null ? formatUSD(balanceUsd) : 'Account state, then UTXO set'}
        />
        {validator ? (
          <StatCard
            label="Effective Stake"
            icon={ShieldCheck}
            value={`${formatAmount(validator.effectiveStake, 4)} QRDX`}
            hint={`Bonded ${formatAmount(validator.stake, 4)} QRDX · activated epoch ${validator.activationEpoch ?? '—'}`}
          />
        ) : (
          <StatCard
            label={format === 'evm' ? 'Nonce' : 'Unspent Outputs'}
            icon={Hash}
            value={format === 'evm' ? (summary.nonce ?? '—') : summary.spendableOutputs.length}
            hint={format === 'evm' ? (summary.nonce == null ? 'JSON-RPC unavailable' : 'Transactions sent (eth_getTransactionCount)') : 'Spendable UTXOs'}
          />
        )}
        <StatCard
          label="Recent Transactions"
          icon={ArrowUpRight}
          value={activity ? activity.transactions.length : '—'}
          hint={activity?.scanned ? `Blocks #${activity.scanned.from.toLocaleString()}–#${activity.scanned.to.toLocaleString()}` : activityLoading ? 'Scanning…' : undefined}
        />
        <StatCard
          label={validator ? 'Blocks Proposed' : 'Tokens'}
          icon={validator ? Blocks : Coins}
          value={validator ? (activity ? activity.proposedBlocks.length : '—') : (tokens ? tokens.length : '—')}
          hint={validator ? 'In the scanned range' : 'QRC-20 contracts with transfers'}
        />
      </div>

      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="activity">Transactions</TabsTrigger>
          {validator && <TabsTrigger value="validator">Validator</TabsTrigger>}
          <TabsTrigger value="utxos">Unspent Outputs ({summary.spendableOutputs.length})</TabsTrigger>
          <TabsTrigger value="tokens">Tokens{tokens ? ` (${tokens.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                {activity?.scanned
                  ? `The node does not index history per address — showing transactions found in blocks #${activity.scanned.from.toLocaleString()}–#${activity.scanned.to.toLocaleString()}, genesis allocations and unspent outputs.`
                  : 'Scanning recent blocks…'}
                {activity?.scanLimited && ' Scan depth was limited by the node’s query budget.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {activityLoading && !activity ? (
                <LoadingState label="Scanning blocks for activity…" />
              ) : !activity || activity.transactions.length === 0 ? (
                <EmptyState title="No transactions found" description="No activity for this address in the scanned range." />
              ) : (
                <div className="divide-y">
                  {activity.transactions.map((tx) => {
                    const outgoing = tx.from?.toLowerCase() === needle
                    return (
                      <div key={`${tx.kind}-${tx.hash}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-lg ${outgoing ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                            {outgoing ? <ArrowUpRight className="h-4 w-4 text-red-500" /> : <ArrowDownLeft className="h-4 w-4 text-green-500" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <TxKindBadge kind={tx.kind} />
                              <TxLink hash={tx.hash} />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                              {tx.method} · {outgoing ? <>to <AddressLink address={tx.to} /></> : <>from <AddressLink address={tx.from} /></>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`font-medium ${outgoing ? 'text-red-500' : 'text-green-500'}`}>
                            {outgoing ? '−' : '+'}{formatQrdx(tx.value, 6)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <BlockLink height={tx.blockHeight} /> · <TimeAgo timestamp={tx.timestamp} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {activity && scanStep < SCAN_STEPS.length - 1 && activity.scanned && activity.scanned.from > 0 && !activity.scanLimited && (
                <div className="p-4 border-t text-center">
                  <Button variant="outline" size="sm" disabled={activityLoading} onClick={() => setScanStep((s) => s + 1)}>
                    {activityLoading ? 'Scanning…' : `Scan deeper (last ${SCAN_STEPS[scanStep + 1].toLocaleString()} blocks)`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {validator && (
          <TabsContent value="validator" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Validator Details</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <DetailRow label="Status"><span className="capitalize">{validator.status}</span>{validator.slashed && <span className="text-red-500"> · slashed</span>}</DetailRow>
                <DetailRow label="Bonded Stake">{formatQrdx(validator.stake, 8)}</DetailRow>
                <DetailRow label="Effective Stake">{formatQrdx(validator.effectiveStake, 8)}</DetailRow>
                <DetailRow label="Activation Epoch">{validator.activationEpoch ?? '—'}</DetailRow>
                <DetailRow label="Exit Epoch">{validator.exitEpoch ?? 'Not exiting'}</DetailRow>
                <DetailRow label="Signing Key">ML-DSA-65 · {validator.publicKeyBytes.toLocaleString()}-byte public key</DetailRow>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Proposed Blocks</CardTitle>
                <CardDescription>{activity?.scanned ? `Blocks #${activity.scanned.from.toLocaleString()}–#${activity.scanned.to.toLocaleString()}` : 'Scanning…'}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!activity || activity.proposedBlocks.length === 0 ? (
                  <EmptyState title="No proposed blocks in range" />
                ) : (
                  <div className="divide-y max-h-[420px] overflow-y-auto">
                    {activity.proposedBlocks.slice(0, 100).map((block) => (
                      <div key={block.hash} className="flex items-center justify-between p-3 text-sm">
                        <BlockLink height={block.height} />
                        <span className="text-muted-foreground font-mono">slot {block.slot ?? '—'} · epoch {block.epoch ?? '—'}</span>
                        <span className="text-muted-foreground">{block.attestationCount} att.</span>
                        <TimeAgo timestamp={block.timestamp} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recorded Attestations</CardTitle>
                <CardDescription>From the node&apos;s attestation index (<code>/get_attestations</code>)</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!attestations ? (
                  <LoadingState label="Loading attestations…" />
                ) : attestations.length === 0 ? (
                  <EmptyState title="No indexed attestations" description="This node has not recorded attestations for this validator. Votes included in blocks are listed on each block page." />
                ) : (
                  <div className="divide-y">
                    {attestations.map((att, i) => (
                      <div key={att.id ?? i} className="flex items-center justify-between p-3 text-sm font-mono">
                        <span>slot {att.slot}</span>
                        <span>epoch {att.epoch}</span>
                        <span>{att.sourceEpoch} → {att.targetEpoch}</span>
                        <Link href={`/block/${att.blockHash}`} className="text-primary hover:underline">{att.blockHash.slice(0, 12)}…</Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="utxos">
          <Card>
            <CardHeader>
              <CardTitle>Unspent Outputs</CardTitle>
              <CardDescription>Native UTXOs spendable by this address</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {summary.spendableOutputs.length === 0 ? (
                <EmptyState title="No unspent outputs" description={format === 'legacy' ? undefined : 'Account-model balances are held in account state rather than UTXOs.'} />
              ) : (
                <div className="divide-y">
                  {summary.spendableOutputs.map((o) => (
                    <div key={`${o.txHash}:${o.index}`} className="flex items-center justify-between gap-4 p-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <TxLink hash={o.txHash} />
                        <span className="text-xs text-muted-foreground">output #{o.index}</span>
                      </div>
                      <span className="font-medium">{formatQrdx(o.amount, 6)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens">
          <Card>
            <CardHeader>
              <CardTitle>Token Holdings</CardTitle>
              <CardDescription>QRC-20 contracts that have transferred tokens to this address</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!tokens ? (
                <LoadingState label="Loading tokens…" />
              ) : tokens.length === 0 ? (
                <EmptyState title="No tokens found" />
              ) : (
                <div className="divide-y">
                  {tokens.map((token) => (
                    <div key={token.contractAddress} className="flex items-center justify-between gap-4 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCode2 className="h-6 w-6 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{token.name ?? 'Unnamed token'}</span>
                            {token.symbol && <span className="text-sm text-muted-foreground">{token.symbol}</span>}
                            <span className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/30">{token.type}</span>
                            {token.verified && <span className="text-xs text-green-500">Verified</span>}
                          </div>
                          <AddressLink address={token.contractAddress} />
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">{token.transferCount} transfer{token.transferCount === 1 ? '' : 's'} received</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
