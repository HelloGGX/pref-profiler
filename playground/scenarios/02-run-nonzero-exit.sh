#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 02 · child exits non-zero with diagnostics (run --json)"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - stdout stays machine-readable: a single perf-profiler/report@2 doc"
echo "    - child stdout/stderr go to stderr, never mixed into the JSON"
echo "    - the failure reason (a compile error) is captured in report.error.stderrTail"
echo "    - the child exit code (1) is propagated"
echo
echo "  How to read the output:"
echo "    - error.errorType: nonzero_exit"
echo "    - error.stderrTail contains 'src/main.ts:12:23 ... TS2345 ...'"
echo
echo "  Command:"
echo "    node dist/cli.js run --json -- playground/fixtures/flaky.sh"
echo
echo "  Output:"
echo "----------------------------------------------------------------------"
OUT="$(mktemp)"
set +e
node dist/cli.js run --json -- playground/fixtures/flaky.sh >"$OUT"
STATUS=$?
set -e
echo "  exit code: $STATUS"
echo
cat "$OUT"
echo
node playground/check-json.js TS2345 <"$OUT"
echo "----------------------------------------------------------------------"
echo
if [ "$STATUS" -eq 1 ]; then
  echo "  Result: PASS — child exit code 1 propagated and reason captured"
else
  echo "  Result: FAIL — expected exit 1, got $STATUS"
  rm -f "$OUT"
  exit 1
fi
echo
rm -f "$OUT"
