'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChain } from './ChainProvider'
import { useLiveBlocks } from './hooks'
import type { ExplorerBlock } from '@/lib/qrdx/api'

/** CSS px per slot, and between the dots of a block's column. */
const SLOT_W = 14
const PITCH = 4.6
/** Room right of the newest slot for the "now" mark. */
const NOW_MARGIN = 44

/** A theme token ("0 0% 98%") as `r, g, b`, for the canvas. */
function tokenRgb(name: string): string {
  const [h, s, l] = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(parseFloat)
  const sat = (s || 0) / 100
  const lig = (l || 0) / 100
  const k = (n: number) => (n + (h || 0) / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => Math.round(255 * (lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
  return `${f(0)}, ${f(8)}, ${f(4)}`
}

const txsOf = (b: ExplorerBlock) => b.nativeTxCount + (b.evmTxCount ?? 0) + (b.exchangeTxCount ?? 0)

/**
 * The chain as a tape of slots, scrolling with the node's clock: each slot one column, a block a
 * stack of dots (taller for more transactions), a missed slot an empty ring, a slot not read yet
 * a faint dot. Finalized epochs print solid, the rest lighter; epochs are marked where they begin.
 * Hover a block to see it, click to open it.
 */
export function ChainTape({ className }: { className?: string }) {
  const { clock, clockOffsetMs, finalizedEpoch } = useChain()
  const { blocks } = useLiveBlocks(64)
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ x: number; block: ExplorerBlock | null; slot: number } | null>(null)

  const bySlot = useMemo(() => {
    const m = new Map<number, ExplorerBlock>()
    for (const b of blocks) if (b.block?.slot != null) m.set(b.block.slot, b.block)
    return m
  }, [blocks])
  // A slot is missed only between two blocks read at consecutive heights: a gap beside a block
  // not read yet is unknown, not missed.
  const missed = useMemo(() => {
    const read = [...bySlot.values()].sort((a, b) => a.height - b.height)
    const out = new Set<number>()
    for (let i = 1; i < read.length; i++)
      if (read[i].height === read[i - 1].height + 1) for (let s = read[i - 1].slot! + 1; s < read[i].slot!; s++) out.add(s)
    return out
  }, [bySlot])

  // The draw loop reads the latest data from here, so it never restarts.
  const live = useRef({ bySlot, missed, clock, clockOffsetMs, finalizedEpoch, hoverSlot: null as number | null, seen: new Map<number, number>() })
  useEffect(() => {
    const l = live.current
    const now = performance.now()
    for (const s of bySlot.keys()) if (!l.seen.has(s)) l.seen.set(s, l.bySlot.size ? now : now - 1000)
    Object.assign(l, { bySlot, missed, clock, clockOffsetMs, finalizedEpoch })
    if (l.seen.size > 400) for (const k of [...l.seen.keys()].slice(0, 100)) l.seen.delete(k)
  }, [bySlot, missed, clock, clockOffsetMs, finalizedEpoch])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let visible = true
    let ink = tokenRgb('--foreground')
    let w = 0
    let h = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = () => {
      const l = live.current
      ctx.clearRect(0, 0, w, h)
      if (!l.clock || !w) return
      const nowSlot = (Date.now() - l.clockOffsetMs - l.clock.genesisMs) / l.clock.slotMs
      const base = h - 22
      const xOf = (s: number) => w - NOW_MARGIN - (nowSlot - (s + 0.5)) * SLOT_W
      const finalUpTo = l.finalizedEpoch != null ? (l.finalizedEpoch + 1) * l.clock.slotsPerEpoch - 1 : -1
      const first = Math.floor(nowSlot - (w - NOW_MARGIN) / SLOT_W) - 1
      const t = performance.now()
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'

      for (let s = first; s <= Math.floor(nowSlot); s++) {
        const x = xOf(s)
        // Older slots fade toward the left edge.
        const edge = Math.min(1, Math.max(0, (x - 8) / 140))
        if (s % l.clock.slotsPerEpoch === 0) {
          ctx.fillStyle = `rgba(${ink}, ${0.22 * edge})`
          for (let y = 6; y < base; y += 6) ctx.fillRect(x - SLOT_W / 2, y, 1, 2)
          ctx.fillStyle = `rgba(${ink}, ${0.55 * edge})`
          ctx.fillText(`epoch ${Math.floor(s / l.clock.slotsPerEpoch).toLocaleString()}`, x - SLOT_W / 2 + 4, h - 6)
        }
        const b = l.bySlot.get(s)
        const final = s <= finalUpTo
        if (b) {
          const n = 3 + Math.min(14, txsOf(b) * 3) + Math.min(4, b.attestationCount)
          // A block that just arrived rises into place.
          const grow = Math.min(1, (t - (l.seen.get(s) ?? 0)) / 420)
          const shown = Math.max(1, Math.round(n * (1 - (1 - grow) ** 3)))
          const a = (final ? 0.92 : 0.6) * edge * (l.hoverSlot === s ? 1 : 0.95)
          ctx.fillStyle = `rgba(${ink}, ${a})`
          ctx.beginPath()
          for (let i = 0; i < shown; i++) {
            const y = base - i * PITCH
            ctx.moveTo(x + 1.8, y)
            ctx.arc(x, y, 1.8, 0, Math.PI * 2)
          }
          ctx.fill()
        } else if (l.missed.has(s)) {
          // Between blocks read: a slot that passed without one.
          ctx.strokeStyle = `rgba(${ink}, ${0.45 * edge})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(x, base, 2.2, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(${ink}, ${0.16 * edge})`
          ctx.beginPath()
          ctx.arc(x, base, 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
        if (l.hoverSlot === s) {
          ctx.fillStyle = `rgba(${ink}, 0.07)`
          ctx.fillRect(x - SLOT_W / 2, 0, SLOT_W, base + 6)
        }
      }
      // The finalized stretch: a solid baseline; after it, dashed.
      const fx = finalUpTo >= first ? Math.min(xOf(finalUpTo) + SLOT_W / 2, w - NOW_MARGIN) : 0
      ctx.fillStyle = `rgba(${ink}, 0.5)`
      ctx.fillRect(0, base + 6, Math.max(0, fx), 1)
      for (let x = Math.max(0, fx); x < w - NOW_MARGIN; x += 5) ctx.fillRect(x, base + 6, 2, 1)
      // Now.
      const nx = w - NOW_MARGIN + SLOT_W / 2
      ctx.fillStyle = `rgba(${ink}, 0.8)`
      ctx.fillRect(nx, 4, 1, base + 2)
      ctx.fillText('now', nx + 5, 12)
    }

    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 33) return
      last = now
      draw()
    }
    const start = () => {
      cancelAnimationFrame(raf)
      if (visible && !document.hidden) raf = requestAnimationFrame(loop)
    }
    resize()
    const ro = new ResizeObserver(() => (resize(), draw()))
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => ((visible = e.isIntersecting), start()))
    io.observe(canvas)
    document.addEventListener('visibilitychange', start)
    const mo = new MutationObserver(() => (ink = tokenRgb('--foreground')))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    start()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', start)
    }
  }, [])

  const slotAt = (clientX: number) => {
    const l = live.current
    const canvas = canvasRef.current
    if (!l.clock || !canvas) return null
    const r = canvas.getBoundingClientRect()
    const nowSlot = (Date.now() - l.clockOffsetMs - l.clock.genesisMs) / l.clock.slotMs
    const s = Math.floor(nowSlot - (r.width - NOW_MARGIN - (clientX - r.left)) / SLOT_W + 0.5)
    return s > nowSlot ? null : { slot: s, x: clientX - r.left }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full ${hover?.block ? 'cursor-pointer' : ''}`}
        aria-label="The latest slots and blocks, live"
        role="img"
        onPointerMove={(e) => {
          const at = slotAt(e.clientX)
          live.current.hoverSlot = at?.slot ?? null
          setHover(at ? { x: at.x, slot: at.slot, block: live.current.bySlot.get(at.slot) ?? null } : null)
        }}
        onPointerLeave={() => ((live.current.hoverSlot = null), setHover(null))}
        onClick={() => hover?.block && router.push(`/block/${hover.block.height}`)}
      />
      {hover && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 font-mono text-[11px] shadow-sm"
          style={{ left: Math.min(Math.max(hover.x, 90), (canvasRef.current?.clientWidth ?? 0) - 90) }}
        >
          {hover.block
            ? `#${hover.block.height.toLocaleString()} · slot ${hover.slot.toLocaleString()} · ${txsOf(hover.block)} txns`
            : missed.has(hover.slot)
              ? `slot ${hover.slot.toLocaleString()} · no block`
              : `slot ${hover.slot.toLocaleString()} · not read yet`}
        </div>
      )}
    </div>
  )
}
