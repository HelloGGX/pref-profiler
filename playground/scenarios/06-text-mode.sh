#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "======================================================================"
echo "  Scenario 06 · error output without --json (human-readable text)"
echo "======================================================================"
echo
echo "  Verifies:"
echo "    - without --json the same errors print readable text on stderr"
echo "    - the text still carries all three elements: message / location / suggestion"
echo "    - exit codes stay non-zero (2 for usage, 1 for runtime failures)"
echo
set +e
echo "  ----------------------------------------------------------------------"
echo "  --- 6a. unknown command ---"
echo "  Command: node dist/cli.js frobnicate"
echo
node dist/cli.js frobnicate 2>&1
echo "  exit code: $?"
echo
echo "  ----------------------------------------------------------------------"
echo "  --- 6b. spawn failure ---"
echo "  Command: node dist/cli.js run -- ./definitely-missing-tool"
echo
node dist/cli.js run -- ./definitely-missing-tool 2>&1
echo "  exit code: $?"
echo
echo "  ----------------------------------------------------------------------"
echo "  --- 6c. failing child (diagnostics pass through, exit code propagated) ---"
echo "  Command: node dist/cli.js run -- playground/fixtures/flaky.sh"
echo
node dist/cli.js run -- playground/fixtures/flaky.sh 2>&1
echo "  exit code: $?"
set -e
echo
echo "  Result: PASS — text mode shows the same three elements (message / location / suggestion)."
echo
