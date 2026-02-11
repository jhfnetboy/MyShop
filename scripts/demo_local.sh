set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_JSON="$ROOT_DIR/demo/demo.json"
WORKER_LOG="$ROOT_DIR/demo/worker.log"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

require_cmd anvil
require_cmd forge
require_cmd cast
require_cmd node
require_cmd pnpm
require_cmd nc

ANVIL_PORT="${ANVIL_PORT:-8545}"
WORKER_PORT="${WORKER_PORT:-8787}"

is_port_open() {
  nc -z 127.0.0.1 "$1" >/dev/null 2>&1
}

find_free_port() {
  local port="$1"
  while is_port_open "${port}"; do
    port=$((port + 1))
  done
  echo "${port}"
}

ANVIL_PORT="$(find_free_port "${ANVIL_PORT}")"
RPC_URL="http://127.0.0.1:${ANVIL_PORT}"

DEPLOYER_PK="${DEPLOYER_PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
BUYER_PK="${BUYER_PK:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
RISK_SIGNER_PK="${RISK_SIGNER_PK:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}"
SERIAL_SIGNER_PK="${SERIAL_SIGNER_PK:-0x7c8521197cd533c301a916120409a63c809181144001a1c93a0280eb46c6495d}"

echo "rpc: ${RPC_URL}"

ANVIL_PID=""
WORKER_PID=""
STARTED_ANVIL="0"

cleanup() {
  if [ -n "${WORKER_PID}" ]; then
    kill "${WORKER_PID}" >/dev/null 2>&1 || true
  fi
  if [ "${STARTED_ANVIL}" = "1" ] && [ -n "${ANVIL_PID}" ]; then
    kill "${ANVIL_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "starting anvil..."
anvil --port "${ANVIL_PORT}" --silent &
ANVIL_PID="$!"
STARTED_ANVIL="1"

echo "waiting for rpc..."
for _ in $(seq 1 50); do
  if cast block-number --rpc-url "${RPC_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if ! cast block-number --rpc-url "${RPC_URL}" >/dev/null 2>&1; then
  echo "rpc not ready: ${RPC_URL}" >&2
  exit 1
fi

echo "deploying demo contracts..."
mkdir -p "${ROOT_DIR}/demo"
DEPLOY_JSON="$(
  (
    cd "${ROOT_DIR}/contracts"
    DEPLOYER_PK="${DEPLOYER_PK}" BUYER_PK="${BUYER_PK}" RISK_SIGNER_PK="${RISK_SIGNER_PK}" SERIAL_SIGNER_PK="${SERIAL_SIGNER_PK}" \
      forge script script/DeployDemo.s.sol:DeployDemo --rpc-url "${RPC_URL}" --broadcast -vv
  ) | node -e "let s='';process.stdin.on('data',d=>s+=d.toString());process.stdin.on('end',()=>{const lines=s.split(/\\r?\\n/).filter(Boolean);const jsonLine=[...lines].reverse().find(l=>l.trim().startsWith('{')&&l.trim().endsWith('}'));if(!jsonLine){process.exit(1)};console.log(jsonLine.trim())})"
)"
echo "${DEPLOY_JSON}" > "${DEMO_JSON}"

DEMO_CHAIN_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DEMO_JSON}','utf8')).chainId)")"
DEMO_ITEMS="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DEMO_JSON}','utf8')).items)")"
DEMO_USDC="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DEMO_JSON}','utf8')).usdc)")"
DEMO_ITEM_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DEMO_JSON}','utf8')).itemId)")"
DEMO_BUYER="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DEMO_JSON}','utf8')).buyer)")"

echo "installing worker deps (if needed)..."
if [ ! -d "${ROOT_DIR}/worker/node_modules" ]; then
  (cd "${ROOT_DIR}/worker" && pnpm install)
fi

echo "starting worker (watch + permit)..."
(
  cd "${ROOT_DIR}/worker"
  MODE="both" RPC_URL="${RPC_URL}" CHAIN_ID="${DEMO_CHAIN_ID}" ITEMS_ADDRESS="${DEMO_ITEMS}" PORT="${WORKER_PORT}" POLL_INTERVAL_MS="200" LOOKBACK_BLOCKS="50" \
    SERIAL_SIGNER_PRIVATE_KEY="${SERIAL_SIGNER_PK}" RISK_SIGNER_PRIVATE_KEY="${RISK_SIGNER_PK}" \
    node src/index.js
) > "${WORKER_LOG}" 2>&1 &
WORKER_PID="$!"

sleep 1

echo "approving usdc for buyer..."
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_USDC}" \
  "approve(address,uint256)(bool)" "${DEMO_ITEMS}" "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" >/dev/null

DEADLINE="$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")"
EXTRA_DATA="$(curl -s "http://127.0.0.1:${WORKER_PORT}/serial-permit?itemId=${DEMO_ITEM_ID}&buyer=${DEMO_BUYER}&serial=SERIAL-001&deadline=${DEADLINE}" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d.toString());console.log(j.extraData)})")"

echo "buying item..."
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_ITEMS}" \
  "buy(uint256,uint256,address,bytes)(uint256)" "${DEMO_ITEM_ID}" 1 "${DEMO_BUYER}" "${EXTRA_DATA}" >/dev/null

echo "waiting for Purchased payload..."
for _ in $(seq 1 80); do
  if [ -f "${WORKER_LOG}" ] && grep -q "\"txHash\"" "${WORKER_LOG}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [ -f "${WORKER_LOG}" ] && grep -q "\"txHash\"" "${WORKER_LOG}" 2>/dev/null; then
  echo "Purchased payload:"
  tail -n 120 "${WORKER_LOG}"
else
  echo "Purchased payload not found in ${WORKER_LOG}" >&2
  tail -n 120 "${WORKER_LOG}" || true
  exit 1
fi
