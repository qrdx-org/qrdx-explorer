# QRDX Explorer Documentation

## Overview

QRDX Explorer is a professional blockchain explorer for the quantum-resistant QRDX network. It provides comprehensive tools for exploring blocks, transactions, addresses, and smart contracts with a modern, user-friendly interface.

## Features

### Address Explorer
- **Address Details**: View comprehensive information about any blockchain address
- **Wallet Claiming**: Users can claim addresses and set custom metadata
  - Custom name
  - Description
  - Profile image
- **Wallet Verification**: Sign messages to prove ownership
- **Token Holdings**: View all tokens held by an address
- **Transaction History**: Browse all transactions associated with an address
- **PnL Charts**: Weekly profit/loss visualization using TradingView lightweight-charts
- **Deterministic Identicons**: Unclaimed addresses show unique, generated block-style avatars

### Transaction Explorer
- **Transaction Details**: View full transaction information
- **Status**: Confirmed, pending, or failed status
- **Gas Information**: Gas used, gas price, and transaction fees
- **From/To Addresses**: Interactive links to address pages
- **Token Transfers**: View all token transfers within a transaction
- **Smart Contract Interactions**: Decode and display contract calls

### Block Explorer
- **Block Details**: View block information
- **Validator Information**: See who validated each block
- **Transaction List**: All transactions in a block
- **Block Time**: Timestamp and age
- **Gas Metrics**: Total gas used in the block

### Professional Features
- **Dark Theme**: Deep blue gradient theme with purple accents
- **Light Theme**: Sharp black and white minimalist design
- **Responsive Design**: Works on all device sizes
- **Real-time Updates**: Live data streaming (simulated for now)
- **Search**: Quick search across addresses, transactions, and blocks
- **Copy Functions**: Easy copy-to-clipboard for hashes and addresses
- **QR Codes**: Generate QR codes for addresses

## Routes

### Dynamic Routes

#### `/address/[address]`
Displays detailed information for a specific address:
- Address metadata (if claimed)
- Balance and value
- Token holdings
- Transaction history
- PnL chart
- Claim/Sign buttons

#### `/tx/[hash]`
Shows transaction details:
- Transaction hash
- Status
- Block number
- From/To addresses
- Value and token transfers
- Gas information
- Input data

#### `/block/[number]`
Displays block information:
- Block number
- Timestamp
- Validator
- Transaction count
- Gas used
- Block hash

### Static Routes

#### `/`
Homepage with:
- Search bar
- Network statistics
- Latest blocks
- Latest transactions
- Quick stats dashboard

#### `/blocks`
List view of all blocks with pagination

#### `/transactions`
List view of all transactions with filtering

#### `/addresses`
Top addresses by balance and activity

#### `/contracts`
List of verified smart contracts

## Components

### Core Components

#### `AddressAvatar`
Generates deterministic identicon-style images for addresses
- Uses address hash to create unique patterns
- Canvas-based rendering
- Caches generated images

#### `ClaimWalletDialog`
Modal for claiming an address:
- Input fields for name, description
- Image upload
- Validation
- Submit handler (frontend stub)

#### `SignMessageButton`
Wallet signature verification:
- Connects to wallet
- Requests signature
- Verifies ownership
- Displays verification status

#### `PnLChart`
Lightweight-charts integration:
- Weekly PnL visualization
- Candlestick or line chart
- Responsive sizing
- Mock data generation

#### `TokenHoldings`
Display token balances:
- Token name and symbol
- Balance
- USD value
- Token logo
- Percentage of portfolio

#### `TransactionList`
Transaction history table:
- Pagination
- Filtering by type
- Time sorting
- Status indicators

### UI Components

All built on shadcn/ui:
- Button
- Dialog
- Input
- Label
- Tabs
- Table
- Card
- Separator
- Tooltip
- ScrollArea

## Styling

### Theme Variables

#### Dark Theme (Default)
- Primary: Blue-purple gradient (#3b82f6 to #8b5cf6)
- Background: Deep blue-gray (#0f172a)
- Cards: Slightly lighter blue-gray (#1e293b)
- Text: Light gray (#e2e8f0)
- Accent: Bright blue (#60a5fa)

#### Light Theme
- Primary: Pure black (#000000)
- Background: White (#ffffff)
- Cards: Light gray (#f8fafc)
- Text: Black (#000000)
- Accent: Blue (#3b82f6)
- Sharp, high-contrast design

## Mock Data

All data is currently mocked for frontend development:

### Address Data
```typescript
interface Address {
  address: string
  balance: string
  usdValue: number
  claimed: boolean
  metadata?: {
    name: string
    description: string
    image: string
  }
  tokens: Token[]
  transactions: Transaction[]
}
```

### Transaction Data
```typescript
interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  status: 'confirmed' | 'pending' | 'failed'
  timestamp: number
  blockNumber: number
  gasUsed: string
  gasPrice: string
}
```

## Future Integration

### Backend API Endpoints
- `GET /api/address/:address` - Get address details
- `POST /api/address/:address/claim` - Claim address
- `POST /api/address/:address/verify` - Verify signature
- `GET /api/tx/:hash` - Get transaction details
- `GET /api/block/:number` - Get block details
- `GET /api/search?q=query` - Search all entities

### Web3 Integration
- Connect wallet (MetaMask, WalletConnect)
- Sign messages for verification
- Real transaction data from blockchain
- Live block updates via WebSocket

## Development

### Adding New Features
1. Create component in `/components`
2. Add route in `/app` if needed
3. Update documentation
4. Add types in `/lib/types.ts`
5. Create mock data helpers in `/lib/mock-data.ts`

### Best Practices
- Use TypeScript for type safety
- Follow shadcn/ui patterns
- Keep components small and focused
- Use Server Components where possible
- Client Components only when needed (interactivity)
- Optimize images with Next.js Image component
- Use proper semantic HTML
- Ensure accessibility (ARIA labels, keyboard navigation)

## Testing

### Manual Testing Checklist
- [ ] Search functionality
- [ ] Theme toggle (dark/light)
- [ ] Address page loads
- [ ] Transaction page loads
- [ ] Block page loads
- [ ] Claim wallet modal works
- [ ] Sign message works
- [ ] Charts render correctly
- [ ] Copy to clipboard works
- [ ] Mobile responsive
- [ ] Navigation works

### Test Data
Use these sample addresses for testing:
- `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0`
- `0x0000000000000000000000000000000000000001`
- `0x1234567890abcdef1234567890abcdef12345678`

## Deployment

Build and deploy:
```bash
pnpm build
pnpm start
```

Or deploy to Vercel/Cloudflare Pages directly from the repository.
