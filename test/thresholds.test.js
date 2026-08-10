// End-to-end tests for the anomaly thresholds that only trigger with real
// elapsed time: slow checkpoints, network TTFB, headless overhead/TTFR.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { setAnalyticsSink } from '../dist/analytics.js'
import { setDebugEnabled } from '../dist/logger.js'

process.env.PERF_PROFILE_QUERY = '1'
process.env.PERF_PROFILE_STARTUP = '1'

const query = await import(`../dist/query.js?thresholds=${Date.now()}`)
const headless = await import(`../dist/headless.js?thresholds=${Date.now()}`)

test('query report flags VERY SLOW deltas and AI report marks critical', async () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  await sleep(1010)
  query.queryCheckpoint('query_slow_work')
  query.queryCheckpoint('query_api_request_sent')
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  const text = query.getQueryProfileReport()
  assert.match(text, /VERY SLOW/)

  const ai = query.getQueryAiReport()
  assert.ok(
    ai.anomalies.some(a => a.severity === 'critical'),
    'expected a critical anomaly for the >1000ms delta',
  )
})

test('query report flags SLOW and known tool-schema warnings', async () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  await sleep(150)
  query.queryCheckpoint('query_context_loading_end')
  await sleep(60)
  query.queryCheckpoint('query_tool_schema_build_end')
  query.queryCheckpoint('query_api_request_sent')
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  const text = query.getQueryProfileReport()
  assert.match(text, /SLOW/)
  assert.match(text, /tool schemas/)
})

test('query report flags git status and client creation warnings', async () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  await sleep(60)
  query.queryCheckpoint('query_git_status_check')
  await sleep(60)
  query.queryCheckpoint('query_client_creation_end')
  query.queryCheckpoint('query_api_request_sent')
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  const text = query.getQueryProfileReport()
  assert.match(text, /git status/)
  assert.match(text, /client creation/)

  const ai = query.getQueryAiReport()
  const warnings = ai.anomalies.filter(a => a.severity === 'warning')
  assert.ok(warnings.some(a => a.checkpoint === 'query_git_status_check'))
  assert.ok(warnings.some(a => a.checkpoint === 'query_client_creation_end'))
})

test('query report falls back to total time without first chunk', async () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.queryCheckpoint('query_context_loading_end')
  query.endQueryProfile()

  const text = query.getQueryProfileReport()
  assert.doesNotMatch(text, /Total TTFT:/)
  assert.match(text, /Total time:/)

  // Public debug helper runs without throwing.
  query.logQueryProfileReport()
})

test('query AI report flags network latency above 300ms', async () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.queryCheckpoint('query_context_loading_end')
  query.queryCheckpoint('query_api_request_sent')
  await sleep(330)
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  const ai = query.getQueryAiReport()
  const network = ai.anomalies.find(a => a.phase === 'Network TTFB')
  assert.ok(network, 'expected a Network TTFB anomaly')
  assert.equal(network.severity, 'warning')
  assert.equal(ai.mode, 'query')
})

test('query AI report flags network latency above 1000ms as critical', async () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.queryCheckpoint('query_context_loading_end')
  query.queryCheckpoint('query_api_request_sent')
  await sleep(1050)
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  const ai = query.getQueryAiReport()
  const network = ai.anomalies.find(a => a.phase === 'Network TTFB')
  assert.ok(network, 'expected a Network TTFB anomaly')
  assert.equal(network.severity, 'critical')
  assert.equal(network.thresholdMs, 1000)
})

test('headless AI report flags query overhead above 500ms', async () => {
  headless.setNonInteractiveSession(true)
  headless.headlessProfilerStartTurn()
  headless.headlessProfilerCheckpoint('system_message_yielded')
  headless.headlessProfilerCheckpoint('query_started')
  await sleep(520)
  headless.headlessProfilerCheckpoint('api_request_sent')
  headless.headlessProfilerCheckpoint('first_chunk')

  const metrics = headless.getHeadlessTurnMetrics()
  assert.equal(typeof metrics.time_to_system_message_ms, 'number')

  const ai = headless.getHeadlessAiReport()
  assert.ok(
    ai.anomalies.some(
      a => a.phase === 'query_overhead' && a.severity === 'warning',
    ),
    'expected a query_overhead warning',
  )
})

test('headless metrics include the entrypoint and log to the sink', () => {
  process.env.PERF_ENTRYPOINT = 'repl'
  const events = []
  setAnalyticsSink((event, metadata) => events.push([event, metadata]))
  setDebugEnabled(true)
  try {
    headless.headlessProfilerStartTurn()
    headless.headlessProfilerCheckpoint('query_started')
    headless.headlessProfilerCheckpoint('first_chunk')

    const metrics = headless.getHeadlessTurnMetrics()
    assert.equal(metrics.entrypoint, 'repl')

    headless.logHeadlessProfilerTurn()
    assert.ok(events.some(([event]) => event === 'headless_latency'))
  } finally {
    delete process.env.PERF_ENTRYPOINT
    setAnalyticsSink(null)
    setDebugEnabled(false)
  }
})

test('headless AI report flags TTFR above 1000ms', async () => {
  headless.headlessProfilerStartTurn()
  headless.headlessProfilerCheckpoint('query_started')
  headless.headlessProfilerCheckpoint('api_request_sent')
  await sleep(1050)
  headless.headlessProfilerCheckpoint('first_chunk')

  const ai = headless.getHeadlessAiReport()
  assert.ok(
    ai.anomalies.some(
      a => a.phase === 'first_response' && a.severity === 'warning',
    ),
    'expected a first_response warning',
  )
})

test('headless AI report flags TTFR above 2000ms as critical', async () => {
  headless.headlessProfilerStartTurn()
  headless.headlessProfilerCheckpoint('query_started')
  headless.headlessProfilerCheckpoint('api_request_sent')
  await sleep(2050)
  headless.headlessProfilerCheckpoint('first_chunk')

  const ai = headless.getHeadlessAiReport()
  assert.ok(
    ai.anomalies.some(
      a => a.phase === 'first_response' && a.severity === 'critical',
    ),
    'expected a first_response critical anomaly',
  )
})
