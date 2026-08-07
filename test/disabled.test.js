// Disabled-mode behavior: with no PERF_PROFILE_* env var set, every profiler
// must be inert - no marks, no reports, no files, no exceptions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Ensure the fresh module instances (cache-busted imports) see no flags.
delete process.env.PERF_PROFILE_STARTUP
delete process.env.PERF_PROFILE_QUERY
process.env.PERF_OUTPUT_DIR = join(mkdtempSync(join(tmpdir(), 'pp-disabled-')), 'reports')

test.after(() => {
  rmSync(process.env.PERF_OUTPUT_DIR, { recursive: true, force: true })
})

test('startup profiler is inert when disabled', async () => {
  const startup = await import(`../dist/startup.js?disabled=${Date.now()}`)
  startup.profileCheckpoint('cli_entry')
  startup.profileReport()
  assert.equal(startup.getStartupAiReport(), null)
  assert.equal(startup.isDetailedProfilingEnabled(), false)
})

test('query profiler is inert when disabled', async () => {
  const query = await import(`../dist/query.js?disabled=${Date.now()}`)
  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  query.endQueryProfile()
  assert.equal(query.getQueryAiReport(), null)
  assert.match(query.getQueryProfileReport(), /not enabled/)
})

test('headless profiler is inert when disabled', async () => {
  const headless = await import(`../dist/headless.js?disabled=${Date.now()}`)
  headless.setNonInteractiveSession(true)
  headless.headlessProfilerStartTurn()
  headless.headlessProfilerCheckpoint('first_chunk')
  assert.equal(headless.getHeadlessTurnMetrics(), null)
  assert.equal(headless.getHeadlessAiReport(), null)
})

test('headless profiler requires the non-interactive opt-in even when enabled', async () => {
  process.env.PERF_PROFILE_STARTUP = '1'
  try {
    const headless = await import(`../dist/headless.js?optin=${Date.now()}`)
    headless.headlessProfilerStartTurn()
    headless.headlessProfilerCheckpoint('first_chunk')
    assert.equal(headless.getHeadlessTurnMetrics(), null)
    assert.equal(headless.getHeadlessAiReport(), null)
  } finally {
    delete process.env.PERF_PROFILE_STARTUP
  }
})
