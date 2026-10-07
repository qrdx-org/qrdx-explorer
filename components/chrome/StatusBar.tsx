'use client'

import { Boxes, Github } from 'lucide-react'
import { useChain } from '@/components/explorer/ChainProvider'
import { cn } from '@/lib/utils'

/** Bottom bar: node feed, network, chain tip and finality, and where the data comes from. */
export function StatusBar() {
  const { stream, height, finalizedEpoch, network } = useChain()
  const state = stream.state
  return (
    <div className="sticky bottom-0 z-30 flex h-7 items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            state === 'live' ? 'pulse-dot bg-bid text-bid' : state === 'polling' ? 'bg-warn' : state === 'offline' ? 'bg-ask' : 'bg-muted-foreground'
          )}
        />
        {state === 'live' ? 'Live' : state === 'polling' ? 'Polling' : state === 'offline' ? 'Node unreachable' : 'Connecting'}
        {stream.transport && <span className="hidden sm:inline">· {stream.transport === 'websocket' ? 'WebSocket' : stream.transport === 'sse' ? 'SSE' : 'HTTP'}</span>}
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className={cn('rounded-sm px-1 text-[10px] font-semibold uppercase tracking-wide', network.type === 'mainnet' ? 'bg-primary/15 text-primary' : 'bg-warn/15 text-warn')}>
          {network.type}
        </span>
        {network.name}
      </span>
      {height >= 0 && (
        <span className="flex items-center gap-1.5">
          <Boxes className="h-3 w-3" />
          <span className="num text-foreground/80">#{height.toLocaleString()}</span>
          {finalizedEpoch != null && <span className="num hidden md:inline">· finalized epoch {finalizedEpoch.toLocaleString()}</span>}
        </span>
      )}
      <span className="ml-auto flex items-center gap-4">
        <span className="hidden font-mono md:inline">{network.nodeApiUrl.replace(/^https?:\/\//, '')}</span>
        {network.tradeUrl && (
          <a href={network.tradeUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Trade
          </a>
        )}
        <a href="https://github.com/qrdx-org/qrdx-explorer" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="hover:text-foreground">
          <Github className="h-3 w-3" />
        </a>
      </span>
    </div>
  )
}
