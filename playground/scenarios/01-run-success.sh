#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 01 · run --json with a successful command"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - stdout is a single parseable perf-profiler/report@2 document"
echo "    - exit code is 0 (success is not reported as an error)"
echo "    - the report has no error field"
echo
echo "  How to read the output:"
echo "    - schema: perf-profiler/report@2  -> normal performance report"
echo "    - errorType: n/a                  -> no failure attached"
echo
echo "  Command:"
echo "    node dist/cli.js run --json -- /bin/echo 'hello from child'"
echo
echo "  Output:"
echo "----------------------------------------------------------------------"
OUT="$(mktemp)"
set +e
node dist/cli.js run --json -- /bin/echo 'hello from child' >"$OUT"
STATUS=$?
set -e
echo "  exit code: $STATUS"
echo
cat "$OUT"
echo
node playground/check-json.js <"$OUT"
echo "----------------------------------------------------------------------"
echo
if [ "$STATUS" -eq 0 ]; then
  echo "  Result: PASS — success path exits 0"
else
  echo "  Result: FAIL — expected exit 0, got $STATUS"
  rm -f "$OUT"
  exit 1
fi
echo
rm -f "$OUT"
