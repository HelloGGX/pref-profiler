// Unit tests for the small helper modules: env, config, format, analytics, logger.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isEnvTruthy, firstEnvTruthy } from '../src/env.js'
import {
  getConfigHomeDir,
  getOutputDir,
  getSessionId,
  setSessionId,
} from '../src/config.js'
import { formatFileSize } from '../src/format.js'
import { setAnalyticsSink, logEvent } from '../src/analytics.js'
import {
  setDebugEnabled,
  isDebugEnabled,
  logForDebugging,
} from '../src/logger.js'

test('isEnvTruthy handles all documented forms', () => {
  assert.equal(isEnvTruthy(undefined), false)
  assert.equal(isEnvTruthy(''), false)
  assert.equal(isEnvTruthy('0'), false)
  assert.equal(isEnvTruthy('false'), false)
  assert.equal(isEnvTruthy('no'), false)
  assert.equal(isEnvTruthy('off'), false)
  assert.equal(isEnvTruthy('1'), true)
  assert.equal(isEnvTruthy('true'), true)
  assert.equal(isEnvTruthy('yes'), true)
  assert.equal(isEnvTruthy('on'), true)
  assert.equal(isEnvTruthy(' TRUE '), true)
  assert.equal(isEnvTruthy(true), true)
  assert.equal(isEnvTruthy(false), false)
})

test('firstEnvTruthy checks each variable in order', () => {
  delete process.env.PP_A
  delete process.env.PP_B
  assert.equal(firstEnvTruthy('PP_A', 'PP_B'), false)
  process.env.PP_B = 'yes'
  assert.equal(firstEnvTruthy('PP_A', 'PP_B'), true)
  delete process.env.PP_B
})

test('config honors env vars and falls back to defaults', () => {
  const originalConfig = process.env.PERF_CONFIG_DIR
  const originalOutput = process.env.PERF_OUTPUT_DIR
  try {
    process.env.PERF_CONFIG_DIR = join(homedir(), '.custom-perf')
    process.env.PERF_OUTPUT_DIR = join(process.env.PERF_CONFIG_DIR, 'out')
    assert.equal(getConfigHomeDir(), process.env.PERF_CONFIG_DIR)
    assert.equal(getOutputDir(), process.env.PERF_OUTPUT_DIR)
    delete process.env.PERF_OUTPUT_DIR
    assert.equal(getOutputDir(), join(process.env.PERF_CONFIG_DIR, 'reports'))
    delete process.env.PERF_CONFIG_DIR
    assert.equal(getConfigHomeDir(), join(homedir(), '.perf-profiler'))
  } finally {
    if (originalConfig === undefined) {
      delete process.env.PERF_CONFIG_DIR
    } else {
      process.env.PERF_CONFIG_DIR = originalConfig
    }
    if (originalOutput === undefined) {
      delete process.env.PERF_OUTPUT_DIR
    } else {
      process.env.PERF_OUTPUT_DIR = originalOutput
    }
  }
})

test('session id is stable once set and UUID-generated otherwise', async () => {
  setSessionId('fixed-id')
  assert.equal(getSessionId(), 'fixed-id')
  assert.equal(getSessionId(), 'fixed-id')

  // Fresh module instance (cache-busted import) has no session id yet.
  const fresh = await import(`../src/config.ts?fresh=${Date.now()}`)
  const generated = fresh.getSessionId()
  assert.match(generated, /^[0-9a-f-]{36}$/)
})

test('formatFileSize covers bytes, KB, MB and GB', () => {
  assert.equal(formatFileSize(512), '512 bytes')
  assert.equal(formatFileSize(1024), '1KB')
  assert.equal(formatFileSize(1536), '1.5KB')
  assert.equal(formatFileSize(2048), '2KB')
  assert.equal(formatFileSize(1024 * 1024), '1MB')
  assert.equal(formatFileSize(1024 * 1024 * 1024), '1GB')
})

test('analytics sink receives events only while attached', () => {
  const events = []
  setAnalyticsSink((event, metadata) => events.push([event, metadata]))
  logEvent('startup_perf', { checkpoint_count: 3 })
  assert.deepEqual(events, [['startup_perf', { checkpoint_count: 3 }]])
  setAnalyticsSink(null)
  logEvent('headless_latency', {})
  assert.equal(events.length, 1)
})

test('debug logger writes to stderr only when enabled', () => {
  const originalWrite = process.stderr.write
  const chunks = []
  process.stderr.write = chunk => {
    chunks.push(String(chunk))
    return true
  }
  try {
    setDebugEnabled(false)
    assert.equal(isDebugEnabled(), false)
    logForDebugging('hidden message')
    assert.equal(chunks.length, 0)

    setDebugEnabled(true)
    logForDebugging('visible message')
    assert.equal(chunks.length, 1)
    assert.match(chunks[0], /\[DEBUG\] visible message/)

    logForDebugging('warn message', { level: 'warn' })
    assert.match(chunks[1], /\[WARN\] warn message/)
  } finally {
    process.stderr.write = originalWrite
    setDebugEnabled(false)
  }
})

test('package index re-exports the public API', async () => {
  const api = await import('../src/index.ts')
  const exported = [
    'profileCheckpoint',
    'profileReport',
    'getStartupPerfLogPath',
    'getStartupAiReport',
    'startQueryProfile',
    'queryCheckpoint',
    'endQueryProfile',
    'getQueryProfileReport',
    'getQueryAiReport',
    'setNonInteractiveSession',
    'headlessProfilerStartTurn',
    'headlessProfilerCheckpoint',
    'getHeadlessTurnMetrics',
    'getHeadlessAiReport',
    'buildReport',
    'marksToCheckpoints',
    'phasesFromCheckpoints',
    'suggestForPhase',
    'jsonStringifyReport',
    'setAnalyticsSink',
    'setDebugEnabled',
    'setSessionId',
    'getSessionId',
    'getOutputDir',
    'formatFileSize',
    'isEnvTruthy',
    'firstEnvTruthy',
  ]
  for (const name of exported) {
    assert.equal(typeof api[name], 'function', `missing export: ${name}`)
  }
})
