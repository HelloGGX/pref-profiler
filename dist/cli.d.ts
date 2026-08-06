#!/usr/bin/env node
/**
 * perf-profiler CLI.
 *
 * Commands:
 *   demo    Run a scripted profiling demo (startup / query / headless)
 *   report  Print detailed profiling report files written by the library
 *   run     Run a command and produce a profile timeline + summary
 *   help    Show help
 *
 * The profiler modules decide their enabled state at import time from env
 * variables, so this CLI sets the relevant env vars BEFORE dynamically
 * importing them.
 */
export {};
