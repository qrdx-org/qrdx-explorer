'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, ChevronLeft, Clock, Search, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useChain } from '@/components/explorer/ChainProvider'
import {
  AddressLink,
  BlockLink,
  CopyButton,
  DetailRow,
  ErrorState,
  LoadingState,
  NetworkModeBadge,
  TimeAgo,
  TxKindBadge,
  TxLink,
} from '@/components/explorer/common'
import {
  EVM_DECIMALS,
  formatUnits,
  getBlock,
  getTransaction,
  NATIVE_DECIMALS,
  strip0x,
  type ExplorerTransaction,
  type TransactionLookup,
} from '@/lib/qrdx'
import { formatAmount, formatDateTime, formatQrdx } from '@/lib/format'
import { getTokenPrice } from '@/lib/pricing-api'

interface PageProps {
  params: Promise<{ hash: string }>
}

function HexBlock({ value }: { value: string }) {
  return (
    <div className="relative">
      <pre className="font-mono text-xs bg-muted/50 rounded-md p-3 whitespace-pre-wrap break-all max-h-64 overflow-auto">{value}</pre>
      <div className="absolute top-1 right-1">
        <CopyButton value={value} />
      </div>
    </div>
  )
}

function EvmDetails({ tx }: { tx: ExplorerTransaction }) {
  const evm = tx.evm!
  const typeLabel = evm.type === 2 ? 'EIP-1559 (type 2)' : evm.type === 1 ? 'EIP-2930 (type 1)' : 'Legacy (type 0)'
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>EVM Execution</CardTitle>
        <CardDescription>Decoded from the raw signed transaction in the block&apos;s EVM section</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <DetailRow label="Transaction Type">{typeLabel}</DetailRow>
        <DetailRow label="Chain ID">{evm.chainId != null ? evm.chainId.toString() : 'Unprotected (pre-EIP-155)'}</DetailRow>
        <DetailRow label="Nonce">{evm.nonce.toString()}</DetailRow>
        <DetailRow label="Gas Limit">{evm.gasLimit.toLocaleString()}</DetailRow>
        <DetailRow label={evm.type === 2 ? 'Max Fee Per Gas' : 'Gas Price'}>{formatUnits(evm.gasPrice, 9)} Gwei</DetailRow>
        {evm.maxPriorityFeePerGas != null && (
          <DetailRow label="Max Priority Fee">{formatUnits(evm.maxPriorityFeePerGas, 9)} Gwei</DetailRow>
        )}
        {evm.createdContract && (
          <DetailRow label="Contract Created"><AddressLink address={evm.createdContract} full copy /></DetailRow>
        )}
        <DetailRow label="Value (wei)"><span className="font-mono">{evm.value.toString()}</span></DetailRow>
        <DetailRow label="Input Data">
          {evm.input === '0x' ? <span className="text-muted-foreground">None</span> : <HexBlock value={evm.input} />}
        </DetailRow>
        <DetailRow label="Raw Transaction"><HexBlock value={evm.raw} /></DetailRow>
      </CardContent>
    </Card>
  )
}

function NativeDetails({ tx }: { tx: ExplorerTransaction }) {
  const native = tx.native!
  if (native.kind === 'genesis') {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Genesis Record</CardTitle>
          <CardDescription>Allocation created when the chain was initialised</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <DetailRow label="Type">{native.genesisType}</DetailRow>
          {native.label && <DetailRow label="Label">{native.label}</DetailRow>}
          {native.category && <DetailRow label="Category">{native.category}</DetailRow>}
          {native.controller && <DetailRow label="Controller"><AddressLink address={native.controller} full copy /></DetailRow>}
          <DetailRow label="Allocation Index">{native.index}</DetailRow>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{native.kind === 'coinbase' ? 'Coinbase' : 'UTXO Transfer'}</CardTitle>
        <CardDescription>Decoded native transaction (format v{native.version})</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-6">
        {native.kind === 'transfer' && (
          <div>
            <h4 className="text-sm font-medium mb-2">Inputs ({native.inputs.length})</h4>
            <div className="space-y-1">
              {native.inputs.map((input) => (
                <div key={`${input.txHash}:${input.index}`} className="flex items-center gap-2 text-sm">
                  <TxLink hash={input.txHash} />
                  <span className="text-muted-foreground">output #{input.index}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h4 className="text-sm font-medium mb-2">Outputs ({native.outputs.length})</h4>
          <div className="space-y-1">
            {native.outputs.map((output, i) => (
              <div key={`${output.address}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground">#{i}</span>
                  <AddressLink address={output.address} />
                </span>
                <span className="font-mono">{formatQrdx(formatUnits(output.amount, NATIVE_DECIMALS))}</span>
              </div>
            ))}
          </div>
        </div>
        {native.kind === 'transfer' && (
          <>
            {native.message && <DetailRow label="Message">{native.message}</DetailRow>}
            <DetailRow label="Signatures">{native.signatureCount}</DetailRow>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ExchangeDetails({ tx }: { tx: ExplorerTransaction }) {
  const ex = tx.exchange!
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Exchange Operation</CardTitle>
        <CardDescription>Protocol-level exchange transaction (PQ-signed)</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <DetailRow label="Operation">{tx.method} (op {ex.op_type})</DetailRow>
        <DetailRow label="Sender Nonce">{ex.nonce}</DetailRow>
        <DetailRow label="Gas Limit">{ex.gas_limit?.toLocaleString()}</DetailRow>
        <DetailRow label="Gas Price">{ex.gas_price} QRDX</DetailRow>
        <DetailRow label="Submitted">{ex.timestamp ? formatDateTime(Math.floor(ex.timestamp)) : '—'}</DetailRow>
        <DetailRow label="Parameters"><HexBlock value={JSON.stringify(ex.params, null, 2)} /></DetailRow>
      </CardContent>
    </Card>
  )
}

function ContractDetails({ tx }: { tx: ExplorerTransaction }) {
  const contract = tx.contract as Record<string, any>
  const receipt = contract.receipt as Record<string, any> | null
  const logs: any[] = receipt?.logs ?? []
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Contract Execution</CardTitle>
        <CardDescription>From eth_getTransactionByHash / eth_getTransactionReceipt</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <DetailRow label="Nonce">{contract.nonce ? parseInt(contract.nonce, 16) : '—'}</DetailRow>
        <DetailRow label="Gas Limit">{contract.gas ? parseInt(contract.gas, 16).toLocaleString() : '—'}</DetailRow>
        <DetailRow label="Gas Used">{receipt?.gasUsed ? parseInt(receipt.gasUsed, 16).toLocaleString() : '—'}</DetailRow>
        {receipt?.contractAddress && <DetailRow label="Contract Created"><AddressLink address={receipt.contractAddress} full copy /></DetailRow>}
        <DetailRow label="Input Data">
          {!contract.input || contract.input === '0x' ? <span className="text-muted-foreground">None</span> : <HexBlock value={contract.input} />}
        </DetailRow>
        <DetailRow label={`Logs (${logs.length})`}>
          {logs.length === 0 ? (
            <span className="text-muted-foreground">No events emitted</span>
          ) : (
            <div className="space-y-3">
              {logs.map((log, i) => (
                <div key={i} className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Log #{parseInt(log.logIndex ?? '0x0', 16)} · <AddressLink address={log.address} /></div>
                  {(log.topics ?? []).map((topic: string, t: number) => (
                    <div key={t} className="font-mono text-xs break-all">[{t}] {topic}</div>
                  ))}
                  {log.data && log.data !== '0x' && <div className="font-mono text-xs break-all text-muted-foreground">data: {log.data}</div>}
                </div>
              ))}
            </div>
          )}
        </DetailRow>
      </CardContent>
    </Card>
  )
}

export default function TransactionPage({ params }: PageProps) {
  const { hash } = use(params)
  const { height: tip, finalizedEpoch, subscribeBlocks } = useChain()
  const [lookup, setLookup] = useState<TransactionLookup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockEpoch, setBlockEpoch] = useState<number | null>(null)
  const [usdPrice, setUsdPrice] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getTransaction(hash)
      .then((result) => !cancelled && setLookup(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Lookup failed'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [hash, nonce])

  // If the tx is not on chain yet, watch each new block for it.
  const notFound = !loading && !error && lookup && !lookup.transaction
  useEffect(() => {
    if (!notFound) return
    const needle = strip0x(hash).toLowerCase()
    return subscribeBlocks(async (event) => {
      const block = await getBlock(event.height).catch(() => null)
      const match = block?.transactions.find((t) => strip0x(t.hash).toLowerCase() === needle)
      if (match) setLookup({ transaction: match, scanned: null, scanLimited: false })
    })
  }, [notFound, hash, subscribeBlocks])

  const tx = lookup?.transaction ?? null

  useEffect(() => {
    if (tx?.blockHeight == null) return
    getBlock(tx.blockHeight).then((b) => setBlockEpoch(b?.epoch ?? null)).catch(() => undefined)
  }, [tx?.blockHeight])

  useEffect(() => {
    getTokenPrice('QRDX').then((p) => setUsdPrice(p?.price_usd ?? null)).catch(() => undefined)
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState label="Locating transaction…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState title="Error loading transaction" error={error} onRetry={() => setNonce((n) => n + 1)} />
      </div>
    )
  }

  if (!tx) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6 py-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-xl font-semibold mb-2">Transaction not found</h2>
            <p className="font-mono text-sm break-all text-muted-foreground mb-4">{hash}</p>
            <div className="text-sm text-muted-foreground max-w-xl mx-auto space-y-2">
              <p>
                Checked the native transaction index, contract receipts, genesis allocations
                {lookup?.scanned ? ` and EVM/exchange sections of blocks #${lookup.scanned.from.toLocaleString()}–#${lookup.scanned.to.toLocaleString()}` : ''}.
              </p>
              {lookup?.scanLimited && (
                <p>
                  The scan was limited by the node&apos;s per-client query budget. The node does not index included EVM
                  transactions by hash, so older transactions may not be locatable right now.
                </p>
              )}
              <p className="flex items-center justify-center gap-2">
                <Clock className="h-4 w-4 animate-pulse" /> Watching new blocks — this page updates if the transaction is included.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const confirmations = tx.blockHeight != null && tip >= tx.blockHeight ? tip - tx.blockHeight + 1 : null
  const finalized = tx.blockHeight === 0 || (finalizedEpoch != null && blockEpoch != null && blockEpoch <= finalizedEpoch)
  const StatusIcon = tx.status === 'failed' ? XCircle : tx.status === 'pending' ? Clock : CheckCircle2
  const statusClass = tx.status === 'failed' ? 'text-red-500' : tx.status === 'pending' ? 'text-yellow-500' : 'text-green-500'
  const valueUsd = usdPrice != null ? Number(tx.value) * usdPrice : null

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Link href="/transactions" className="text-muted-foreground hover:text-primary transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-3xl font-bold">Transaction</h1>
          <TxKindBadge kind={tx.kind} />
          <NetworkModeBadge />
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="font-mono break-all">{tx.hash}</span>
          <CopyButton value={tx.hash} />
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DetailRow label="Status">
            <span className={`inline-flex items-center gap-2 font-medium ${statusClass}`}>
              <StatusIcon className="h-4 w-4" />
              {tx.status === 'confirmed' ? 'Included' : tx.status === 'failed' ? 'Failed' : 'Pending'}
              {tx.status !== 'pending' && (finalized || (finalizedEpoch != null && blockEpoch != null)) && (
                <span className={`text-xs px-2 py-0.5 rounded ${finalized ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'}`}>
                  {finalized ? 'Finalized' : 'Awaiting finality'}
                </span>
              )}
            </span>
          </DetailRow>
          <DetailRow label="Method">{tx.method}</DetailRow>
          <DetailRow label="Block">
            <span className="inline-flex items-center gap-2 flex-wrap">
              <BlockLink height={tx.blockHeight} />
              {confirmations != null && <span className="text-muted-foreground">{confirmations.toLocaleString()} confirmation{confirmations === 1 ? '' : 's'}</span>}
              {tx.blockHeight != null && <span className="text-muted-foreground">· position {tx.index}</span>}
            </span>
          </DetailRow>
          <DetailRow label="Timestamp">
            {tx.timestamp ? <>{formatDateTime(tx.timestamp)} (<TimeAgo timestamp={tx.timestamp} />)</> : '—'}
          </DetailRow>
          <DetailRow label="From">
            {tx.from ? <AddressLink address={tx.from} full avatar copy /> : <span className="text-muted-foreground">{tx.kind === 'genesis' ? 'Genesis' : tx.kind === 'coinbase' ? 'Block reward' : '—'}</span>}
          </DetailRow>
          <DetailRow label="To">
            <span className="inline-flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <AddressLink address={tx.to} full avatar copy />
            </span>
          </DetailRow>
          <DetailRow label="Value">
            <span className="font-semibold">{formatQrdx(tx.value, 18)}</span>
            {valueUsd != null && <span className="text-muted-foreground"> (${valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>}
          </DetailRow>
          <DetailRow label={tx.kind === 'evm' ? 'Max Transaction Fee' : 'Transaction Fee'}>
            {tx.fee != null ? formatQrdx(tx.fee, 18) : <span className="text-muted-foreground">Unavailable</span>}
            {tx.kind === 'evm' && <span className="text-muted-foreground text-xs block">Gas limit × gas price; the node does not expose gas used for block-included EVM transactions.</span>}
          </DetailRow>
          {tx.blockHash && (
            <DetailRow label="Block Hash">
              <span className="inline-flex items-start gap-1">
                <Link href={`/block/${tx.blockHash}`} className="font-mono break-all text-primary hover:underline">{tx.blockHash}</Link>
                <CopyButton value={tx.blockHash} />
              </span>
            </DetailRow>
          )}
        </CardContent>
      </Card>

      {tx.evm && <EvmDetails tx={tx} />}
      {tx.native && <NativeDetails tx={tx} />}
      {tx.exchange && <ExchangeDetails tx={tx} />}
      {tx.contract && <ContractDetails tx={tx} />}

      <p className="text-xs text-muted-foreground">
        Amounts: native outputs use {NATIVE_DECIMALS} decimals, EVM values use {EVM_DECIMALS} decimals (wei). {formatAmount('1', 0)} QRDX = 10<sup>{tx.kind === 'evm' || tx.kind === 'contract' ? EVM_DECIMALS : NATIVE_DECIMALS}</sup> base units.
      </p>
    </div>
  )
}
