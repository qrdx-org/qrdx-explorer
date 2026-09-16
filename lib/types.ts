// Chain data models live in '@/lib/qrdx' (ExplorerBlock, ExplorerTransaction, ...).
export type {
  AddressSummary,
  ExplorerBlock,
  ExplorerTransaction,
  NetworkConfig,
  NetworkType,
  ValidatorInfo,
} from './qrdx'

export type { TokenPrice } from './pricing-api'

export interface PnLDataPoint {
  time: number
  value: number
}

export interface ClaimMetadata {
  name: string
  description: string
  image: string
}
