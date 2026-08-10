#!/usr/bin/env bash
# Simulates a failing build command: prints a compile error to stderr and
# exits non-zero, so you can see perf-profiler capture the failure reason.
echo "building project..."
echo "src/main.ts:12:23 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'."
echo "Found 1 error."
exit 1
