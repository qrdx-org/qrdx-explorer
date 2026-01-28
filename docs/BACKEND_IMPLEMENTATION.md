# QRDX Explorer - Backend Implementation Guide

This document outlines the backend endpoints that need to be implemented in your QRDX node to fully support the explorer.

## Quick Start

The explorer is now **production-ready** and uses real API calls. To get it working:

1. **Start your QRDX node** on port 3007 (or configure `NEXT_PUBLIC_QRDX_NODE_URL`)
2. **Implement the new endpoints** listed below (especially `/get_address_tokens` and `/get_token_info`)
3. **Set up the pricing API** stub or use the real QRDX Trade exchange

## Architecture Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  QRDX Explorer  │─────▶│   QRDX Node      │      │  QRDX Trade     │
│  (Frontend)     │      │   API (Port 3007)│      │  Pricing API    │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                         │                         │
        │                         │                         │
        ├─ Address Info ──────────┤                         │
        ├─ Transactions ──────────┤                         │
        ├─ Token Holdings ────────┤                         │
        └─ Token Prices ──────────────────────────────────┘
```

## Existing Endpoints (Already Working)

These endpoints from your `openapi.json` are already integrated:

### ✅ `/get_address_info`
**Status**: Working  
**Usage**: Fetches address balance, nonce, and transaction history

```python
@app.get("/get_address_info")
def get_address_info(
    address: str,
    transactions_count_limit: int = 5,
    page: int = 1,
    show_pending: bool = False,
    verify: bool = False
):
    # Your existing implementation
    return {
        "address": address,
        "balance": "1000.5",
        "nonce": 42,
        "transactions": [...],
        "total_transactions": 150
    }
```

### ✅ `/get_transaction`
**Status**: Working  
**Usage**: Fetches transaction details by hash

```python
@app.get("/get_transaction")
def get_transaction(tx_hash: str, verify: bool = False):
    # Your existing implementation
    return {
        "hash": tx_hash,
        "from": "0x...",
        "to": "0x...",
        "value": "10.5",
        "gas_price": "1000000000",
        "gas_used": "21000",
        "status": "confirmed",
        "timestamp": 1706400000,
        "block_number": 12345,
        "logs": [...]  # Important for token transfers!
    }
```

### ✅ `/get_block`
**Status**: Working  
**Usage**: Fetches block information

### ✅ `/get_status`
**Status**: Working  
**Usage**: Returns blockchain height and status

## New Endpoints to Implement

These endpoints are **required** for full functionality:

### 🔴 `/get_address_tokens` (HIGH PRIORITY)

**Purpose**: Returns all QRC-20/721/1155 tokens owned by an address

**Implementation**:
```python
@app.get("/get_address_tokens")
def get_address_tokens(
    address: str,
    token_type: Optional[str] = None  # "QRC-20", "QRC-721", "QRC-1155"
):
    """
    Get all tokens owned by an address.
    
    Implementation strategy:
    1. Query all token contracts that have interacted with this address
    2. For each token, call balanceOf(address) if QRC-20
    3. For QRC-721, check token ownership records
    4. For QRC-1155, check balance for each token ID
    """
    
    # Example implementation (pseudo-code)
    tokens = []
    
    # Get all token contracts from transaction logs
    token_contracts = get_token_contracts_for_address(address)
    
    for contract in token_contracts:
        token_info = get_token_info(contract)
        
        # Call the token's balanceOf method
        balance = call_contract(contract, "balanceOf", [address])
        
        if balance > 0:
            tokens.append({
                "token": {
                    "address": contract,
                    "symbol": token_info["symbol"],
                    "name": token_info["name"],
                    "decimals": token_info["decimals"],
                    "type": token_info["type"]
                },
                "balance": str(balance),
                "balance_formatted": balance / (10 ** token_info["decimals"])
            })
    
    return {
        "address": address,
        "tokens": tokens,
        "total_count": len(tokens)
    }
```

**Response Format**:
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "tokens": [
    {
      "token": {
        "address": "0x...",
        "symbol": "USDT",
        "name": "Tether USD",
        "decimals": 6,
        "type": "QRC-20"
      },
      "balance": "1000000000",
      "balance_formatted": 1000.0
    }
  ],
  "total_count": 1
}
```

### 🔴 `/get_token_info` (HIGH PRIORITY)

**Purpose**: Returns metadata about a token contract

**Implementation**:
```python
@app.get("/get_token_info")
def get_token_info(token_address: str):
    """
    Get token metadata.
    
    Implementation strategy:
    1. Call token contract's name(), symbol(), decimals()
    2. Determine token type (QRC-20/721/1155) by checking interfaces
    3. Optionally fetch total supply
    """
    
    # Call contract methods
    name = call_contract(token_address, "name", [])
    symbol = call_contract(token_address, "symbol", [])
    decimals = call_contract(token_address, "decimals", [])
    total_supply = call_contract(token_address, "totalSupply", [])
    
    # Determine type by checking supported interfaces
    token_type = "QRC-20"  # Default
    if supports_interface(token_address, "0x80ac58cd"):  # ERC-721
        token_type = "QRC-721"
    elif supports_interface(token_address, "0xd9b67a26"):  # ERC-1155
        token_type = "QRC-1155"
    
    return {
        "address": token_address,
        "name": name,
        "symbol": symbol,
        "decimals": decimals,
        "total_supply": str(total_supply),
        "type": token_type
    }
```

**Response Format**:
```json
{
  "address": "0x...",
  "name": "Tether USD",
  "symbol": "USDT",
  "decimals": 6,
  "total_supply": "1000000000000",
  "type": "QRC-20"
}
```

## Transaction Logs (Critical for Position Tracking)

The explorer calculates token positions from transaction logs. Make sure your `/get_transaction` endpoint returns **complete log data**:

```python
{
  "hash": "0x...",
  "logs": [
    {
      "address": "0x...",  # Token contract address
      "topics": [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",  # Transfer event signature
        "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb1",  # from (padded)
        "0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045"   # to (padded)
      ],
      "data": "0x00000000000000000000000000000000000000000000000000000000000003e8",  # amount
      "log_index": 0,
      "transaction_index": 5,
      "block_number": 12345
    }
  ]
}
```

### Key Event Signatures

```javascript
// QRC-20 Transfer
Transfer(address indexed from, address indexed to, uint256 value)
// Signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef

// QRC-721 Transfer
Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
// Signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef

// QRC-20 Approval
Approval(address indexed owner, address indexed spender, uint256 value)
// Signature: 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
```

## Pricing API Integration

### Option 1: Use Real QRDX Trade API (Recommended)

The explorer expects this endpoint format:

```
GET https://trade.qrdx.org/api/price/<token_address_or_symbol>

Response:
{
  "token": "QRDX",
  "price_usd": 3500.00,
  "price_qrdx": 1.0,
  "volume_24h": 1000000,
  "change_24h": 5.2,
  "market_cap": 35000000000,
  "last_updated": 1706400000
}
```

### Option 2: Create a Stub Pricing Endpoint

For development/testing, create a simple pricing stub in your QRDX node:

```python
@app.get("/api/price/{token}")
def get_token_price(token: str):
    """
    Stub pricing endpoint for development.
    Replace with real pricing logic or proxy to exchange.
    """
    # Stub prices
    stub_prices = {
        "QRDX": 3500.00,
        "ETH": 3000.00,
        "BTC": 60000.00,
        "USDT": 1.00,
        "USDC": 1.00,
    }
    
    price = stub_prices.get(token.upper(), 0.0)
    
    return {
        "token": token,
        "price_usd": price,
        "volume_24h": 1000000,
        "change_24h": 0.0,
        "last_updated": int(time.time())
    }
```

## Testing Your Implementation

### 1. Test Address Info
```bash
curl "http://127.0.0.1:3007/get_address_info?address=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
```

### 2. Test Token Holdings
```bash
curl "http://127.0.0.1:3007/get_address_tokens?address=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
```

### 3. Test Transaction
```bash
curl "http://127.0.0.1:3007/get_transaction?tx_hash=0x..."
```

### 4. Test Pricing
```bash
curl "https://trade.qrdx.org/api/price/QRDX"
```

## Frontend Features Summary

The explorer now includes:

✅ **Real-time address tracking** with live balance and transaction history  
✅ **Token portfolio management** with automatic position tracking  
✅ **USD value calculation** using real-time pricing  
✅ **Transaction detail pages** with full log parsing  
✅ **Position history** calculated from Transfer events  
✅ **P&L tracking** with unrealized gains/losses  
✅ **Error handling** with helpful messages when APIs are unavailable  
✅ **Loading states** for all async operations  
✅ **Responsive design** optimized for all devices  

## Next Steps

1. **Implement `/get_address_tokens`** - This is the highest priority endpoint
2. **Implement `/get_token_info`** - Required for token metadata
3. **Ensure transaction logs are complete** - Critical for position tracking
4. **Set up pricing API** - Either real or stub for development
5. **Test with real addresses** - Verify data accuracy
6. **Deploy to production** - The explorer is ready!

## Questions?

If you need help implementing any of these endpoints, refer to:
- [openapi.json](../openapi.json) - Full API specification
- [lib/api-client.ts](../lib/api-client.ts) - Frontend API usage
- [lib/token-positions.ts](../lib/token-positions.ts) - Position calculation logic
