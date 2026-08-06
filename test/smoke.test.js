import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'perf-profiler-test-'))
process.env.PERF_OUTPUT_DIR = join(tmp, 'startup-perf')

test('base helpers', async () => {
  const { formatMs, formatTimelineLine, getPerformance } = await import(
    `../src/base.ts?smoke-base=${Date.now()}`
  )
  assert.equal(formatMs(1.234567), '1.235')
  const line = formatTimelineLine(1000, 250, 'phase', undefined, 8, 7)
  assert.match(line, /\[\+1000\.000ms\] \(\+250\.000ms\) phase/)
  assert.ok(getPerformance().now() >= 0)
})

test('startup profiler: checkpoints + report file', async () => {
  process.env.PERF_PROFILE_STARTUP = '1'
  const startup = await import(`../src/startup.ts?smoke-startup=${Date.now()}`)
  const { setSessionId } = await import('../src/config.ts')

  setSessionId('smoke-startup')
  startup.profileCheckpoint('cli_entry')
  startup.profileCheckpoint('main_tsx_imports_loaded')
  startup.profileCheckpoint('main_after_run')
  startup.profileReport()

  const path = startup.getStartupPerfLogPath()
  const report = readFileSync(path, 'utf8')
  assert.match(report, /STARTUP PROFILING REPORT/)
  assert.match(report, /cli_entry/)
  assert.match(report, /main_after_run/)
  assert.match(report, /RSS: /)
  assert.ok(startup.isDetailedProfilingEnabled())

  // AI-friendly JSON report is written next to the text report.
  const jsonPath = path.replace(/\.txt$/, '.json')
  const jsonReport = JSON.parse(readFileSync(jsonPath, 'utf8'))
  assert.equal(jsonReport.schema, 'perf-profiler/report@1')
  assert.equal(jsonReport.mode, 'startup')
  assert.ok(jsonReport.checkpoints.length >= 3)
  assert.ok(Array.isArray(jsonReport.suggestions))

  const aiReport = startup.getStartupAiReport()
  assert.ok(aiReport)
  assert.equal(aiReport.mode, 'startup')
  // profiler_initialized (module load) + the 3 checkpoints recorded here;
  // other test files may share the timeline, so assert a lower bound.
  assert.ok(aiReport.totals.checkpointCount >= 4)
})

test('query profiler: TTFT report', async () => {
  process.env.PERF_PROFILE_QUERY = '1'
  const query = await import(`../src/query.ts?smoke-query=${Date.now()}`)

  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.queryCheckpoint('query_context_loading_end')
  query.queryCheckpoint('query_api_request_sent')
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  const report = query.getQueryProfileReport()
  assert.match(report, /QUERY PROFILING REPORT/)
  assert.match(report, /Total TTFT:/)
  assert.match(report, /PHASE BREAKDOWN:/)

  const aiReport = query.getQueryAiReport()
  assert.ok(aiReport)
  assert.equal(aiReport.mode, 'query')
  assert.ok(aiReport.bottlenecks.length > 0)
  assert.match(aiReport.summary, /TTFT/)
})

test('headless profiler: per-turn metrics', async () => {
  process.env.PERF_PROFILE_STARTUP = '1'
  const headless = await import(`../src/headless.ts?smoke-headless=${Date.now()}`)
  headless.setNonInteractiveSession(true)

  headless.headlessProfilerStartTurn()
  headless.headlessProfilerCheckpoint('system_message_yielded')
  headless.headlessProfilerCheckpoint('query_started')
  headless.headlessProfilerCheckpoint('api_request_sent')
  headless.headlessProfilerCheckpoint('first_chunk')

  const metrics = headless.getHeadlessTurnMetrics()
  assert.ok(metrics)
  assert.equal(metrics.turn_number, 0)
  assert.ok(typeof metrics.time_to_first_response_ms === 'number')
  assert.ok(metrics.checkpoint_count >= 5)

  const aiReport = headless.getHeadlessAiReport()
  assert.ok(aiReport)
  assert.equal(aiReport.mode, 'headless')
  assert.ok(aiReport.phases.length >= 3)
})

test.after(() => {
  rmSync(tmp, { recursive: true, force: true })
})
