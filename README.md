# perf-profiler

> Checkpoint-based performance profiler that turns timing data into actionable, AI-friendly reports.

[English](README.md) | [简体中文](README-zh.md)

![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white)
![ESM](https://img.shields.io/badge/ESM-supported-4fc921)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

**perf-profiler** is a zero-dependency profiler built for harness and agent engineering. It instruments slow phases of a pipeline — startup, query (time-to-first-token), and headless per-turn latency — with lightweight `perf_hooks` checkpoints, then emits a human-readable timeline and an AI-friendly JSON report (`perf-profiler/report@2`). No telemetry, no hidden sampling, no runtime dependencies.

## What You Can Measure

- **Startup** — total time, per-checkpoint deltas (module imports, settings loading, MCP connection, argument parsing), RSS/heap snapshots
- **Query** — time to first token (TTFT, split local overhead vs. network latency), per-phase timing (context loading, tool schema building, message normalization, tool execution, streaming)
- **Headless** — per-turn latency: system message output, query start, query overhead, time to first response (TTFR)
- **Command execution** — wall time, exit code; on Linux also child CPU time, CPU utilization, peak RSS
- **Anomaly detection** — slow checkpoints (>100ms warning / >1000ms critical), known bottlenecks, memory pressure (heap >512MB), non-zero exit codes, each with fix suggestions

## Features

- **AI-native output** — fixed JSON schema with severity, thresholds, reasons, and fix suggestions, designed to be piped straight into an AI agent or harness.
- **Three profilers, one tool** — startup phases, query pipeline (TTFT), and headless per-turn latency share the same perf_hooks timeline and report format.
- **Memory-aware** — RSS and heap snapshots at every checkpoint in detailed mode.
- **Zero dependencies** — compiled to plain ESM with TypeScript; works on Node ≥ 18 and Bun.
- **Deterministic** — enabled explicitly via `PERF_PROFILE_*` env vars; no hidden sampling, no background telemetry.
- **Harness-friendly** — raw JSON piping (`--json`), exit-code propagation, and stable file outputs under one directory.

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [What You Can Measure](#what-you-can-measure)
- [CLI Reference](#cli-reference)
- [AI-Friendly Reports](#ai-friendly-reports)
- [Library API](#library-api)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [License](#license)

## Install

### In a project (recommended)

Install as a project-level dev dependency, so the `perf` command is available to
your scripts and CI without polluting global state:

```bash
npm install --save-dev perf-profiler
```

Then use it directly, or via `npx`:

```bash
npx perf --help
perf run -- npm test
```

Both command names are installed: `perf` for daily use, and `perf-profiler` as a
collision-free full name — use it if `perf` already exists on your PATH (e.g.
Linux's kernel profiler). You can also install globally with
`npm install -g perf-profiler` if you prefer.

### From source

```bash
git clone https://github.com/HelloGGX/pref-profiler.git
cd pref-profiler
npm install
npm run build                     # emits dist/ via TypeScript
node dist/cli.js --help
```

### As a library

```bash
npm install perf-profiler
```

The package ships compiled ESM plus TypeScript declarations (`dist/`), so the
library API works in Node ≥ 18 and in Bun.

## Quick Start

### Profile any command

```bash
perf run -- npm test
perf run --json -- npm test    # AI-friendly JSON report
```

```text
task done
================================================================================
COMMAND PROFILE REPORT - node
================================================================================

[+     0.000ms] (+    0.000ms) run_start
[+  1878.300ms] (+ 1878.300ms) run_spawned
[+  2100.798ms] (+  222.498ms) run_exit

Wall time:        2100.798ms
Child CPU:        n/a (Linux only)
Exit code:        0
================================================================================
```

### Profile your application's phases

Drop checkpoints into your startup or query pipeline, then read the report:

```ts
import {
  profileCheckpoint,
  profileReport,
  getStartupAiReport,
} from 'perf-profiler'

// Set PERF_PROFILE_STARTUP=1 before importing the profiler module
profileCheckpoint('app_entry')
profileCheckpoint('app_imports_loaded')
profileCheckpoint('app_ready')

profileReport() // writes <output-dir>/<sessionId>.txt and .json
const report = getStartupAiReport() // structured data for your harness
```

Run it and inspect the JSON:

```bash
PERF_PROFILE_STARTUP=1 node your-app.js
perf report --dir ~/.perf-profiler/reports
```

## CLI Reference

```text
perf <command> [options]
```

| Command | Description |
| --- | --- |
| `demo` | Run a scripted profiling demo: `--startup` (default), `--query`, or `--headless` |
| `report` | Print report files (`.txt` / `.json`) from the output directory |
| `run -- <cmd>` | Profile an arbitrary command with a timeline and summary |
| `help` | Show help |

### Global / command options

| Option | Applies to | Description |
| --- | --- | --- |
| `--json` | `demo`, `report`, `run` | Output the AI-friendly JSON report (raw, no headers for `report`) |
| `--out <dir>` | `demo` | Report output directory |
| `--session-id <id>` | `demo` | Stable report file name |
| `--dir <dir>` | `report` | Scan a directory instead of the default output dir |

### Examples

```bash
perf demo --query                     # text report with TTFT breakdown
perf demo --query --json              # same demo, AI-friendly JSON
perf demo --headless                  # per-turn latency metrics
perf report --dir /tmp/perf --json    # raw JSON, pipe to an AI agent
perf run -- node script.js arg1       # profile a command
```

`run` executes the command directly via `spawn(..., { shell: false })` — no shell re-parsing, and the child's exit code is propagated. On Windows, use `cmd /c` or `powershell -Command` when you need shell features or `.cmd`/`.bat` shims. Child CPU time and peak RSS are sampled from `/proc` on Linux; other platforms report `n/a (Linux only)`.

### Playground

A scripted playground lives in [`playground/`](playground/README.md) with one
scenario per failure mode (spawn failure, non-zero exit, invalid arguments,
missing files, large-output tails, demo modes). Run everything with:

```bash
npm run playground
```

or a single scenario, e.g. `bash playground/scenarios/02-run-nonzero-exit.sh`.

## AI-Friendly Reports

The JSON report is the contract between this tool and your AI agent or harness. It is stable, versioned (`perf-profiler/report@2`), and includes everything needed to triage a performance issue without reading raw logs.

```json
{
  "schema": "perf-profiler/report@2",
  "mode": "query",
  "totals": { "totalMs": 733.7, "checkpointCount": 19 },
  "checkpoints": [
    {
      "name": "query_user_input_received",
      "totalMs": 0,
      "deltaMs": 0,
      "rssBytes": 52848230,
      "heapUsedBytes": 6029304
    }
  ],
  "phases": [
    {
      "name": "Tool schemas",
      "start": "query_tool_schema_build_start",
      "end": "query_tool_schema_build_end",
      "durationMs": 78,
      "sharePct": 10.6
    }
  ],
  "anomalies": [
    {
      "severity": "warning",
      "checkpoint": "query_tool_schema_build_end",
      "durationMs": 78,
      "thresholdMs": 50,
      "reason": "Known bottleneck \"query_tool_schema_build_end\" exceeds 50ms",
      "suggestion": "Cache tool schemas or build them lazily instead of regenerating per query."
    }
  ]
}
```

### Report fields

| Field | Description |
| --- | --- |
| `checkpoints` | Per-checkpoint cumulative time, delta, and memory snapshot (detailed mode) |
| `phases` | Semantic phases (context loading, tool schemas, network TTFB, ...) with duration and share; `start`/`end` only when derived from a checkpoint pair |
| `anomalies` | Detected issues: severity, reason, threshold, and a concrete fix suggestion |
| `command` | Profiled command (run mode only) |
| `turn` | Headless turn number (headless mode only) |

### Anomaly thresholds

| Condition | Severity |
| --- | --- |
| Checkpoint delta > 1000ms | `critical` |
| Checkpoint delta > 100ms | `warning` |
| Known bottleneck (tool schema / client creation / git status) > 50ms | `warning` |
| Network latency > 1000ms (query) | `critical` |
| Network latency > 300ms (query) | `warning` |
| Time to first response > 2000ms (headless) | `critical` |
| Query overhead > 500ms (headless) | `warning` |
| Heap usage > 512MB | `warning` |
| Non-zero exit code (run) | `critical` |

Thresholds and suggestion texts live in [`src/analyze.ts`](src/analyze.ts) and are easy to tune for your workload.

### Error reports

Failures always exit non-zero, and with `--json` they emit a parseable error
document instead of ad-hoc text. This is the contract for failed commands:

```json
{
  "schema": "perf-profiler/error@1",
  "errorType": "spawn_failed",
  "message": "Failed to start command: spawn ./missing ENOENT",
  "location": "run -- ./missing",
  "exitCode": 1,
  "suggestion": "Check that the command exists and is executable (e.g. `command -v <cmd>`)."
}
```

| `errorType` | Meaning |
| --- | --- |
| `invalid_args` | Unknown command/option or a missing option value |
| `spawn_failed` | The profiled command could not be started |
| `file_not_found` | A requested report file does not exist |
| `internal` | Unexpected exception inside the CLI |

Every error report answers the same three questions: `message` (what
happened), `location` (where), and captured `stdoutTail`/`stderrTail` plus
`suggestion` (why and what to do next). For `run`, a non-zero child exit
keeps the normal `perf-profiler/report@2` output and attaches the captured
output in `report.error`; child stdout/stderr are forwarded to stderr in
`--json` mode so stdout stays machine-readable.

## Library API

### Startup profiler

```ts
import { profileCheckpoint, profileReport, getStartupAiReport } from 'perf-profiler'

profileCheckpoint('app_entry')
profileCheckpoint('app_ready')
profileReport()
const report = getStartupAiReport() // AiReport | null
```

### Query profiler

```ts
import {
  startQueryProfile,
  queryCheckpoint,
  endQueryProfile,
  getQueryAiReport,
} from 'perf-profiler'

startQueryProfile()
queryCheckpoint('query_context_loading_start')
// ... pipeline stages ...
queryCheckpoint('query_first_chunk_received') // TTFT
endQueryProfile()
const report = getQueryAiReport()
```

### Headless profiler

```ts
import {
  setNonInteractiveSession,
  headlessProfilerStartTurn,
  headlessProfilerCheckpoint,
  getHeadlessAiReport,
} from 'perf-profiler'

setNonInteractiveSession(true)
headlessProfilerStartTurn()
headlessProfilerCheckpoint('query_started')
headlessProfilerCheckpoint('first_chunk')
const report = getHeadlessAiReport()
```

### Telemetry sink

Telemetry is off by default. Attach your own sink to receive phase metrics:

```ts
import { setAnalyticsSink } from 'perf-profiler'

setAnalyticsSink((event, metadata) => {
  // event: "startup_perf" | "headless_latency"
  console.log(event, metadata)
})
```

## Configuration

All configuration is environment-based so it works identically in CI and local harnesses:

| Variable | Description |
| --- | --- |
| `PERF_PROFILE_STARTUP=1` | Enable startup / headless profiling (deterministic, no sampling) |
| `PERF_PROFILE_QUERY=1` | Enable query profiling |
| `PERF_OUTPUT_DIR=<dir>` | Report output directory (default `<config-home>/reports`) |
| `PERF_CONFIG_DIR=<dir>` | Config home (default `~/.perf-profiler`) |
| `PERF_DEBUG=1` / `--debug` | Write debug logs to stderr |

## How It Works

```text
Instrument                     Analyze                          Report
────────────────────────      ──────────────────────────       ───────────────────────────
profileCheckpoint(name)   →   checkpoints + phases        →   <sessionId>.txt  (human)
       │                       anomalies (severity,             <sessionId>.json (AI)
       ▼                       thresholds, suggestions)
perf_hooks marks          →   checkpoints + phases +      →   perf-profiler/report@2
                              anomalies
memory snapshots
```

All three profilers share the same perf_hooks timeline (`getPerformance()` in [`src/base.ts`](src/base.ts)) and feed the same analysis pipeline ([`src/analyze.ts`](src/analyze.ts)), so the output format is consistent whether you profile startup, a query, or a headless turn.

## Contributing

Contributions are welcome! Keep it simple:

1. Fork the repository and create a feature branch.
2. Run `npm run build` and `npm test` before submitting.
3. Open a pull request describing the change and any threshold/schema updates.

## License

[MIT](LICENSE)
