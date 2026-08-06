// Regression tests: the three profilers share one process-wide perf_hooks
// timeline, so marks must be isolated by namespace. These tests previously
// failed: query profiling wiped startup marks, and the startup report mixed in
// headless marks with misaligned memory snapshots.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.PERF_PROFILE_STARTUP = '1'
process.env.PERF_PROFILE_QUERY = '1'

const startup = await import(`../src/startup.ts?isolation=${Date.now()}`)
const query = await import(`../src/query.ts?isolation=${Date.now()}`)
const headless = await import(`../src/headless.ts?isolation=${Date.now()}`)

const startupNames = () =>
  startup.getStartupAiReport().checkpoints.map(c => c.name)

test('query profiling does not clobber the startup timeline', () => {
  startup.profileCheckpoint('cli_entry')
  startup.profileCheckpoint('main_after_run')

  const before = startupNames()
  assert.ok(before.includes('cli_entry'))
  assert.ok(before.includes('main_after_run'))

  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  // Startup marks must survive a query session untouched.
  const after = startupNames()
  assert.deepEqual(after, before)
  assert.ok(!after.some(n => n.startsWith('query_')))
  assert.ok(!after.some(n => n.includes('headless_')))

  // The query report must contain only its own checkpoints.
  const qReport = query.getQueryAiReport()
  assert.equal(qReport.mode, 'query')
  assert.ok(qReport.checkpoints.length > 0)
  assert.ok(
    qReport.checkpoints.every(c => c.name.startsWith('query_')),
    'query report leaked foreign checkpoints',
  )
})

test('headless profiling does not leak into the startup report', () => {
  headless.setNonInteractiveSession(true)
  headless.headlessProfilerStartTurn()
  headless.headlessProfilerCheckpoint('query_started')
  headless.headlessProfilerCheckpoint('first_chunk')

  // Interleave a startup checkpoint after headless marks to exercise
  // index-based memory snapshot alignment.
  startup.profileCheckpoint('eagerLoadSettings_end')

  const sReport = startup.getStartupAiReport()
  assert.ok(!sReport.checkpoints.some(n => n.name.includes('headless_')))
  // Memory snapshots stay aligned with startup marks only.
  assert.ok(
    sReport.checkpoints.every(c => typeof c.rssBytes === 'number'),
    'foreign marks shifted the startup memory snapshots',
  )

  const hReport = headless.getHeadlessAiReport()
  assert.equal(hReport.mode, 'headless')
  assert.ok(
    hReport.checkpoints.every(c => !c.name.includes('headless_')),
    'headless report should expose names without the internal prefix',
  )
})

test('repeated query sessions keep their own marks', () => {
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.queryCheckpoint('query_first_chunk_received')
  query.endQueryProfile()

  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.endQueryProfile()

  const qReport = query.getQueryAiReport()
  assert.deepEqual(
    qReport.checkpoints.map(c => c.name),
    ['query_user_input_received', 'query_context_loading_start', 'query_profile_end'],
  )
})
