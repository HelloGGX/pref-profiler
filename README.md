# perf-profiler

> Checkpoint-based performance profiler that turns timing data into actionable, AI-friendly reports.

![Bun](https://img.shields.io/badge/bun-%3E%3D1.3-black?logo=bun&logoColor=white)
![ESM](https://img.shields.io/badge/ESM-supported-4fc921)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

**perf-profiler** is a zero-dependency profiler built for harness and agent engineering. It instruments slow phases of a pipeline — startup, query (time-to-first-token), and headless per-turn latency — with lightweight `perf_hooks` checkpoints, then emits:

- a **human-readable timeline** with RSS/heap memory snapshots and slow-operation warnings;
- an **AI-friendly JSON report** (`perf-profiler/report@1`) with detected anomalies, ranked bottlenecks, and concrete fix suggestions an AI agent can act on directly.

No telemetry, no hidden sampling, no runtime dependencies — just a single self-contained binary.

## Features

- **AI-native output** — fixed JSON schema with severity, thresholds, reasons, and fix suggestions, designed to be piped straight into an AI agent or harness.
- **Three profilers, one tool** — startup phases, query pipeline (TTFT), and headless per-turn latency share the same perf_hooks timeline and report format.
- **Memory-aware** — RSS and heap snapshots at every checkpoint in detailed mode.
- **Zero dependencies** — compiled with [Bun](https://bun.sh) into a single binary; no Node or package install required at runtime.
- **Deterministic** — enabled explicitly via `PERF_PROFILE_*` env vars; no hidden sampling, no background telemetry.
- **Harness-friendly** — raw JSON piping (`--json`), exit-code propagation, and stable file outputs under one directory.

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [AI-Friendly Reports](#ai-friendly-reports)
- [Library API](#library-api)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [License](#license)

## Install

### Binary (recommended)

Download the prebuilt binary for your platform from the [Releases](https://github.com/HelloGGX/pref-profiler/releases) page, or build it yourself:

```bash
bun run build
./bin/perf-profiler --help        # Windows: .\bin\perf-profiler.exe --help
```

The build produces `bin/perf-profiler` on macOS/Linux and `bin/perf-profiler.exe` on Windows — a single executable with the Bun runtime embedded.

### From source

```bash
git clone https://github.com/HelloGGX/pref-profiler.git
cd pref-profiler
bun run build                     # requires Bun >= 1.3
```

### As a library

```bash
bun add perf-profiler             # from a registry, or:
bun add github:HelloGGX/pref-profiler
```

The package exports its TypeScript source directly, so the library API works under Bun without a build step.

## Quick Start

### Profile any command

```bash
perf-profiler run -- npm test
perf-profiler run --json -- npm test    # AI-friendly JSON report
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
perf-profiler report --dir ~/.perf-profiler/reports
```

## CLI Reference

```text
perf-profiler <command> [options]
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
perf-profiler demo --query                     # text report with TTFT breakdown
perf-profiler demo --query --json              # same demo, AI-friendly JSON
perf-profiler demo --headless                  # per-turn latency metrics
perf-profiler report --dir /tmp/perf --json    # raw JSON, pipe to an AI agent
perf-profiler run -- node script.js arg1       # profile a command
```

`run` executes the command directly via `spawn(..., { shell: false })` — no shell re-parsing, and the child's exit code is propagated. On Windows, use `cmd /c` or `powershell -Command` when you need shell features or `.cmd`/`.bat` shims. Child CPU time and peak RSS are sampled from `/proc` on Linux; other platforms report `n/a (Linux only)`.

## AI-Friendly Reports

The JSON report is the contract between this tool and your AI agent or harness. It is stable, versioned (`perf-profiler/report@1`), and includes everything needed to triage a performance issue without reading raw logs.

```json
{
  "schema": "perf-profiler/report@1",
  "generatedAt": "2026-08-06T12:00:00.000Z",
  "sessionId": "abc-123",
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
  ],
  "bottlenecks": [
    {
      "name": "Network TTFB",
      "durationMs": 171,
      "sharePct": 23.3,
      "suggestion": "Check endpoint latency, connection keep-alive, compression, and request timeouts."
    }
  ],
  "summary": "TTFT 437.8ms: pre-request overhead 268.6ms (61.4%), network latency 169.2ms (38.6%)",
  "suggestions": [
    "Cache tool schemas or build them lazily instead of regenerating per query.",
    "Check endpoint latency, connection keep-alive, compression, and request timeouts."
  ]
}
```

### Report fields

| Field | Description |
| --- | --- |
| `checkpoints` | Per-checkpoint cumulative time, delta, and memory snapshot (detailed mode) |
| `phases` | Semantic phases (context loading, tool schemas, network TTFB, ...) with duration and share |
| `anomalies` | Detected issues: severity, reason, threshold, and a concrete fix suggestion |
| `bottlenecks` | Top 5 phases ranked by duration, each with a targeted suggestion |
| `summary` | One-line verdict (e.g. TTFT split between local overhead and network latency) |
| `suggestions` | Deduplicated, actionable suggestions an AI can execute in order |

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
perf_hooks marks +        →   bottlenecks (top 5)         →   perf-profiler/report@1
memory snapshots
```

All three profilers share the same perf_hooks timeline (`getPerformance()` in [`src/base.ts`](src/base.ts)) and feed the same analysis pipeline ([`src/analyze.ts`](src/analyze.ts)), so the output format is consistent whether you profile startup, a query, or a headless turn.

## Contributing

Contributions are welcome! Keep it simple:

1. Fork the repository and create a feature branch.
2. Run `bun run build` and `bun test ./test/` before submitting.
3. Open a pull request describing the change and any threshold/schema updates.

## License

[MIT](LICENSE)
