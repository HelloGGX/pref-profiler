// CLI integration tests: run the real entry point as a child process and check
// stdout/stderr, exit codes, and report files on disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildRunReport,
  parseCommand,
  parseFlags,
} from '../dist/cli.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(here, '..')
const cli = join(repoRoot, 'dist', 'cli.js')

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
  })
}

test('help and version', () => {
  const help = runCli(['help'])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage:/)
  assert.match(help.stdout, /demo/)
  assert.match(help.stdout, /report/)
  assert.match(help.stdout, /run -- <cmd>/)

  const version = runCli(['--version'])
  assert.equal(version.status, 0)
  assert.match(version.stdout, /perf-profiler 1\.0\.0/)
})

test('demo --startup writes text and JSON reports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-cli-'))
  try {
    const r = runCli([
      'demo',
      '--startup',
      '--out',
      dir,
      '--session-id',
      'cli-demo',
    ])
    assert.equal(r.status, 0)
    assert.match(r.stdout, /STARTUP PROFILING REPORT/)
    assert.match(r.stdout, /Total startup time:/)
    assert.match(r.stdout, /Report written to:/)

    assert.ok(existsSync(join(dir, 'cli-demo.txt')))
    const jsonPath = join(dir, 'cli-demo.json')
    assert.ok(existsSync(jsonPath))
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.equal(report.schema, 'perf-profiler/report@1')
    assert.equal(report.mode, 'startup')
    assert.ok(report.checkpoints.length > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('demo --query and --headless print their reports', () => {
  const q = runCli(['demo', '--query'])
  assert.equal(q.status, 0)
  assert.match(q.stdout, /QUERY PROFILING REPORT/)
  assert.match(q.stdout, /Total TTFT:/)
  assert.match(q.stdout, /PHASE BREAKDOWN:/)

  const h = runCli(['demo', '--headless'])
  assert.equal(h.status, 0)
  assert.match(h.stdout, /HEADLESS PROFILING METRICS/)
  assert.match(h.stdout, /time_to_first_response_ms/)
})

test('demo --json emits a raw AI report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-cli-'))
  try {
    const r = runCli(['demo', '--startup', '--json', '--out', dir])
    assert.equal(r.status, 0)
    const report = JSON.parse(r.stdout)
    assert.equal(report.mode, 'startup')
    assert.ok(report.checkpoints.length > 0)
    assert.ok(Array.isArray(report.suggestions))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('report --dir --json prints stored AI reports as raw JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-cli-'))
  try {
    runCli(['demo', '--startup', '--out', dir, '--session-id', 'r1'])
    const r = runCli(['report', '--dir', dir, '--json'])
    assert.equal(r.status, 0)
    const parsed = JSON.parse(r.stdout.trim())
    assert.equal(parsed.schema, 'perf-profiler/report@1')
    assert.equal(parsed.sessionId, 'r1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('run profiles a child and propagates its exit code', () => {
  const ok = runCli(['run', '--', process.execPath, '-e', 'process.exit(0)'])
  assert.equal(ok.status, 0)
  assert.match(ok.stdout, /COMMAND PROFILE REPORT/)
  assert.match(ok.stdout, /Exit code:\s+0/)

  const failed = runCli([
    'run',
    '--json',
    '--',
    process.execPath,
    '-e',
    'process.exit(3)',
  ])
  assert.equal(failed.status, 3)
  const report = JSON.parse(failed.stdout)
  assert.equal(report.mode, 'run')
  assert.equal(report.totals.exitCode, 3)
  assert.equal(report.anomalies[0].severity, 'critical')
})

test('run --json emits an AI-friendly error report on spawn failure', () => {
  const r = runCli(['run', '--json', '--', 'definitely-not-a-command-xyz'])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.schema, 'perf-profiler/error@1')
  assert.equal(report.errorType, 'spawn_failed')
  assert.match(report.location, /definitely-not-a-command-xyz/)
  assert.ok(report.suggestion.length > 0)
})

test('run --json keeps stdout machine-readable and captures child output', () => {
  const r = runCli([
    'run',
    '--json',
    '--',
    process.execPath,
    '-e',
    'console.log("child-out"); console.error("child-err"); process.exit(5)',
  ])
  assert.equal(r.status, 5)
  const report = JSON.parse(r.stdout) // stdout must be pure JSON
  assert.equal(report.schema, 'perf-profiler/report@1')
  assert.equal(report.totals.exitCode, 5)
  assert.equal(report.error.errorType, 'nonzero_exit')
  assert.match(report.error.stdoutTail, /child-out/)
  assert.match(report.error.stderrTail, /child-err/)
  assert.match(r.stderr, /child-err/) // child output forwarded to stderr
})

test('unknown command prints an error and exits non-zero', () => {
  const r = runCli(['does-not-exist'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /Error \[invalid_args\]: Unknown command: does-not-exist/)

  const json = runCli(['does-not-exist', '--json'])
  assert.equal(json.status, 2)
  const report = JSON.parse(json.stdout)
  assert.equal(report.schema, 'perf-profiler/error@1')
  assert.equal(report.errorType, 'invalid_args')
  assert.equal(report.message, 'Unknown command: does-not-exist')
})

test('report --json emits an error report for a missing file', () => {
  const r = runCli(['report', '--json', '/tmp/does-not-exist-pp.json'])
  assert.equal(r.status, 1)
  const report = JSON.parse(r.stdout)
  assert.equal(report.schema, 'perf-profiler/error@1')
  assert.equal(report.errorType, 'file_not_found')
  assert.match(report.location, /does-not-exist-pp\.json/)
})

test('parseCommand recognizes commands and help/version aliases', () => {
  assert.deepEqual(parseCommand(['demo', '--query']), {
    command: 'demo',
    rest: ['--query'],
  })
  assert.deepEqual(parseCommand(['report']), { command: 'report', rest: [] })
  assert.deepEqual(parseCommand(['run', '--', 'npm', 'test']), {
    command: 'run',
    rest: ['--', 'npm', 'test'],
  })
  assert.deepEqual(parseCommand([]), { command: 'help', rest: [] })
  assert.deepEqual(parseCommand(['help']), { command: 'help', rest: [] })
  assert.deepEqual(parseCommand(['--help']), { command: 'help', rest: [] })
  assert.deepEqual(parseCommand(['-h']), { command: 'help', rest: [] })
  assert.deepEqual(parseCommand(['--version']), { command: 'version', rest: [] })
  assert.deepEqual(parseCommand(['-v']), { command: 'version', rest: [] })
  assert.deepEqual(parseCommand(['bogus']), {
    command: 'error',
    rest: [],
    error: 'Unknown command: bogus',
  })
})

test('parseFlags handles flags, values, positionals and -- rest', () => {
  const spec = { json: 'flag', dir: 'value', 'session-id': 'value' }
  const parsed = parseFlags(
    ['--json', '--dir', '/tmp/reports', 'pos1', '--', 'node', '--eval', 'x'],
    spec,
  )
  assert.deepEqual(parsed.flags, { json: true, dir: '/tmp/reports' })
  assert.deepEqual(parsed.positionals, ['pos1'])
  assert.deepEqual(parsed.rest, ['node', '--eval', 'x'])

  const eq = parseFlags(['--dir=/x', '--json'], spec)
  assert.deepEqual(eq.flags, { dir: '/x', json: true })

  // Unknown options are reported but do not abort parsing.
  const unknown = parseFlags(['--nope', '--json'], spec)
  assert.deepEqual(unknown.flags, { json: true })
})

test('buildRunReport flags non-zero exit and CPU utilization', () => {
  const marks = [
    { name: 'run_start', startTime: 0 },
    { name: 'run_spawned', startTime: 10 },
    { name: 'run_exit', startTime: 100 },
  ]
  const report = buildRunReport(
    'node',
    marks,
    0,
    100,
    2,
    { cpuMs: 10, peakRssBytes: 1024 },
  )
  assert.equal(report.mode, 'run')
  assert.equal(report.totals.exitCode, 2)
  assert.equal(report.totals.wallMs, 100)
  assert.equal(report.totals.cpuMs, 10)
  assert.ok(report.anomalies.some(a => a.severity === 'critical'))
  // 10ms CPU over 100ms wall = 10% -> low utilization info anomaly.
  assert.ok(report.anomalies.some(a => a.severity === 'info'))
  assert.match(report.summary, /finished in 100\.0ms with exit code 2/)
  assert.equal(report.error.errorType, 'nonzero_exit')

  const clean = buildRunReport('node', marks, 0, 100, 0, null)
  assert.equal(clean.anomalies.length, 0)
  assert.equal(clean.totals.exitCode, 0)
  assert.equal(clean.error, undefined)
})

test('buildRunReport attaches captured child output to the error', () => {
  const marks = [
    { name: 'run_start', startTime: 0 },
    { name: 'run_spawned', startTime: 10 },
    { name: 'run_exit', startTime: 100 },
  ]
  const report = buildRunReport(
    'node',
    marks,
    0,
    100,
    2,
    null,
    'stdout tail\n',
    'stderr tail\n',
  )
  assert.equal(report.error.errorType, 'nonzero_exit')
  assert.equal(report.error.stdoutTail, 'stdout tail\n')
  assert.equal(report.error.stderrTail, 'stderr tail\n')
})
