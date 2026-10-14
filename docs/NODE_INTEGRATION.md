# QRDX Node Integration

How the explorer talks to a QRDX node (`submodules/qrdx-chain`, `qrdx/node/main.py`).
Everything runs in the browser against the node the user selects in the network switcher
(default `NEXT_PUBLIC_QRDX_NODE_URL`, falling back to `http://127.0.0.1:3007`).

## Code layout

| Module | Responsibility |
| --- | --- |
| `lib/qrdx/client.ts` | Network config, REST transport (`{ok, result}` envelopes, FastAPI errors, timeouts), client-side rate limiting that mirrors the node's `slowapi` limits, JSON-RPC, Prometheus parser |
| `lib/qrdx/api.ts` | High-level explorer API returning normalized `ExplorerBlock` / `ExplorerTransaction` models, caching, query-budget accounting, search resolution |
| `lib/qrdx/stream.ts` | Realtime feed: WebSocket `/ws` → SSE `/stream` → HTTP polling, with reconnect backoff; block hashes, reorg frames, and the node's clock offset |
| `lib/qrdx/live.ts` | `LiveChain`: the blocks the stream announced (five minutes' worth) and the headers views asked for, read by a paced pump; block-time measures from slots |
| `lib/qrdx/consensus.ts` | Chain spec, slot clock, `staking_*`, `governance_*`, `bridge_*` |
| `lib/qrdx/native.ts` | Decoders for block headers (PoS Python-repr, genesis JSON, legacy hex) and native UTXO / coinbase / genesis transactions |
| `lib/qrdx/evm.ts` | RLP decoder + secp256k1 sender recovery for raw EVM transactions (legacy, EIP-2930, EIP-1559) |
| `lib/qrdx/encoding.ts` | Hex/base58/unit helpers and a Python-literal parser |
| `components/explorer/ChainProvider.tsx` | One stream connection app-wide; finality, stream state, chain spec, slot clock and the live store via `useChain()`; the head via `useHead()` (outside the context, so a block does not re-render every page) |
| `components/explorer/hooks.ts` | `useLiveBlocks`, `useHeaders`, `useChainStats` (slot clock, block times, missed slots, finality lag) |

## Node surfaces used

| Node endpoint | Used for |
| --- | --- |
| `GET /get_status` | Tip height, tip hash, node ID; polling fallback |
| `GET /get_block?block=<height\|hash>` | Block header + native transactions |
| `GET /get_blocks?offset=<height>&limit=<n>` | Block ranges **with** `evm_transactions` / `exchange_transactions` sections, below height ~1,000 only (see the budget below) |
| `GET /chain_spec` (or `qrdx_chainSpec`) | Network, chain id, every chain-spec parameter (slot length, epoch length, staking and governance windows), forks, features, fork id, build |
| `GET /get_latest_transactions` | The transaction index: latest transactions, per-block counts, one block's transactions (cursor `height+1:0`) |
| `GET /get_transaction?tx_hash=` | Native UTXO/coinbase transactions and input resolution |
| `GET /get_address_info?address=&transactions_count_limit=0` | Canonical balance (account state → UTXO) and spendable outputs |
| `GET /get_address_tokens`, `GET /get_token_info` | QRC-20 holdings / metadata |
| `GET /get_top_addresses?order_by=balance` | Rich list (UTXO set) |
| `GET /get_validators`, `GET /get_attestations` | Validator set and indexed attestations |
| `GET /get_nodes` | Peers |
| `GET /get_pending_transactions` | Native mempool |
| `GET /get_unified_state_root` | State commitments |
| `GET /healthz`, `GET /readyz`, `GET /metrics` | Liveness, readiness, finality/peers/mempool gauges, RPC counters |
| `WS /ws`, `GET /stream` (SSE) | Realtime `hello` / `block` (height, hash, node time, finalized epoch) / `reorg` / `ping` frames (requires `QRDX_ENABLE_STREAMING=1`) |
| `POST /rpc` | `eth_chainId`, `web3_clientVersion`, `eth_getTransactionCount`, `eth_getCode`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_sendRawTransaction` (requires `QRDX_RPC_ENABLED=true`) |
| `POST /rpc` (always on) | `staking_getValidators`, `staking_getPools`, `staking_getParams`; `governance_getStatus`, `governance_getProposals`; `bridge_getAssets` |

## 250 ms slots

Since the node's sub-second migration (chain spec `SLOT_DURATION_MS`, standard 250, 32 slots an
epoch) the chain makes four blocks a second. What changed in the explorer:

- **Times come from slots.** Block timestamps are whole seconds, so four blocks share one. A block's
  slot is in its header; its time is `genesis + slot × SLOT_DURATION_MS`, exact to the millisecond. The
  gap between two blocks is (slot difference) × slot length, and a gap of more than one slot is a missed
  slot. The mean block time over any span needs two headers: (slot difference ÷ height difference).
- **The stream drives the lists.** A `block` frame carries height, hash and node time: enough for a row.
  Headers (proposer, slot, epoch, attestations, sections) for the heights a view asks for are read in
  ranges: `p2p_getBlocks(offset, limit)`, the JSON-RPC range peers sync with, returns up to 512 blocks with
  their transactions and EVM/exchange sections, is not charged against the `/get_blocks` query budget, and
  falls under JSON-RPC's 50 calls a second per client rather than `/get_block`'s 8. `LiveChain` sends one
  call per window of up to 64 wanted heights, at most 3 a second, never while the tab is hidden: each call
  carries the blocks since the last, so every block's header is read (about 3 calls a second of ~2 blocks).
  That path serialises every column as a string, `None` included; `getBlockHeaderRange` cleans the rows. On
  a node without the method it reads block by block with `/get_block`, which the client spaces evenly
  (6 a second) because the node counts fixed one-second windows.
- **Views re-render on a timer, not per block.** The store notifies at most every 120 ms; relative times
  share one ticker per interval.
- **Transaction counts come from the index**, polled every two seconds for the whole page, not from block
  sections.
- **Pages that need only the clock read no headers** (`useChainStats(0)`): governance, validators, a block page.
- **The node's limits may be shared by every visitor.** The node rate-limits by client IP, and a node
  behind a proxy that does not pass the visitor's IP on (uvicorn trusts `X-Forwarded-For` only from
  `FORWARDED_ALLOW_IPS`, default 127.0.0.1; a `cloudflared` sidecar is another container) counts all its
  visitors as one. The header pump therefore halves its rate on every refused or failed read and climbs back
  0.5 a second while reads succeed, and it does not use `nodeRequest`'s waiting 429 retries. The client's
  per-second windows are kept in `sessionStorage`, so a reload does not start a fresh second on top of the
  last page's. Running the node with `FORWARDED_ALLOW_IPS='*'` (behind the tunnel only) restores
  per-visitor limits.
- **A 429 carries no CORS headers**, so Safari reports it as a CORS failure ("due to access control
  checks"); the client treats it like any failed read.
| `POST /submit_tx` | Native transaction submission (`submitNativeTransaction`) |

## Node behaviours the explorer works around

These were verified against a local 2-validator testnet (`scripts/testnet.sh start --nodes 2 --validators 2`).

- **Block headers are stored raw.** `prev_block_hash`, `merkle_root` etc. are `NULL`; the header lives in
  `content` as `str(block.to_dict())` (Python repr) for PoS blocks and JSON for genesis. The header's
  `number` field is slot-derived and can differ from the DB height — the explorer treats the DB height as canonical.
- **EVM transactions are not indexed.** Included EVM txs exist only as raw hex in a block's EVM section
  (exposed by `/get_blocks`, not `/get_block`), and `eth_getTransactionByHash` returns `null` for them. The
  explorer decodes the raw payloads and locates transactions by scanning block sections.
- **`/get_blocks` is budgeted per IP** (`offset/100 + limit/50`, 1000/hour). At four blocks a second the
  chain passes height 100,000 in seven hours, after which one call spends the whole hour. The explorer uses it
  only below height ~1,000 and otherwise reads `/get_block` and the transaction index.
- **Genesis transaction hashes are stored as BLOBs**, so `/get_transaction` cannot find them. The explorer
  recomputes `sha256("genesis[:system]:{index}:{recipient}:{amount}")`.
- **`/get_address_info` with history enabled fails** on SQLite whenever an address has recorded transactions
  (`tx.hash()` is called on a dict). The explorer always passes `transactions_count_limit=0` and builds history
  by scanning recent blocks.
- **`/get_recent_blocks` returns rows of zeros** (`block_number: 0`, empty hash) and `/get_recent_transactions`
  is limited to 10 a minute, so neither is used.
- **The index reports genesis allocations' hashes as Python bytes reprs** (`"b'\\xe9…'"`); they are shown
  without a link.
- **`/get_top_addresses`** returns raw micro-QRDX sums from `unspent_outputs` on SQLite and ignores
  account-state balances.
- **Realtime streaming is opt-in.** With `QRDX_ENABLE_STREAMING` unset the WebSocket is refused (HTTP 403) and
  `/stream` returns 404; the explorer polls `/get_status` and seeds finality from `/metrics`.
- **JSON-RPC `eth_*` modules only load when `QRDX_RPC_ENABLED=true` and the vendored `py-evm` is importable.**
  `eth_chainId` now reports the chain spec's id (testnet: 7620).
- **`validator_*` is not served on testnet**; staking data comes from `staking_*`.

## Node issues observed (not explorer bugs)

- EVM value transfers are applied twice on import: sending 1 + 2 QRDX left the recipient with 6 QRDX on both
  nodes, and the sender down 6.
- `eth_getTransactionCount` stays `0x0` after the sender's transactions are included, and a replayed stale-nonce
  transaction is accepted by `eth_sendRawTransaction` (returns a hash) but never included.

## Running locally against a testnet

```bash
# In submodules/qrdx-chain (Python 3.11 env with requirements-v3.txt, liboqs, and `pip install ./py-evm`)
git submodule update --init py-evm
QRDX_ENABLE_STREAMING=1 bash scripts/testnet.sh start --nodes 2 --validators 2

# In the explorer
NEXT_PUBLIC_QRDX_NODE_URL=http://127.0.0.1:3007 pnpm dev
```

Switch nodes at runtime from the network switcher, or share a link with `?network=local&api=http://host:port`.
