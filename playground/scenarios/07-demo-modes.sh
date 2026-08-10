#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 07 · demo modes still emit valid AI reports"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - demo --startup / --query / --headless with --json each print"
echo "      a valid perf-profiler/report@2 document and exit 0"
echo "    - the new error channel does not break the normal success path"
echo
echo "  Commands:"
echo "    node dist/cli.js demo --<mode> --json --out <temp-dir>"
echo
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
for mode in startup query headless; do
  OUT="$(mktemp)"
  echo "  ----------------------------------------------------------------------"
  echo "  --- demo --$mode ---"
  set +e
  # --out keeps report files in a temp dir instead of the default config home.
  node dist/cli.js demo --"$mode" --json --out "$DIR" >"$OUT"
  STATUS=$?
  set -e
  echo "  exit code: $STATUS"
  echo
  node playground/check-json.js <"$OUT"
  echo
  if [ "$STATUS" -ne 0 ]; then
    echo "  Result: FAIL — demo --$mode expected exit 0, got $STATUS"
    rm -f "$OUT"
    exit 1
  fi
  rm -f "$OUT"
done
echo "  Result: PASS — all demo modes exit 0 with valid JSON."
echo
