import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert smallest unit to QRDX
 * 1 QRDX = 10^6 smallest units (6 decimals)
 */
export function weiToQRDX(wei: string | number): number {
  if (typeof wei === 'string') {
    // Handle hex strings
    if (wei.startsWith('0x')) {
      wei = parseInt(wei, 16)
    } else {
      wei = parseFloat(wei)
    }
  }
  
  if (isNaN(wei) || wei === 0) {
    return 0
  }
  
  // Divide by 10^6 to convert smallest unit to QRDX
  return wei / 1e6
}

/**
 * Convert QRDX to smallest unit
 */
export function qrdxToWei(qrdx: string | number): string {
  if (typeof qrdx === 'string') {
    qrdx = parseFloat(qrdx)
  }
  
  if (isNaN(qrdx)) {
    return '0'
  }
  
  // Multiply by 10^6 and convert to string
  return (qrdx * 1e6).toString()
}
