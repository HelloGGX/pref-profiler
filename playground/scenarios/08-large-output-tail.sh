#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 08 · large child output is truncated to a bounded tail"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - the JSON report stays intact even with 2000 lines of child stdout"
echo "    - stdoutTail is capped at ~8KB (bounded memory)"
echo "    - the tail still ends with FINAL-MARKER, i.e. the real failure context"
echo "    - the child exit code (4) is propagated"
echo
echo "  Command:"
echo "    node dist/cli.js run --json -- /bin/sh -c 'echo padding-line-... x2000; echo FINAL-MARKER; exit 4'"
echo
echo "  Note: in --json mode the child output is forwarded to stderr. This"
echo "  scenario suppresses it and only reports its size, so the terminal"
echo "  stays readable."
echo
echo "  Output:"
echo "----------------------------------------------------------------------"
OUT="$(mktemp)"
ERR="$(mktemp)"
set +e
node dist/cli.js run --json -- /bin/sh -c 'i=0; while [ $i -lt 2000 ]; do echo "padding-line-$i-of-large-output"; i=$((i+1)); done; echo FINAL-MARKER; exit 4' >"$OUT" 2>"$ERR"
STATUS=$?
set -e
echo "  exit code: $STATUS"
echo "  child output forwarded to stderr: $(wc -c <"$ERR") bytes (suppressed to keep this readable)"
echo
node playground/check-json.js FINAL-MARKER <"$OUT"
echo "----------------------------------------------------------------------"
echo
if [ "$STATUS" -eq 4 ]; then
  echo "  Result: PASS — tail is bounded and still contains the failure marker"
else
  echo "  Result: FAIL — expected exit 4, got $STATUS"
  rm -f "$OUT" "$ERR"
  exit 1
fi
echo
rm -f "$OUT" "$ERR"
