#!/usr/bin/env bash
#
# Start a local QRDX testnet (submodules/qrdx-chain) and the explorer dev server
# against it. The testnet is stopped when the dev server exits (Ctrl+C).
#
# Environment:
#   QRDX_VENV          Python env for the node (default: submodules/qrdx-chain/venv, else python3 on PATH)
#   QRDX_NODES         Number of nodes       (default: 2)
#   QRDX_VALIDATORS    Number of validators  (default: 2)
#   OQS_INSTALL_PATH   liboqs install prefix (default: ~/_oqs when present)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN="$ROOT/submodules/qrdx-chain"
NODES="${QRDX_NODES:-2}"
VALIDATORS="${QRDX_VALIDATORS:-2}"
NODE_URL="http://127.0.0.1:3007"

if [ ! -f "$CHAIN/scripts/testnet.sh" ]; then
  echo "error: $CHAIN is empty — run: git submodule update --init submodules/qrdx-chain" >&2
  exit 1
fi

# Next.js allows one dev server per project; fail before booting a testnet we'd tear down.
LOCK="$ROOT/.next/dev/lock"
if [ -f "$LOCK" ]; then
  lock_pid="$(grep -o '"pid":[0-9]*' "$LOCK" | cut -d: -f2)"
  if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
    lock_url="$(grep -o '"appUrl":"[^"]*"' "$LOCK" | cut -d'"' -f4)"
    echo "error: a Next.js dev server is already running for this project (pid $lock_pid, $lock_url)." >&2
    echo "Stop it first (kill $lock_pid), then re-run pnpm dev:node." >&2
    exit 1
  fi
fi

VENV="${QRDX_VENV:-$CHAIN/venv}"
if [ -x "$VENV/bin/python3" ]; then
  export PATH="$VENV/bin:$PATH"
fi

if [ -z "${OQS_INSTALL_PATH:-}" ] && [ -d "$HOME/_oqs" ]; then
  export OQS_INSTALL_PATH="$HOME/_oqs"
fi
if [ -n "${OQS_INSTALL_PATH:-}" ]; then
  export LD_LIBRARY_PATH="$OQS_INSTALL_PATH/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

if ! python3 -W ignore -c "import fastapi, aiosqlite, oqs" >/dev/null 2>&1; then
  cat >&2 <<EOF
error: node Python dependencies are missing for $(command -v python3)
  cd submodules/qrdx-chain
  python3 -m venv venv && . venv/bin/activate
  sed 's/^pyrlp/rlp/' requirements-v3.txt > /tmp/qrdx-req.txt   # 'pyrlp' is published as 'rlp'
  pip install -r /tmp/qrdx-req.txt aiosqlite
  git submodule update --init py-evm && pip install ./py-evm   # JSON-RPC eth_* support
(or set QRDX_VENV to an existing environment)
EOF
  exit 1
fi

# testnet.sh rewrites this tracked file on start; restore it on exit if it was clean.
GENESIS_META="qrdx/genesis_metadata.json"
restore_meta=false
if git -C "$CHAIN" diff --quiet -- "$GENESIS_META" 2>/dev/null; then
  restore_meta=true
fi

cleanup() {
  trap - EXIT INT TERM
  echo
  echo "Stopping QRDX testnet…"
  (cd "$CHAIN" && bash scripts/testnet.sh stop >/dev/null 2>&1) || true
  if $restore_meta; then
    git -C "$CHAIN" checkout -- "$GENESIS_META" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting QRDX testnet ($NODES nodes, $VALIDATORS validators)…"
cd "$CHAIN"
bash scripts/testnet.sh stop >/dev/null 2>&1 || true
QRDX_ENABLE_STREAMING=1 bash scripts/testnet.sh start --nodes "$NODES" --validators "$VALIDATORS" \
  > "$CHAIN/testnet-start.log" 2>&1 || {
  echo "error: testnet failed to start — see submodules/qrdx-chain/testnet-start.log" >&2
  exit 1
}

printf "Waiting for node at %s " "$NODE_URL"
for _ in $(seq 1 90); do
  if curl -sf "$NODE_URL/readyz" >/dev/null 2>&1; then
    echo "ready"
    break
  fi
  printf "."
  sleep 1
done
if ! curl -sf "$NODE_URL/readyz" >/dev/null 2>&1; then
  echo
  echo "error: node did not become ready — see submodules/qrdx-chain/testnet/logs/node0/node.log" >&2
  exit 1
fi

cd "$ROOT"
NEXT_PUBLIC_QRDX_NODE_URL="$NODE_URL" bun next dev
