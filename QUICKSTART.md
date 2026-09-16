# QRDX Explorer - Quick Reference

## Environment Setup
```bash
# .env.local
NEXT_PUBLIC_QRDX_NODE_URL=http://127.0.0.1:3007
NEXT_PUBLIC_TRADE_API_URL=https://trade.qrdx.org/api/price
```

## Running Locally
```bash
pnpm install
pnpm dev
# Open http://localhost:3000
```

## API Endpoints

### QRDX Node (http://127.0.0.1:3007)

```typescript
// Get address info
GET /get_address_info?address=0x...&transactions_count_limit=50

// Get transaction
GET /get_transaction?tx_hash=0x...

// Get token holdings ⚠️ NEEDS IMPLEMENTATION
GET /get_address_tokens?address=0x...

// Get token info ⚠️ NEEDS IMPLEMENTATION
GET /get_token_info?token_address=0x...
```

### Pricing API (https://trade.qrdx.org)

```typescript
// Get token price
GET /api/price/QRDX
GET /api/price/0x... // by address
```

## Using the Node Integration

```typescript
import { getAddress, getAddressActivity, getTransaction, getLatestBlocks } from '@/lib/qrdx'
import { getTokenPrice } from '@/lib/pricing-api'

const account = await getAddress('0xPQ…')
const history = await getAddressActivity(account.address, { spendableOutputs: account.spendableOutputs })
const { transaction } = await getTransaction('0x…')
const blocks = await getLatestBlocks(10)
const price = await getTokenPrice('QRDX')
```

See [docs/NODE_INTEGRATION.md](docs/NODE_INTEGRATION.md) for the full endpoint mapping and known node limitations.

## File Structure

```
lib/qrdx/            # Node client: REST, JSON-RPC, WebSocket/SSE stream, decoders
lib/format.ts        # Display formatting
lib/pricing-api.ts   # Token pricing
components/explorer/ # ChainProvider (live chain context) and shared explorer UI
app/                 # Pages: blocks, block, transactions, tx, address, addresses, validators, network
```

## Testing

```bash
# Test QRDX Node
curl "http://127.0.0.1:3007/get_status"

# Test address endpoint
curl "http://127.0.0.1:3007/get_address_info?address=0x..."

# Test pricing
curl "https://trade.qrdx.org/api/price/QRDX"
```

## Common Issues

### "Error Loading Address"
- ✅ Check QRDX node is running on port 3007
- ✅ Verify `NEXT_PUBLIC_QRDX_NODE_URL` in `.env.local`

### "No tokens found"
- ⚠️ Need to implement `/get_address_tokens` endpoint
- See `docs/BACKEND_IMPLEMENTATION.md`

### Positions not showing
- ⚠️ Ensure `/get_transaction` includes `logs` array
- Transfer events needed for position tracking

## Quick Backend Implementation

```python
# Minimal /get_address_tokens implementation
@app.get("/get_address_tokens")
def get_address_tokens(address: str, token_type: Optional[str] = None):
    # Query token balances for this address
    tokens = []
    for contract in get_token_contracts():
        balance = call_contract(contract, "balanceOf", [address])
        if balance > 0:
            info = get_token_metadata(contract)
            tokens.append({
                "token": {
                    "address": contract,
                    "symbol": info["symbol"],
                    "name": info["name"],
                    "decimals": info["decimals"],
                    "type": "QRC-20"
                },
                "balance": str(balance),
                "balance_formatted": balance / (10 ** info["decimals"])
            })
    return {"address": address, "tokens": tokens, "total_count": len(tokens)}
```

## Resources

- Full docs: `docs/BACKEND_IMPLEMENTATION.md`
- API spec: `openapi.json`
- Main README: `README.md`
- Production status: `PRODUCTION_READY.md`
