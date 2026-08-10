#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 03 · command cannot be started (run --json)"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - a failed spawn emits perf-profiler/error@1 instead of text only"
echo "    - errorType: spawn_failed"
echo "    - location names the exact command that failed"
echo "    - exit code is 1"
echo
echo "  How to read the output:"
echo "    - schema: perf-profiler/error@1  -> an error document, not a report"
echo "    - message ends with ENOENT (the OS reason the spawn failed)"
echo
echo "  Command:"
echo "    node dist/cli.js run --json -- ./definitely-missing-tool"
echo
echo "  Output:"
echo "----------------------------------------------------------------------"
OUT="$(mktemp)"
set +e
node dist/cli.js run --json -- ./definitely-missing-tool >"$OUT"
STATUS=$?
set -e
echo "  exit code: $STATUS"
echo
cat "$OUT"
echo
node playground/check-json.js ENOENT <"$OUT"
echo "----------------------------------------------------------------------"
echo
if [ "$STATUS" -eq 1 ]; then
  echo "  Result: PASS — spawn failure emits error@1 and exits 1"
else
  echo "  Result: FAIL — expected exit 1, got $STATUS"
  rm -f "$OUT"
  exit 1
fi
echo
rm -f "$OUT"
