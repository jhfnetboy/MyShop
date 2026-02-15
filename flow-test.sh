set -euo pipefail

./build-test-contracts.sh
pnpm -C worker regression:worker
pnpm -C frontend check
pnpm -C frontend build
RUN_E2E=1 bash scripts/regression_local.sh
