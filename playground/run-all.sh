#!/usr/bin/env bash
# Builds the CLI and runs every playground scenario end to end.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  perf-profiler playground — scripted manual tests"
echo "======================================================================"
echo
echo "  Each scenario prints: what it verifies, the exact command, the real"
echo "  CLI output, a JSON sanity check, and a PASS/FAIL verdict."
echo
echo "  Scenarios:"
echo "    01  run --json · successful command           -> report@2, exit 0"
echo "    02  run --json · child exits 1 with diagnostics -> report@2 + stderrTail, exit 1"
echo "    03  run --json · command cannot be started    -> error@1 spawn_failed, exit 1"
echo "    04  unknown command (--json)                  -> error@1 invalid_args, exit 2"
echo "    05  report --json · missing file              -> error@1 file_not_found, exit 1"
echo "    06  errors without --json (text mode)         -> readable stderr, non-zero exits"
echo "    07  demo --startup/--query/--headless --json  -> report@2, exit 0"
echo "    08  run --json · large child output           -> bounded 8KB tail, exit 4"
echo
echo "======================================================================"
echo
echo "Building dist/ ..."
npm run build
echo

scenarios=(playground/scenarios/*.sh)
for i in "${!scenarios[@]}"; do
  n=$((i + 1))
  echo "======================================================================"
  bash "${scenarios[$i]}"
  echo "======================================================================"
  echo "  Scenario $n/${#scenarios[@]} finished."
  echo
done

echo "======================================================================"
echo "  All ${#scenarios[@]} playground scenarios finished."
echo "======================================================================"
