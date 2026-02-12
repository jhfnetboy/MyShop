set -euo pipefail

bash scripts/regression_local.sh
pnpm -C worker test
