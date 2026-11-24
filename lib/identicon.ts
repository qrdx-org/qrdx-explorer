/**
 * Generates a deterministic identicon-style image from an Ethereum address
 * Similar to GitHub's identicons or Ethereum's blockie style
 */

export function generateIdenticon(address: string, size: number = 64): string {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return ''
  }
  
  try {
    // Create canvas
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return ''
    
    // Use address to seed random colors and pattern
    // Seed from the hex after any letter prefix: 0xPQ, 0xPQMS (multisig), or a protocol
    // account's tag (0xSUBA, 0xUVLT, 0xPOOL, …: lib/qrdx/accounts.ts).
    const body = address.replace(/^0x(PQMS|PQ|SUBA|UVLT|HLPV|PROT|POOL|CLOB|PERP|VETO|BRDG|QNSA|FEES)?/i, '')
    const seed = parseInt(body.slice(0, 8), 16) || 0
    const color = generateColor(seed)
    const bgColor = generateBackgroundColor(seed)
    
    // Fill background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, size, size)
    
    // Draw 5x5 grid (symmetric)
    const gridSize = 5
    const cellSize = size / gridSize
    
    ctx.fillStyle = color
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < Math.ceil(gridSize / 2); x++) {
        const index = y * Math.ceil(gridSize / 2) + x
        const shouldFill = (seed >> index) & 1
        
        if (shouldFill) {
          // Draw left side
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
          // Mirror to right side
          if (x < Math.floor(gridSize / 2)) {
            ctx.fillRect((gridSize - 1 - x) * cellSize, y * cellSize, cellSize, cellSize)
          }
        }
      }
    }
    
    return canvas.toDataURL()
  } catch (error) {
    console.error('Error generating identicon:', error)
    return ''
  }
}

// Monochrome, like the rest of the site: the pattern tells addresses apart, and its grey (one
// of several, from the seed) on a near-black ground helps.
function generateColor(seed: number): string {
  return `hsl(0, 0%, ${58 + ((seed >>> 16) % 5) * 9}%)`
}

function generateBackgroundColor(seed: number): string {
  return `hsl(0, 0%, ${10 + ((seed >>> 20) % 3) * 4}%)`
}

/**
 * Hook to generate identicon for an address
 */
export function useIdenticon(address: string, size?: number): string {
  if (typeof window === 'undefined') return ''
  return generateIdenticon(address, size)
}
