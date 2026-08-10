#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 04 · unknown command (--json)"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - usage errors emit perf-profiler/error@1 with errorType: invalid_args"
echo "    - the offending command name appears in message"
echo "    - exit code is 2 (usage errors are distinct from runtime failures)"
echo
echo "  How to read the output:"
echo "    - location: perf-profiler <command>  -> the CLI surface where it failed"
echo "    - suggestion points at 'perf-profiler help'"
echo
echo "  Command:"
echo "    node dist/cli.js frobnicate --json"
echo
echo "  Output:"
echo "----------------------------------------------------------------------"
OUT="$(mktemp)"
set +e
node dist/cli.js frobnicate --json >"$OUT"
STATUS=$?
set -e
echo "  exit code: $STATUS"
echo
cat "$OUT"
echo
node playground/check-json.js "Unknown command: frobnicate" <"$OUT"
echo "----------------------------------------------------------------------"
echo
if [ "$STATUS" -eq 2 ]; then
  echo "  Result: PASS — usage error emits error@1 and exits 2"
else
  echo "  Result: FAIL — expected exit 2, got $STATUS"
  rm -f "$OUT"
  exit 1
fi
echo
rm -f "$OUT"
