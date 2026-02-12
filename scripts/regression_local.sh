set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_DIR="${ROOT_DIR}/demo"
DEMO_JSON="${DEMO_DIR}/demo.json"
WORKER_LOG="${DEMO_DIR}/worker.log"
INDEXER_STATE_PATH="${DEMO_DIR}/indexer_state.json"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

require_cmd anvil
require_cmd forge
require_cmd cast
require_cmd node
require_cmd pnpm
require_cmd nc
require_cmd curl

ANVIL_PORT="${ANVIL_PORT:-8545}"
WORKER_PORT="${WORKER_PORT:-8787}"
API_PORT="${API_PORT:-8788}"

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

find_free_port_excluding() {
  local port="$1"
  local exclude="$2"
  while [ "${port}" -eq "${exclude}" ] || is_port_open "${port}"; do
    port=$((port + 1))
  done
  echo "${port}"
}

wait_http_ok() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 80); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  echo "timeout waiting for ${label}: ${url}" >&2
  return 1
}

json_assert() {
  local label="$1"
  local json="$2"
  local js="$3"
  node -e "const label=process.argv[1];const json=process.argv[2];const obj=JSON.parse(json);const assert=(c,m)=>{if(!c){console.error(label+': '+m);process.exit(1)}};(${js})(obj,assert);" "$label" "$json"
}

DEPLOYER_PK="${DEPLOYER_PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
BUYER_PK="${BUYER_PK:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
RISK_SIGNER_PK="${RISK_SIGNER_PK:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}"
SERIAL_SIGNER_PK="${SERIAL_SIGNER_PK:-0x7c8521197cd533c301a916120409a63c809181144001a1c93a0280eb46c6495d}"

ANVIL_PORT="$(find_free_port "${ANVIL_PORT}")"
WORKER_PORT="$(find_free_port "${WORKER_PORT}")"
API_PORT="$(find_free_port_excluding "${API_PORT}" "${WORKER_PORT}")"
RPC_URL="http://127.0.0.1:${ANVIL_PORT}"

echo "rpc: ${RPC_URL}"
echo "worker: http://127.0.0.1:${WORKER_PORT}"
echo "api: http://127.0.0.1:${API_PORT}"

ANVIL_PID=""
WORKER_PID=""

cleanup() {
  if [ -n "${WORKER_PID}" ]; then
    kill "${WORKER_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${ANVIL_PID}" ]; then
    kill "${ANVIL_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "${DEMO_DIR}"

echo "starting anvil..."
anvil --port "${ANVIL_PORT}" --silent &
ANVIL_PID="$!"

echo "waiting for rpc..."
for _ in $(seq 1 80); do
  if cast block-number --rpc-url "${RPC_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
cast block-number --rpc-url "${RPC_URL}" >/dev/null

echo "deploying demo contracts..."
DEPLOY_OUT="$(
  (
    cd "${ROOT_DIR}/contracts"
    DEPLOYER_PK="${DEPLOYER_PK}" BUYER_PK="${BUYER_PK}" RISK_SIGNER_PK="${RISK_SIGNER_PK}" SERIAL_SIGNER_PK="${SERIAL_SIGNER_PK}" \
      forge script script/DeployDemo.s.sol:DeployDemo --rpc-url "${RPC_URL}" --broadcast -vv
  )
)"

DEPLOY_JSON="$(printf "%s" "${DEPLOY_OUT}" | node -e "let s='';process.stdin.on('data',d=>s+=d.toString());process.stdin.on('end',()=>{const lines=s.split(/\\r?\\n/).filter(Boolean);const jsonLine=[...lines].reverse().find(l=>l.trim().startsWith('{')&&l.trim().endsWith('}'));if(!jsonLine)process.exit(1);process.stdout.write(jsonLine.trim())})")"
printf "%s\n" "${DEPLOY_JSON}" > "${DEMO_JSON}"

DEMO_CHAIN_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).chainId)" "${DEMO_JSON}")"
DEMO_ITEMS="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).items)" "${DEMO_JSON}")"
DEMO_SHOPS="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).shops)" "${DEMO_JSON}")"
DEMO_USDC="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).usdc)" "${DEMO_JSON}")"
DEMO_ITEM_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).itemId)" "${DEMO_JSON}")"
DEMO_SHOP_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).shopId)" "${DEMO_JSON}")"
DEMO_BUYER="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).buyer)" "${DEMO_JSON}")"

echo "installing worker deps (if needed)..."
if [ ! -d "${ROOT_DIR}/worker/node_modules" ]; then
  (cd "${ROOT_DIR}/worker" && pnpm install)
fi

echo "starting worker (permit + api + watch)..."
rm -f "${INDEXER_STATE_PATH}"
(
  cd "${ROOT_DIR}/worker"
  MODE="both" ENABLE_API="1" ENABLE_INDEXER="1" RPC_URL="${RPC_URL}" CHAIN_ID="${DEMO_CHAIN_ID}" ITEMS_ADDRESS="${DEMO_ITEMS}" PORT="${WORKER_PORT}" API_PORT="${API_PORT}" \
    POLL_INTERVAL_MS="200" LOOKBACK_BLOCKS="50" \
    INDEXER_PERSIST="1" INDEXER_PERSIST_PATH="${INDEXER_STATE_PATH}" \
    SERIAL_SIGNER_PRIVATE_KEY="${SERIAL_SIGNER_PK}" RISK_SIGNER_PRIVATE_KEY="${RISK_SIGNER_PK}" \
    node src/index.js
) > "${WORKER_LOG}" 2>&1 &
WORKER_PID="$!"

wait_http_ok "http://127.0.0.1:${WORKER_PORT}/health" "worker /health"
wait_http_ok "http://127.0.0.1:${API_PORT}/health" "api /health"

echo "approve usdc for buyer..."
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_USDC}" \
  "approve(address,uint256)(bool)" "${DEMO_ITEMS}" "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" >/dev/null

echo "case B-02: buy with SerialPermit (success)"
DEADLINE="$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")"
EXTRA_DATA="$(
  curl -sS "http://127.0.0.1:${WORKER_PORT}/serial-permit?itemId=${DEMO_ITEM_ID}&buyer=${DEMO_BUYER}&serial=SERIAL-OK&deadline=${DEADLINE}" |
    node -e "process.stdin.on('data',d=>{const j=JSON.parse(d.toString());process.stdout.write(j.extraData)})"
)"
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_ITEMS}" \
  "buy(uint256,uint256,address,bytes)(uint256)" "${DEMO_ITEM_ID}" 1 "${DEMO_BUYER}" "${EXTRA_DATA}" >/dev/null

echo "waiting for indexer to include purchase..."
PURCHASES_JSON=""
for _ in $(seq 1 60); do
  PURCHASES_JSON="$(curl -sS "http://127.0.0.1:${API_PORT}/purchases?limit=20&include=enrich&source=index")"
  if node -e "const j=JSON.parse(process.argv[1]);process.exit(Number(j.count)>=1?0:1)" "${PURCHASES_JSON}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
json_assert "purchases after success buy (index)" "${PURCHASES_JSON}" "function(obj,assert){assert(obj.ok===true,'ok=false');assert(Number(obj.count)>=1,'count<1')}"

PURCHASES_CHAIN_JSON="$(curl -sS "http://127.0.0.1:${API_PORT}/purchases?limit=20&include=enrich&source=chain")"
json_assert "purchases after success buy (chain)" "${PURCHASES_CHAIN_JSON}" "function(obj,assert){assert(obj.ok===true,'ok=false');assert(Number(obj.count)>=1,'count<1')}"

echo "case B-02b: indexer persistence (restart keeps cached purchases)"
node -e "const fs=require('fs');const p=process.argv[1];if(!fs.existsSync(p)){console.error('missing indexer state file: '+p);process.exit(1)};const j=JSON.parse(fs.readFileSync(p,'utf8'));if(!Array.isArray(j.purchases)||j.purchases.length<1){console.error('expected persisted purchases >= 1');process.exit(1)}" "${INDEXER_STATE_PATH}"

kill "${WORKER_PID}" >/dev/null 2>&1 || true
WORKER_PID=""

(
  cd "${ROOT_DIR}/worker"
  MODE="both" ENABLE_API="1" ENABLE_INDEXER="1" RPC_URL="${RPC_URL}" CHAIN_ID="${DEMO_CHAIN_ID}" ITEMS_ADDRESS="${DEMO_ITEMS}" PORT="${WORKER_PORT}" API_PORT="${API_PORT}" \
    POLL_INTERVAL_MS="200" LOOKBACK_BLOCKS="50" \
    INDEXER_PERSIST="1" INDEXER_PERSIST_PATH="${INDEXER_STATE_PATH}" \
    SERIAL_SIGNER_PRIVATE_KEY="${SERIAL_SIGNER_PK}" RISK_SIGNER_PRIVATE_KEY="${RISK_SIGNER_PK}" \
    node src/index.js
) >> "${WORKER_LOG}" 2>&1 &
WORKER_PID="$!"

wait_http_ok "http://127.0.0.1:${WORKER_PORT}/health" "worker /health (restart)"
wait_http_ok "http://127.0.0.1:${API_PORT}/health" "api /health (restart)"

PERSISTED_PURCHASES_JSON="$(curl -sS "http://127.0.0.1:${API_PORT}/purchases?fromBlock=0&limit=20&include=enrich&source=index")"
json_assert "purchases after restart (index)" "${PERSISTED_PURCHASES_JSON}" "function(obj,assert){assert(obj.ok===true,'ok=false');assert(Number(obj.count)>=1,'count<1')}"

echo "case B-03: expired deadline (expected failure)"
EXPIRED_JSON="$(curl -sS "http://127.0.0.1:${WORKER_PORT}/serial-permit?itemId=${DEMO_ITEM_ID}&buyer=${DEMO_BUYER}&serial=SERIAL-EXPIRED&deadline=1&nonce=123")"
json_assert "permit rejects expired deadline" "${EXPIRED_JSON}" "function(obj,assert){assert(obj.ok===false,'ok=true');assert(obj.errorCode==='deadline_expired','errorCode!=deadline_expired')}"

echo "case B-04: nonce replay (first success, second expected failure)"
DEADLINE2="$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")"
EXTRA_REPLAY="$(
  curl -sS "http://127.0.0.1:${WORKER_PORT}/serial-permit?itemId=${DEMO_ITEM_ID}&buyer=${DEMO_BUYER}&serial=SERIAL-REPLAY&deadline=${DEADLINE2}&nonce=777" |
    node -e "process.stdin.on('data',d=>{const j=JSON.parse(d.toString());process.stdout.write(j.extraData)})"
)"
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_ITEMS}" \
  "buy(uint256,uint256,address,bytes)(uint256)" "${DEMO_ITEM_ID}" 1 "${DEMO_BUYER}" "${EXTRA_REPLAY}" >/dev/null

set +e
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_ITEMS}" \
  "buy(uint256,uint256,address,bytes)(uint256)" "${DEMO_ITEM_ID}" 1 "${DEMO_BUYER}" "${EXTRA_REPLAY}" >/dev/null
REPLAY_RC="$?"
set -e
if [ "${REPLAY_RC}" -eq 0 ]; then
  echo "expected nonce replay buy to fail, but it succeeded" >&2
  exit 1
fi

echo "case B-06: shop paused (expected failure)"
cast send --rpc-url "${RPC_URL}" --private-key "${DEPLOYER_PK}" "${DEMO_SHOPS}" "setShopPaused(uint256,bool)" "${DEMO_SHOP_ID}" true >/dev/null

DEADLINE3="$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")"
EXTRA_PAUSED="$(
  curl -sS "http://127.0.0.1:${WORKER_PORT}/serial-permit?itemId=${DEMO_ITEM_ID}&buyer=${DEMO_BUYER}&serial=SERIAL-PAUSED&deadline=${DEADLINE3}&nonce=888" |
    node -e "process.stdin.on('data',d=>{const j=JSON.parse(d.toString());process.stdout.write(j.extraData)})"
)"
set +e
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_ITEMS}" \
  "buy(uint256,uint256,address,bytes)(uint256)" "${DEMO_ITEM_ID}" 1 "${DEMO_BUYER}" "${EXTRA_PAUSED}" >/dev/null
PAUSED_RC="$?"
set -e
if [ "${PAUSED_RC}" -eq 0 ]; then
  echo "expected paused shop buy to fail, but it succeeded" >&2
  exit 1
fi

cast send --rpc-url "${RPC_URL}" --private-key "${DEPLOYER_PK}" "${DEMO_SHOPS}" "setShopPaused(uint256,bool)" "${DEMO_SHOP_ID}" false >/dev/null

echo "case I-04: item inactive (expected failure)"
cast send --rpc-url "${RPC_URL}" --private-key "${DEPLOYER_PK}" "${DEMO_ITEMS}" "setItemActive(uint256,bool)" "${DEMO_ITEM_ID}" false >/dev/null

DEADLINE4="$(node -e "console.log(Math.floor(Date.now()/1000)+3600)")"
EXTRA_INACTIVE="$(
  curl -sS "http://127.0.0.1:${WORKER_PORT}/serial-permit?itemId=${DEMO_ITEM_ID}&buyer=${DEMO_BUYER}&serial=SERIAL-INACTIVE&deadline=${DEADLINE4}&nonce=889" |
    node -e "process.stdin.on('data',d=>{const j=JSON.parse(d.toString());process.stdout.write(j.extraData)})"
)"
set +e
cast send --rpc-url "${RPC_URL}" --private-key "${BUYER_PK}" "${DEMO_ITEMS}" \
  "buy(uint256,uint256,address,bytes)(uint256)" "${DEMO_ITEM_ID}" 1 "${DEMO_BUYER}" "${EXTRA_INACTIVE}" >/dev/null
INACTIVE_RC="$?"
set -e
if [ "${INACTIVE_RC}" -eq 0 ]; then
  echo "expected inactive item buy to fail, but it succeeded" >&2
  exit 1
fi

cast send --rpc-url "${RPC_URL}" --private-key "${DEPLOYER_PK}" "${DEMO_ITEMS}" "setItemActive(uint256,bool)" "${DEMO_ITEM_ID}" true >/dev/null

echo "ok: regression passed"
echo "demo.json: ${DEMO_JSON}"
echo "worker.log: ${WORKER_LOG}"
