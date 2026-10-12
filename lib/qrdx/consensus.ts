/**
 * Consensus, staking and governance reads (qrdx-node docs/PROTOCOL_UPGRADES.md,
 * STAKING.md, GOVERNANCE.md, BRIDGE.md):
 *
 *  - `/chain_spec` (or `qrdx_chainSpec`): the network's identity and every chain-spec
 *    parameter — slot length, epoch length, staking and governance windows — and its
 *    upgrade schedule.
 *  - The slot clock: slot n starts at genesis + n × SLOT_DURATION_MS. A block records
 *    its slot, so a block's time is exact to the millisecond, the gap between two blocks
 *    is (slot difference) × slot length, and slots with no block are missed slots. Block
 *    timestamps themselves are whole seconds, too coarse at 250 ms.
 *  - `staking_*`: validators with their weight, delegation and rewards; pools; parameters.
 *  - `governance_*`: proposals, the master controller, fork approvals.
 *  - `bridge_*`: bridged assets and withdrawals.
 */

import { nodeRequest, nodeRequestRaw, rpcCall } from './client'
import { parseTimestamp } from './native'

// ─── Chain spec ─────────────────────────────────────────────────────────────────

export interface ForkApproval {
  approved: boolean
  approve_by: number
  definition_hash?: string
  approved_at?: number | null
  [key: string]: unknown
}

export interface ScheduledFork {
  name: string
  height: number
  features?: string[]
  status?: string
  blocks_until?: number
  approval?: ForkApproval
  [key: string]: unknown
}

export interface ChainSpecParams {
  SLOT_DURATION_MS: number
  SLOTS_PER_EPOCH: number
  MIN_VALIDATORS?: number
  UNBONDING_PERIOD_EPOCHS?: number
  ACTIVATION_DELAY_EPOCHS?: number
  WITHDRAWAL_DELAY_EPOCHS?: number
  STAKING_REWARD_RATE_BPS?: number
  GOV_VOTING_PERIOD_BLOCKS?: number
  GOV_TIMELOCK_BLOCKS?: number
  GOV_EXECUTION_WINDOW_BLOCKS?: number
  GOV_APPROVAL_THRESHOLD_BPS?: number
  GOV_VETO_THRESHOLD_QRDX?: number
  [key: string]: unknown
}

export interface ChainSpec {
  network: string
  chain_id: number
  dev: boolean
  spec_format: number
  spec_hash: string
  genesis_block_hash: string
  head: number
  params: ChainSpecParams
  genesis_features: string[]
  forks: ScheduledFork[]
  next_fork: (ScheduledFork & { blocks_until: number }) | null
  active_features: string[]
  fork_id: { hash: string; next: number }
  node_version: string
  /** Feature name → what it changes. */
  supported_features: Record<string, string>
  build?: { version: string; commit: string }
  peers?: { known: number; reporting: number; ready_for_next_fork: number }
}

/** The node's chain spec: REST `/chain_spec`, else `qrdx_chainSpec` over JSON-RPC. Null on nodes that predate it. */
export async function getChainSpec(baseUrl?: string): Promise<ChainSpec | null> {
  try {
    const r = await nodeRequestRaw<ChainSpec>('chain_spec', { baseUrl, timeoutMs: 8000 })
    if (r.status === 200 && r.data && typeof r.data.chain_id === 'number') return r.data
  } catch {
    // fall through to JSON-RPC
  }
  try {
    return await rpcCall<ChainSpec>('qrdx_chainSpec', [], { baseUrl, timeoutMs: 8000 })
  } catch {
    return null
  }
}

// ─── Slot clock ─────────────────────────────────────────────────────────────────

export interface SlotClock {
  /** Genesis time, unix ms (the genesis block's timestamp; slot 0 starts here). */
  genesisMs: number
  slotMs: number
  slotsPerEpoch: number
}

/** Before a node reports its chain spec: the protocol's standard parameters. */
export const STANDARD_SLOT_MS = 250
export const STANDARD_SLOTS_PER_EPOCH = 32

export async function getGenesisTimeMs(): Promise<number | null> {
  try {
    const r = await nodeRequest<{ block: { timestamp: unknown } }>('get_block', { query: { block: 0 } })
    const s = parseTimestamp(r.block.timestamp)
    return s == null ? null : s * 1000
  } catch {
    return null
  }
}

export const slotStartMs = (clock: SlotClock, slot: number) => clock.genesisMs + slot * clock.slotMs
export const slotAt = (clock: SlotClock, ms: number) => Math.max(0, Math.floor((ms - clock.genesisMs) / clock.slotMs))
export const epochOf = (clock: SlotClock, slot: number) => Math.floor(slot / clock.slotsPerEpoch)
export const epochMs = (clock: Pick<SlotClock, 'slotMs' | 'slotsPerEpoch'>) => clock.slotMs * clock.slotsPerEpoch

// ─── Staking (docs/STAKING.md) ──────────────────────────────────────────────────

export interface StakingValidator {
  address: string
  status: string
  stake: string
  effective_stake: string
  delegated: string
  /** Own effective stake plus delegated: what the validator votes and is selected with. */
  weight: string
  earned: string
  activation_epoch: number | null
  exit_epoch: number | null
  slashed: boolean
}

export interface StakingPool {
  validator: string
  commission_bps: number
  next_commission_bps: number | null
  value: string
  total_shares: string
  share_price: string
  delegators: number
  warming_up: string
}

export interface StakingParams {
  reward_rate_bps_per_year: number
  reward_rate_per_epoch: string
  default_commission_bps: number
  min_delegation: string
  min_validator_stake: string
  warmup_epochs: number
  unbonding_epochs: number
  withdrawal_delay_epochs: number
}

export interface Delegations {
  address: string
  stakes: { validator: string; shares: string; value: string; warming_up: { amount: string; active_from_epoch: number }[] }[]
  payouts: { id: number; kind: string; amount: string; due_epoch: number; validator: string }[]
}

export const getStakingValidators = () => rpcCall<StakingValidator[]>('staking_getValidators')
export const getStakingPools = () => rpcCall<StakingPool[]>('staking_getPools')
export const getStakingParams = () => rpcCall<StakingParams>('staking_getParams')
export const getDelegations = (address: string) => rpcCall<Delegations>('staking_getDelegations', [address])

// ─── Governance (docs/GOVERNANCE.md) ────────────────────────────────────────────

export type ProposalStatus = 'voting' | 'passed' | 'rejected' | 'vetoed' | 'executed' | 'expired'

export interface Proposal {
  id: number
  proposer: string
  /** system_spend | freeze_master | approve_fork */
  action: string
  params: Record<string, unknown>
  memo: string
  created_at: number
  voting_ends: number
  /** Committee snapshot at creation: address → stake weight. */
  weights: Record<string, string>
  total_weight: string
  /** address → "yes" | "no" */
  votes: Record<string, string>
  yes: string
  no: string
  status: ProposalStatus | string
  passed_at: number | null
  timelock_ends: number | null
  execute_by: number | null
  vetoes: Record<string, string>
  veto_total: string
  resolved_at: number | null
  threshold_bps: number
}

export interface GovernanceStatus {
  height: number
  params: Record<string, number>
  master_controller: { authority: boolean; reason: string; frozen_at: number | null; sunset_height: number }
  fork_approvals: Array<{ fork: string; definition_hash: string; approved_at: number; proposal?: number; [key: string]: unknown }>
  open_proposals: number
  veto_escrow: string
  /** The validator committee: address → stake weight. */
  committee: Record<string, string>
  scheduled_forks: ScheduledFork[]
}

export const getGovernanceStatus = () => rpcCall<GovernanceStatus>('governance_getStatus')
export const getProposals = (status?: string, limit = 100) => rpcCall<Proposal[]>('governance_getProposals', [status ?? null, limit])
export const getProposal = (id: number) => rpcCall<Proposal>('governance_getProposal', [id])

// ─── Bridge (docs/BRIDGE.md) ────────────────────────────────────────────────────

export interface BridgeAsset {
  symbol: string
  address: string
  chain_id: number
  source_token: string
  decimals: number
  supply: string
  mint_authority: string
  [key: string]: unknown
}

export const getBridgeAssets = () => rpcCall<BridgeAsset[]>('bridge_getAssets')
export const getBridgeWithdrawals = (fromId = 1, limit = 100) => rpcCall<Array<Record<string, unknown>>>('bridge_getWithdrawals', [fromId, limit])
