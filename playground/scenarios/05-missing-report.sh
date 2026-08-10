#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 05 · report file does not exist (report --json)"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - a missing report file emits errorType: file_not_found"
echo "    - location names the file that was requested"
echo "    - exit code is 1"
echo
echo "  How to read the output:"
echo "    - message: File not found: ./no-such-report.json"
echo "    - suggestion explains how to generate a report first"
echo
echo "  Command:"
echo "    node dist/cli.js report --json ./no-such-report.json"
echo
echo "  Output:"
echo "----------------------------------------------------------------------"
OUT="$(mktemp)"
set +e
node dist/cli.js report --json ./no-such-report.json >"$OUT"
STATUS=$?
set -e
echo "  exit code: $STATUS"
echo
cat "$OUT"
echo
node playground/check-json.js "no-such-report.json" <"$OUT"
echo "----------------------------------------------------------------------"
echo
if [ "$STATUS" -eq 1 ]; then
  echo "  Result: PASS — missing report emits error@1 and exits 1"
else
  echo "  Result: FAIL — expected exit 1, got $STATUS"
  rm -f "$OUT"
  exit 1
fi
echo
rm -f "$OUT"
