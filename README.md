# QRDX Explorer

A production-ready blockchain explorer for the QRDX (Quantum Resistant Decentralized eXchange) network. Built with Next.js, React, TypeScript, and Tailwind CSS.

## Features

- 🔍 **Real-time Blockchain Data**: Live transaction tracking, address monitoring, and block exploration
- 💰 **Token Holdings**: Track QRC-20, QRC-721, and QRC-1155 tokens with position history
- 📊 **Price Integration**: Real-time token pricing from QRDX Trade exchange
- 🧮 **Position Calculation**: Client-side token position tracking from transaction history
- 💼 **Portfolio Analytics**: P&L tracking, value charts, and detailed analytics
- � **Multi-Network Support**: Mainnet, Testnet, and Local networks with live status indicators
- 🔗 **URL Network Parameters**: Share specific network views via URL
- 🌙 **Dark/Light Theme**: Beautiful theming with system preference support
- 📱 **Responsive Design**: Optimized for desktop, tablet, and mobile
- ⚡ **Next.js 15**: Fast page loads with React Server Components
- 🎨 **shadcn/ui**: Modern, accessible UI components

## Network Configuration

The explorer supports three networks with customizable endpoints:

### Networks

1. **Mainnet** (default)
   - RPC: `https://rpc.qrdx.org`
   - Node API: `https://node.qrdx.org`
   - Chain ID: 1337

2. **Testnet**
   - RPC: `https://rpc.test.qrdx.org`
   - Node API: `https://node.test.qrdx.org`
   - Chain ID: 31337
   - *Endpoints are editable in the network selector*

3. **Local Network**
   - RPC: `http://localhost:3007`
   - Node API: `http://localhost:3007`
   - Chain ID: 31337
   - *Endpoints are editable in the network selector*

### Network Status Indicators

The network selector shows real-time status for each network:
- 🟢 **Green**: Both RPC and Node API are online
- 🟡 **Yellow**: Only one service is online (partial)
- 🔴 **Red**: Both services are offline
- 🔄 **Gray (pulsing)**: Checking status...

### URL Parameters

You can specify the network via URL parameters on supported pages (`/address/*`, `/tx/*`, `/`):

**Mainnet or Testnet:**
```
/address/0x123...?network=testnet
/tx/0xabc...?network=mainnet
```

**Local Network with custom endpoints:**
```
/address/0x123...?network=local&rpc=http://localhost:8545&api=http://localhost:3007
```

The URL parameters will:
- Override the saved network configuration
- Automatically connect to the specified network
- Allow sharing specific network views with others

## Architecture

### Backend Integration

The explorer connects to two backend services:

1. **QRDX Node API** (`http://127.0.0.1:3007`)
   - Blockchain data (transactions, blocks, addresses)
   - Token information (QRC-20/721/1155)
   - Real-time mempool data
   - See [openapi.json](./openapi.json) for full API specification

2. **QRDX Trade API** (`https://trade.qrdx.org/api/price/<token>`)
   - Real-time token prices
   - 24h volume and market cap
   - Price change percentages

### Key Features Implementation

- **Token Positions**: Calculated client-side from transaction logs (ERC-20 Transfer events)
- **USD Values**: Fetched from QRDX Trade with 30-second caching
- **Transaction History**: Paginated loading with full details
- **Smart Identicons**: Deterministic address avatars (works without backend)
- **Known Addresses**: Pre-configured metadata for special wallets (treasury, system wallets, etc.)

## Known Addresses

The explorer includes a pre-configured database of special addresses in [lib/known-addresses.json](lib/known-addresses.json). These addresses are automatically recognized and display custom names, descriptions, badges, and images.

### Included Special Addresses:

- **0x...001** - Garbage Collector (System Wallet, Burner)
- **0x...002** - Community Grant Wallet (Official, Community)
- **0x...003** - Developer Fund (Official, Development)
- **0x...004** - Ecosystem Fund (Official, Investment)
- **0x...005** - Staking Rewards Pool (System Wallet, Rewards)
- **0x...006** - Marketing & Partnerships (Official, Marketing)
- **0x...007** - Liquidity Pool Reserve (DeFi, Liquidity)
- **0x...008** - Treasury Multisig (Official, Multisig, Treasury)
- **0x...009** - Bug Bounty Program (Official, Security)
- **0x...00a** - Airdrop Distribution (Official, Airdrop)

### Adding New Known Addresses:

Edit [lib/known-addresses.json](lib/known-addresses.json):

```json
{
  "addresses": {
    "0xYourAddressHere": {
      "name": "Your Wallet Name",
      "description": "Description of the wallet's purpose",
      "image": "/images/wallets/your-image.png",
      "badges": [
        {
          "text": "Official",
          "color": "primary",
          "bgColor": "bg-primary/20",
          "textColor": "text-primary",
          "borderColor": "border-primary/30"
        }
      ],
      "category": "treasury",
      "verified": true,
      "featured": false
    }
  }
}
```

Available categories: `system`, `treasury`, `defi`, `security`, `distribution`

Badge colors: `primary`, `gray`, `red`, `green`, `blue`, `yellow`, `purple`, `pink`, `cyan`, `orange`, `violet`

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- pnpm (recommended) or npm
- **QRDX Node** running on port 3007 (or configure via environment variable)

### Installation

1. Clone the repository with submodules:
```bash
git clone --recursive https://github.com/qrdx-org/qrdx-explorer.git
cd qrdx-explorer
```

Or if already cloned, initialize submodules:
```bash
git submodule update --init --recursive
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
# QRDX Node API URL (default: http://127.0.0.1:3007)
NEXT_PUBLIC_QRDX_NODE_URL=http://127.0.0.1:3007

# Trade API URL (default: https://trade.qrdx.org/api/price)
NEXT_PUBLIC_TRADE_API_URL=https://trade.qrdx.org/api/price
```

4. Run the development server:
```bash
pnpm dev
# or
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser.

### Running the QRDX Node

The explorer requires a QRDX node to be running. Make sure you have the QRDX node started:

```bash
# In your QRDX node directory
python main.py  # or however you start your node
```

The node should be accessible at `http://127.0.0.1:3007` (default).

## API Integration

### OpenAPI Endpoints Used

The explorer integrates with these QRDX node endpoints:

- `/get_address_info` - Address balance, nonce, and transaction history
- `/get_address_tokens` - QRC-20/721/1155 tokens owned by address
- `/get_token_info` - Token metadata (name, symbol, decimals)
- `/get_transaction` - Transaction details by hash
- `/get_block` - Block information
- `/get_blocks` - Multiple blocks with pagination
- `/get_status` - Blockchain status (height, last hash)
- `/get_pending_transactions` - Mempool transactions

### New Endpoints to Implement

Add these endpoints to your QRDX node (as defined in `openapi.json`):

```python
@app.get("/get_address_tokens")
def get_address_tokens(address: str, token_type: Optional[str] = None):
    """Return all QRC-20/721/1155 tokens owned by address"""
    # Implementation needed
    pass

@app.get("/get_token_info")
def get_token_info(token_address: str):
    """Return token metadata (name, symbol, decimals, etc)"""
    # Implementation needed
    pass
```

### Pricing API

Token prices are fetched from the QRDX Trade exchange:

```
GET https://trade.qrdx.org/api/price/<token_address_or_symbol>

Response:
{
  "token": "QRDX",
  "price_usd": 3500.00,
  "volume_24h": 1000000,
  "change_24h": 5.2,
  "last_updated": 1706400000
}
```

## Project Structure

```
qrdx-explorer/
├── app/                    # Next.js app directory
│   ├── address/[address]/  # Address detail page
│   ├── tx/[hash]/         # Transaction detail page
│   ├── page.tsx           # Home page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── AddressAvatar.tsx  # Deterministic identicons
│   ├── Navigation.tsx     # Header navigation
│   ├── Footer.tsx         # Footer
│   └── ui/               # shadcn/ui components
├── lib/                   # Utilities and services
│   ├── api-client.ts      # QRDX node API client
│   ├── pricing-api.ts     # Token pricing service
│   ├── token-positions.ts # Position calculator
│   ├── identicon.ts       # Avatar generation
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Helper functions
├── openapi.json          # API specification
└── public/               # Static assets
```

## Key Libraries

### API Integration
- **lib/api-client.ts**: Type-safe API client for QRDX node
- **lib/pricing-api.ts**: Token price fetching with caching
- **lib/token-positions.ts**: Client-side position calculation from transaction logs

### Token Position Calculation

Positions are calculated from transaction history by:
1. Parsing QRC-20 Transfer events from transaction logs
2. Tracking incoming/outgoing transfers
3. Calculating balances and average buy prices
4. Computing unrealized P&L with current prices

Example:
```typescript
import { calculateTokenPositions, calculateTokenBalance } from '@/lib/token-positions'

const positions = calculateTokenPositions(transactions, userAddress, tokenAddress, decimals)
const balance = calculateTokenBalance(positions)
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm clean` - Clean build artifacts

## Submodules

This project includes the following git submodules:

- `submodules/qrdx-website` - Main QRDX website components
- `submodules/qrdx-trade` - QRDX trading platform components

To update submodules:
```bash
git submodule update --remote
```

## Tech Stack

- **Framework**: Next.js 16
- **UI Library**: React 19
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Theme**: next-themes
- **Language**: TypeScript

## License

ISC License - see LICENSE file for details

## QRDX Ecosystem

- [Main Website](https://qrdx.org)
- [Trading Platform](https://trade.qrdx.org)
- [Documentation](https://docs.qrdx.org)
- [GitHub](https://github.com/qrdx-org)
