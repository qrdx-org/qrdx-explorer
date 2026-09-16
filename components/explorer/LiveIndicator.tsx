'use client'

import { useChain } from './ChainProvider'

const LABELS = {
  connecting: { dot: 'bg-gray-400 animate-pulse', text: 'Connecting' },
  live: { dot: 'bg-green-500', text: 'Live' },
  polling: { dot: 'bg-yellow-500', text: 'Polling' },
  offline: { dot: 'bg-red-500', text: 'Offline' },
} as const

export default function LiveIndicator() {
  const { stream, height, network } = useChain()
  const label = LABELS[stream.state]
  const transport =
    stream.transport === 'websocket' ? 'WebSocket' : stream.transport === 'sse' ? 'Server-Sent Events' : stream.transport === 'polling' ? 'HTTP polling' : null
  const title = [
    `Node: ${network.nodeApiUrl}`,
    transport && `Transport: ${transport}`,
    stream.nodeVersion && `Node version: ${stream.nodeVersion}`,
    stream.error && `Note: ${stream.error}`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground px-2" title={title}>
      <span className="relative flex h-2 w-2">
        {stream.state === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${label.dot}`} />
      </span>
      <span>{label.text}</span>
      {height >= 0 && <span className="font-mono">#{height.toLocaleString()}</span>}
    </div>
  )
}
