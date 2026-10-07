# QRDX Explorer

The block explorer for the QRDX chain: blocks, transactions, accounts, validators, and the chain's native tokens and markets, read live from a QRDX node. Next.js 16, React 19, Tailwind CSS v4, lightweight-charts. Themed like [QRDX Trade](https://trade.qrdx.org): QRDX navy and blue in dark mode, black and white in light mode.

## What it shows

- **Home**: live height, finalized epoch, block times (chart), validators, 24-hour activity (chart), every market's last price, change and volume, latest blocks and latest user transactions.
- **Tokens** (`/tokens`): every native token with its best market, USD price, 24-hour change, 24-hour sparkline, market cap, volume and supply.
- **Addresses** (`/address/{address}`): a token address is detected (`get_token`) and shown as a **token page**: price chart (candles or line, 5m–1d, with volume), market cap, supply, flags (mintable, freezable), every market and pool it trades in, and recent trades. Any other address is an **account page**: QRDX balance, token holdings valued in USD, 30-day activity chart, full indexed history (filter by kind, validator votes hidden by default), open orders, LP positions, perps account, validator details, and a link to its PnL on QRDX Trade.
- **Transactions**: hourly activity for the last 24 hours (user transactions against validator votes), activity by type, and the latest indexed transactions. Exchange transactions show their parameters, fills and every account they touched, from the node's index and receipt.
- **Blocks, validators, network**: block lists and detail, the validator set, and node health (REST, JSON-RPC, WebSocket/SSE, peers, state roots).
- Search (`⌘K` or `/`) for a block, transaction, address or token symbol.
- **Wallet linking and profiles**: link QRDX Wallet (the browser extension, or the app on a phone by QR code over QRDX Connect, through trade.qrdx.org's relay). Then claim your address by signing a message, and set a display name, image, bio and links (website, X, Telegram, Discord, GitHub). A token's creator can claim the token and set its image, description and links; QRDX Trade and QRDX Wallet show the image. Claimed names show wherever the address appears, marked as claimed by the owner. The explorer never sends transactions. See qrdx-trade [docs/PROFILES.md](https://github.com/qrdx-org/qrdx-trade/blob/main/docs/PROFILES.md).

USD prices are reference data from the QRDX Trade API (`/api/v1/prices`, public index or pool route) and are labelled as such. Everything else comes from the node.

## Networks

| Network | Node API | JSON-RPC | Chain ID |
|---|---|---|---|
| Testnet (default) | `https://test.qrdx.org` | `https://test.qrdx.org/rpc` | 31337 |
| Mainnet | `https://node.qrdx.org` | `https://rpc.qrdx.org` | 1337 |
| Local | `http://127.0.0.1:3007` | `http://127.0.0.1:3007/rpc` | — |

Pick one in the network menu (endpoints are editable). A saved selection from older versions that points at `node.test.qrdx.org` or `rpc.test.qrdx.org` is moved to `test.qrdx.org` automatically.

Links can name the network: `/tx/{hash}?network=testnet`, `/address/{address}?network=mainnet`. The explorer switches to it, remembers it, and drops the parameter from the URL. QRDX Trade links here this way.

### Environment

```env
# Default network: mainnet | testnet | local (default testnet)
NEXT_PUBLIC_QRDX_NETWORK=testnet
# A specific node; shown as Local and used by default
NEXT_PUBLIC_QRDX_NODE_URL=http://127.0.0.1:3007
# The trade site and API for the Local network
NEXT_PUBLIC_QRDX_TRADE_LOCAL_URL=http://127.0.0.1:3100
NEXT_PUBLIC_QRDX_TRADE_LOCAL_API=http://127.0.0.1:3100/api/v1-test
# QRDX Connect relay and profile service (defaults: trade.qrdx.org/api/relay, /api/profiles).
# For local work, run the trade repo's relay (pnpm relay:dev) and point both at it.
NEXT_PUBLIC_QRDX_RELAY_URL=https://trade.qrdx.org/api/relay
NEXT_PUBLIC_QRDX_PROFILES_URL=https://trade.qrdx.org/api/profiles
```

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build
```

Open the dev server at `localhost`, not `127.0.0.1`: Next 16's dev server rejects the HMR socket from other origins and the page will not hydrate.

## Node integration

The explorer reads the node's REST API (rate-limited per endpoint in `lib/qrdx/client.ts`), its JSON-RPC, and its WebSocket/SSE stream. See [docs/NODE_INTEGRATION.md](docs/NODE_INTEGRATION.md) for the full mapping. The main reads:

| Endpoint | Used for |
|---|---|
| `get_status`, `get_block`, `get_blocks` | height, blocks (`get_blocks` is cost-limited per IP, so recent blocks are fetched one by one when a range would be expensive) |
| `get_address_info` | balance, nonce, validator info |
| `get_latest_transactions`, `get_address_history`, `get_indexed_transaction` | the transaction index: latest, per address (cursor paging, kind filters), and one transaction with the accounts it touched |
| `get_exchange_receipt` | an exchange transaction's result and fills |
| `get_token`, `get_tokens`, `get_token_balance` | token detection, the token list, holdings |
| `get_markets`, `get_candles`, `get_trades` | market tables, price charts, recent trades |
| `get_pools`, `get_lp_positions`, `get_spot_orders`, `get_perp_account` | pools and an account's trading state |
| `get_validators` | the validator set |

```text
app/
  page.tsx                 home
  tokens/                  token list
  address/[address]/       token page or account page
  transactions/  tx/[hash]/  blocks/  block/[number]/  validators/  network/
components/
  address/                 TokenView, AccountView
  charts/                  PriceChart (lightweight-charts), Bars, Sparkline
  chrome/                  Logo, SearchDialog, StatusBar
  explorer/                ChainProvider, HistoryTable, shared UI
  profile/                 ProfileEditor (claim / edit), ProfileButton, avatars and links
  tx/                      IndexedTxView (exchange transactions)
  wallet/                  ConnectButton and the link dialog
lib/qrdx/
  client.ts                networks, transport, rate limits
  api.ts                   blocks, transactions, addresses
  indexed.ts               transaction index, tokens, markets, USD prices, trade links
lib/connect/               QRDX Connect (identical to qrdx-trade's lib/connect)
lib/wallet/                the wallet link: extension discovery, phone provider, context
lib/profiles/              claim format (identical to qrdx-trade relay/src/profile-claim.ts), client
```

## License

ISC. See LICENSE.
