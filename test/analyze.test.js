// Unit tests for the shared analysis pipeline: anomaly detection thresholds,
// suggestions, and report assembly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReport,
  jsonStringifyReport,
  marksToCheckpoints,
  phasesFromCheckpoints,
  suggestForPhase,
} from '../dist/analyze.js'

const MB = 1024 * 1024

test('marksToCheckpoints computes baseline, deltas and memory', () => {
  const checkpoints = marksToCheckpoints(
    [
      { name: 'a', startTime: 100 },
      { name: 'b', startTime: 250 },
      { name: 'c', startTime: 300 },
    ],
    () => ({ rss: 10, heapUsed: 5 }),
  )
  assert.deepEqual(checkpoints, [
    { name: 'a', totalMs: 0, deltaMs: 0, rssBytes: 10, heapUsedBytes: 5 },
    { name: 'b', totalMs: 150, deltaMs: 150, rssBytes: 10, heapUsedBytes: 5 },
    { name: 'c', totalMs: 200, deltaMs: 50, rssBytes: 10, heapUsedBytes: 5 },
  ])
  assert.deepEqual(marksToCheckpoints([]), [])
})

test('phasesFromCheckpoints skips incomplete pairs and computes shares', () => {
  const times = new Map([
    ['start', 100],
    ['end', 300],
    ['other_start', 200],
  ])
  const phases = phasesFromCheckpoints(
    {
      complete: ['start', 'end'],
      incomplete: ['other_start', 'missing_end'],
    },
    times,
    100,
  )
  assert.equal(phases.length, 1)
  assert.equal(phases[0].name, 'complete')
  assert.equal(phases[0].durationMs, 200)
  assert.equal(phases[0].sharePct, 100)
})

test('buildReport flags critical and warning deltas with suggestions', () => {
  const report = buildReport({
    mode: 'startup',
    checkpoints: [
      { name: 'first', totalMs: 0, deltaMs: 0 },
      { name: 'slow_cp', totalMs: 1200, deltaMs: 1200 },
      { name: 'medium_cp', totalMs: 1350, deltaMs: 150 },
    ],
    phases: [],
  })
  assert.equal(report.anomalies.length, 2)
  assert.equal(report.anomalies[0].severity, 'critical')
  assert.equal(report.anomalies[0].thresholdMs, 1000)
  assert.match(report.anomalies[0].reason, /exceeds 1000ms/)
  assert.equal(report.anomalies[1].severity, 'warning')
  assert.match(report.anomalies[1].reason, /exceeds 100ms/)
  assert.match(report.anomalies[0].suggestion, /Investigate/)
  assert.equal(report.suggestions, undefined)
  assert.equal(report.summary, undefined)
})

test('buildReport flags known bottlenecks above 50ms', () => {
  const report = buildReport({
    mode: 'startup',
    checkpoints: [
      { name: 'first', totalMs: 0, deltaMs: 0 },
      { name: 'query_tool_schema_build_end', totalMs: 60, deltaMs: 60 },
    ],
    phases: [],
  })
  assert.equal(report.anomalies.length, 1)
  assert.equal(report.anomalies[0].severity, 'warning')
  assert.match(report.anomalies[0].reason, /Known bottleneck/)
  assert.match(report.anomalies[0].suggestion, /Cache tool schemas/)

  // Fast known bottleneck: no anomaly.
  const fast = buildReport({
    mode: 'startup',
    checkpoints: [
      { name: 'first', totalMs: 0, deltaMs: 0 },
      { name: 'query_tool_schema_build_end', totalMs: 30, deltaMs: 30 },
    ],
    phases: [],
  })
  assert.equal(fast.anomalies.length, 0)
})

test('buildReport detects heap pressure above 512MB', () => {
  const report = buildReport({
    mode: 'startup',
    checkpoints: [
      { name: 'first', totalMs: 0, deltaMs: 0 },
      { name: 'leaky', totalMs: 10, deltaMs: 10, heapUsedBytes: 600 * MB },
    ],
    phases: [],
  })
  const heapAnomaly = report.anomalies.find(a => a.checkpoint === 'leaky')
  assert.ok(heapAnomaly)
  assert.equal(heapAnomaly.severity, 'warning')
  assert.equal(heapAnomaly.unit, 'MB')
  assert.match(heapAnomaly.reason, /Heap usage exceeds 512MB/)
})

test('buildReport passes phases through and drops derived fields', () => {
  const report = buildReport({
    mode: 'startup',
    checkpoints: [
      { name: 'first', totalMs: 0, deltaMs: 0 },
      { name: 'last', totalMs: 1000, deltaMs: 1000 },
    ],
    phases: [
      { name: 'import_time', start: '', end: '', durationMs: 900, sharePct: 90 },
      { name: 'total_time', start: '', end: '', durationMs: 1000, sharePct: 100 },
      { name: 'network', start: '', end: '', durationMs: 100, sharePct: 10 },
    ],
  })
  // Phases pass through unchanged (no ranking, no total_* filtering).
  assert.deepEqual(report.phases.map(p => p.name), [
    'import_time',
    'total_time',
    'network',
  ])
  assert.equal(report.bottlenecks, undefined)
  assert.equal(report.summary, undefined)
  assert.equal(report.suggestions, undefined)
  assert.equal(report.generatedAt, undefined)
  assert.equal(report.sessionId, undefined)
})

test('buildReport supports run-mode totals and command', () => {
  const report = buildReport({
    mode: 'run',
    command: 'npm test',
    checkpoints: [
      { name: 'run_start', totalMs: 0, deltaMs: 0 },
      { name: 'run_exit', totalMs: 500, deltaMs: 500 },
    ],
    phases: [],
    totalMs: 500,
    wallMs: 500,
    cpuMs: 120,
    exitCode: 0,
  })
  assert.equal(report.command, 'npm test')
  assert.equal(report.totals.exitCode, 0)
  assert.equal(report.totals.wallMs, 500)
  assert.equal(report.totals.cpuMs, 120)
})

test('suggestForPhase maps known phases and falls back', () => {
  assert.match(suggestForPhase('Tool schemas'), /Cache tool schemas/)
  assert.match(suggestForPhase('client creation'), /persistent API client/)
  assert.match(suggestForPhase('Network TTFB'), /endpoint latency/)
  assert.match(suggestForPhase('git status'), /Cache git status/)
  assert.match(suggestForPhase('Context loading'), /Prefetch context/)
  assert.match(suggestForPhase('Autocompact'), /Tune compaction/)
  assert.match(suggestForPhase('init_time'), /Lazy-load heavy modules/)
  assert.match(suggestForPhase('settings_time'), /Cache settings reads/)
  assert.match(suggestForPhase('Tool execution'), /Parallelize independent tool calls/)
  assert.match(suggestForPhase('mystery phase'), /Investigate this phase/)
})

test('jsonStringifyReport emits parseable JSON with schema', () => {
  const report = buildReport({
    mode: 'query',
    checkpoints: [{ name: 'a', totalMs: 0, deltaMs: 0 }],
    phases: [],
  })
  const parsed = JSON.parse(jsonStringifyReport(report))
  assert.equal(parsed.schema, 'perf-profiler/report@2')
  assert.equal(parsed.mode, 'query')
})
