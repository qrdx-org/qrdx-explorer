# QRDX Node Integration

How the explorer talks to a QRDX node (`submodules/qrdx-chain`, `qrdx/node/main.py`).
Everything runs in the browser against the node the user selects in the network switcher
(default `NEXT_PUBLIC_QRDX_NODE_URL`, falling back to `http://127.0.0.1:3007`).

## Code layout

| Module | Responsibility |
| --- | --- |
| `lib/qrdx/client.ts` | Network config, REST transport (`{ok, result}` envelopes, FastAPI errors, timeouts), client-side rate limiting that mirrors the node's `slowapi` limits, JSON-RPC, Prometheus parser |
| `lib/qrdx/api.ts` | High-level explorer API returning normalized `ExplorerBlock` / `ExplorerTransaction` models, caching, query-budget accounting, search resolution |
| `lib/qrdx/stream.ts` | Realtime feed: WebSocket `/ws` → SSE `/stream` → HTTP polling, with reconnect backoff |
| `lib/qrdx/native.ts` | Decoders for block headers (PoS Python-repr, genesis JSON, legacy hex) and native UTXO / coinbase / genesis transactions |
| `lib/qrdx/evm.ts` | RLP decoder + secp256k1 sender recovery for raw EVM transactions (legacy, EIP-2930, EIP-1559) |
| `lib/qrdx/encoding.ts` | Hex/base58/unit helpers and a Python-literal parser |
| `components/explorer/ChainProvider.tsx` | One stream connection app-wide; exposes tip height, finality, stream state and block subscriptions via `useChain()` |

## Node surfaces used

| Node endpoint | Used for |
| --- | --- |
| `GET /get_status` | Tip height, tip hash, node ID; polling fallback |
| `GET /get_block?block=<height\|hash>` | Block header + native transactions |
| `GET /get_blocks?offset=<height>&limit=<n>` | Block ranges **with** `evm_transactions` / `exchange_transactions` sections |
| `GET /get_transaction?tx_hash=` | Native UTXO/coinbase transactions and input resolution |
| `GET /get_address_info?address=&transactions_count_limit=0` | Canonical balance (account state → UTXO) and spendable outputs |
| `GET /get_address_tokens`, `GET /get_token_info` | QRC-20 holdings / metadata |
| `GET /get_top_addresses?order_by=balance` | Rich list (UTXO set) |
| `GET /get_validators`, `GET /get_attestations` | Validator set and indexed attestations |
| `GET /get_nodes` | Peers |
| `GET /get_pending_transactions` | Native mempool |
| `GET /get_unified_state_root` | State commitments |
| `GET /healthz`, `GET /readyz`, `GET /metrics` | Liveness, readiness, finality/peers/mempool gauges, RPC counters |
| `WS /ws`, `GET /stream` (SSE) | Realtime `hello` / `block` / `ping` frames (requires `QRDX_ENABLE_STREAMING=1`) |
| `POST /rpc` | `eth_chainId`, `web3_clientVersion`, `eth_getTransactionCount`, `eth_getCode`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_sendRawTransaction` (requires `QRDX_RPC_ENABLED=true`) |
| `POST /submit_tx` | Native transaction submission (`submitNativeTransaction`) |

## Node behaviours the explorer works around

These were verified against a local 2-validator testnet (`scripts/testnet.sh start --nodes 2 --validators 2`).

- **Block headers are stored raw.** `prev_block_hash`, `merkle_root` etc. are `NULL`; the header lives in
  `content` as `str(block.to_dict())` (Python repr) for PoS blocks and JSON for genesis. The header's
  `number` field is slot-derived and can differ from the DB height — the explorer treats the DB height as canonical.
- **EVM transactions are not indexed.** Included EVM txs exist only as raw hex in a block's EVM section
  (exposed by `/get_blocks`, not `/get_block`), and `eth_getTransactionByHash` returns `null` for them. The
  explorer decodes the raw payloads and locates transactions by scanning block sections.
- **`/get_blocks` is budgeted per IP** (`offset/100 + limit/50`, 1000/hour). The explorer tracks spend and
  falls back to paced `/get_block` calls, marking blocks whose EVM/exchange sections could not be loaded. On
  long chains (high heights) sections are effectively unavailable through this endpoint.
- **Genesis transaction hashes are stored as BLOBs**, so `/get_transaction` cannot find them. The explorer
  recomputes `sha256("genesis[:system]:{index}:{recipient}:{amount}")`.
- **`/get_address_info` with history enabled fails** on SQLite whenever an address has recorded transactions
  (`tx.hash()` is called on a dict). The explorer always passes `transactions_count_limit=0` and builds history
  by scanning recent blocks.
- **`/get_recent_blocks` and `/get_recent_transactions` always fail** on SQLite (DB helpers are called without
  their required `offset`), so they are not used.
- **`/get_top_addresses`** returns raw micro-QRDX sums from `unspent_outputs` on SQLite and ignores
  account-state balances.
- **Realtime streaming is opt-in.** With `QRDX_ENABLE_STREAMING` unset the WebSocket is refused (HTTP 403) and
  `/stream` returns 404; the explorer polls `/get_status` and seeds finality from `/metrics`.
- **JSON-RPC `eth_*` modules only load when `QRDX_RPC_ENABLED=true` and the vendored `py-evm` is importable.**
  `eth_chainId` reports the hard-coded `88888` rather than the configured `QRDX_CHAIN_ID`; `net_version` and
  `qrdx_getNetworkInfo` raise because the RPC context has no config.

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
