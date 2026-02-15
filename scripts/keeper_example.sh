#!/usr/bin/env bash
set -euo pipefail

# Example keeper script: poll worker API periodically (health/indexer/purchases/risk-summary)
# Usage:
#   WORKER_API_URL=http://127.0.0.1:8788 ./scripts/keeper_example.sh
# Or add cron entries like:
#   * * * * * WORKER_API_URL=http://127.0.0.1:8788 bash /path/to/scripts/keeper_example.sh health indexer >/var/log/myshop/keeper_health.log 2>&1
#   */5 * * * * WORKER_API_URL=http://127.0.0.1:8788 bash /path/to/scripts/keeper_example.sh purchases risk >/var/log/myshop/keeper_purchases.log 2>&1

API_BASE="${WORKER_API_URL:-http://127.0.0.1:8788}"

health() {
  echo "== health $(date -Is)"
  curl -sS "${API_BASE}/health" | jq -c .
}

indexer() {
  echo "== indexer $(date -Is)"
  curl -sS "${API_BASE}/indexer" | jq -c .
}

purchases() {
  echo "== purchases (chain, limit=2000) $(date -Is)"
  curl -sS "${API_BASE}/purchases?source=chain&limit=2000" | jq -c '{ok, source, count, fromBlock, toBlock}'
}

risk() {
  echo "== risk-summary (index) $(date -Is)"
  curl -sS "${API_BASE}/risk-summary?source=index" | jq -c .
}

main() {
  cmds=("$@")
  if [ "${#cmds[@]}" -eq 0 ]; then
    cmds=(health indexer purchases risk)
  fi
  for c in "${cmds[@]}"; do
    case "$c" in
      health) health ;;
      indexer) indexer ;;
      purchases) purchases ;;
      risk) risk ;;
      *) echo "unknown cmd: $c" >&2; exit 1 ;;
    esac
  done
}

main "$@"
