# Playground

A scripted playground for manually exercising the CLI, one scenario per
failure mode. Each scenario prints a banner, explains what it verifies and how
to read the output, echoes the exact command, runs the real CLI, shows the raw
output, verifies that stdout is parseable JSON, and ends with a PASS/FAIL
verdict — exiting non-zero if the expectation is not met.

## Prerequisites

```bash
bun install
bun run build
```

## Run everything

```bash
bun run dev playground/run-all.sh
```

or directly:

```bash
bash playground/run-all.sh
```

## Run one scenario

```bash
bash playground/scenarios/01-run-success.sh
```

## Scenarios

| # | Script | What it checks | Expected exit |
| --- | --- | --- | --- |
| 01 | `01-run-success.sh` | `run --json` on a successful command | 0 |
| 02 | `02-run-nonzero-exit.sh` | Child fails with diagnostics; reason captured in `report.error.stderrTail` | 1 |
| 03 | `03-run-spawn-failure.sh` | Command cannot be started (`spawn_failed`) | 1 |
| 04 | `04-invalid-command.sh` | Unknown command (`invalid_args`) | 2 |
| 05 | `05-missing-report.sh` | Report file does not exist (`file_not_found`) | 1 |
| 06 | `06-text-mode.sh` | Same failures without `--json` produce readable stderr text | varies |
| 07 | `07-demo-modes.sh` | `demo --startup/--query/--headless --json` still emit valid reports | 0 |
| 08 | `08-large-output-tail.sh` | Large child output is truncated to a bounded tail that still contains the failure marker | 1 |

## What to look for

- In `--json` mode, **stdout is always a single parseable JSON document**
  (report or error). Child output goes to stderr, never into stdout.
- Every error document answers three questions:
  - `message` — what happened;
  - `location` — where (command / file / CLI surface);
  - `stdoutTail` / `stderrTail` + `suggestion` — why and what to do next.
- Failures always exit non-zero: 2 for usage errors, 1 for spawn/file/internal
  errors, and the child's own exit code is propagated for `run`.
- In `run --json`, child stdout/stderr are forwarded to stderr. Scenario 08
  suppresses that stream so the terminal stays readable while the report still
  carries the bounded tail.

The fixture [`fixtures/flaky.sh`](fixtures/flaky.sh) simulates a failing build
command that prints a compile error to stderr — a realistic "why" an AI agent
would need.
