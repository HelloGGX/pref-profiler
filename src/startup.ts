/**
 * Startup profiling utility for measuring and reporting time spent in various
 * initialization phases.
 *
 * Enabled by `PERF_PROFILE_STARTUP=1`. Produces:
 * - a human-readable text report with memory snapshots, written to
 *   `<config-home>/reports/<sessionId>.txt`;
 * - an AI-friendly JSON report (`<sessionId>.json`) with detected anomalies
 *   and fix suggestions, for harness automation.
 *
 * Uses Node.js built-in performance hooks API for standard timing measurement.
 */

import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { logEvent } from './analytics.js'
import {
  type AiReport,
  buildReport,
  marksToCheckpoints,
  phasesFromCheckpoints,
} from './analyze.js'
import { getOutputDir, getSessionId } from './config.js'
import { PROFILE_STARTUP_ENV_VARS, firstEnvTruthy } from './env.js'
import { logForDebugging } from './logger.js'
import { formatMs, formatTimelineLine, getPerformance } from './base.js'

// Module-level state - decided once at module load
const DETAILED_PROFILING = firstEnvTruthy(...PROFILE_STARTUP_ENV_VARS)

// Enable profiling only when explicitly requested - deterministic, no hidden
// sampling. Disabled sessions pay no profiling cost.
const SHOULD_PROFILE = DETAILED_PROFILING

// Unique mark prefix so startup checkpoints never collide with or leak into
// the query/headless profilers, which share the same process-wide perf_hooks
// timeline.
const MARK_PREFIX = 'startup_'

// Track memory snapshots separately (perf_hooks doesn't track memory).
// Only used when DETAILED_PROFILING is enabled.
// Stored as an array that appends in the same order as perf.mark() calls, so
// memorySnapshots[i] corresponds to getStartupMarks()[i]. Using a Map
// keyed by checkpoint name is wrong because some checkpoints fire more than
// once (e.g. loadSettingsFromDisk_start fires during init and again after
// plugins reset the settings cache), and the second call would overwrite the
// first's memory snapshot.
const memorySnapshots: NodeJS.MemoryUsage[] = []

// Phase definitions: [startCheckpoint, endCheckpoint]
const PHASE_DEFINITIONS = {
  import_time: ['cli_entry', 'main_tsx_imports_loaded'],
  init_time: ['init_function_start', 'init_function_end'],
  settings_time: ['eagerLoadSettings_start', 'eagerLoadSettings_end'],
  total_time: ['cli_entry', 'main_after_run'],
} as const

// Record initial checkpoint if profiling is enabled
if (SHOULD_PROFILE) {
  profileCheckpoint('profiler_initialized')
}

/**
 * Record a checkpoint with the given name.
 */
export function profileCheckpoint(name: string): void {
  if (!SHOULD_PROFILE) return

  const perf = getPerformance()
  perf.mark(`${MARK_PREFIX}${name}`)

  // Only capture memory when detailed profiling enabled (env var)
  if (DETAILED_PROFILING) {
    memorySnapshots.push(process.memoryUsage())
  }
}

/**
 * Marks recorded by this profiler, with the prefix stripped so reports keep
 * the caller-facing checkpoint names.
 */
function getStartupMarks(): Array<{ name: string; startTime: number }> {
  const perf = getPerformance()
  return perf
    .getEntriesByType('mark')
    .filter(mark => mark.name.startsWith(MARK_PREFIX))
    .map(mark => ({
      name: mark.name.slice(MARK_PREFIX.length),
      startTime: mark.startTime,
    }))
}

/**
 * Get a formatted report of all checkpoints.
 * Only available when detailed profiling is enabled.
 */
function getReport(): string {
  if (!DETAILED_PROFILING) {
    return 'Startup profiling not enabled'
  }

  const marks = getStartupMarks()
  if (marks.length === 0) {
    return 'No profiling checkpoints recorded'
  }

  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push('STARTUP PROFILING REPORT')
  lines.push('='.repeat(80))
  lines.push('')

  let prevTime = 0
  for (const [i, mark] of marks.entries()) {
    lines.push(
      formatTimelineLine(
        mark.startTime,
        mark.startTime - prevTime,
        mark.name,
        memorySnapshots[i],
        8,
        7,
      ),
    )
    prevTime = mark.startTime
  }

  const lastMark = marks[marks.length - 1]
  lines.push('')
  lines.push(`Total startup time: ${formatMs(lastMark?.startTime ?? 0)}ms`)
  lines.push('='.repeat(80))

  return lines.join('\n')
}

let reported = false

/**
 * Emit the profiling report. Logs phase metrics to the analytics sink (if any)
 * and writes the detailed report to disk when detailed profiling is enabled.
 */
export function profileReport(): void {
  if (reported) return
  reported = true

  // Log phase durations to the analytics sink (if one is attached)
  logStartupPerf()

  // Write reports when detailed profiling enabled
  if (DETAILED_PROFILING) {
    const path = getStartupPerfLogPath()
    const dir = dirname(path)
    mkdirSync(dir, { recursive: true })
    writeFileSyncFlushed(path, getReport())

    const aiReport = getStartupAiReport()
    if (aiReport) {
      writeFileSyncFlushed(
        join(dir, `${getSessionId()}.json`),
        JSON.stringify(aiReport, null, 2),
      )
    }

    logForDebugging('Startup profiling report:')
    logForDebugging(getReport())
  }
}

export function isDetailedProfilingEnabled(): boolean {
  return DETAILED_PROFILING
}

export function getStartupPerfLogPath(): string {
  return join(getOutputDir(), `${getSessionId()}.txt`)
}

/**
 * Log startup performance phases to the analytics sink.
 */
export function logStartupPerf(): void {
  if (!SHOULD_PROFILE) return

  const marks = getStartupMarks()
  if (marks.length === 0) return

  // Build checkpoint lookup
  const checkpointTimes = new Map<string, number>()
  for (const mark of marks) {
    checkpointTimes.set(mark.name, mark.startTime)
  }

  // Compute phase durations
  const metadata: Record<string, number | undefined> = {}

  for (const [phaseName, [startCheckpoint, endCheckpoint]] of Object.entries(
    PHASE_DEFINITIONS,
  )) {
    const startTime = checkpointTimes.get(startCheckpoint)
    const endTime = checkpointTimes.get(endCheckpoint)

    if (startTime !== undefined && endTime !== undefined) {
      metadata[`${phaseName}_ms`] = Math.round(endTime - startTime)
    }
  }

  // Add checkpoint count for debugging
  metadata.checkpoint_count = marks.length

  logEvent('startup_perf', metadata)
}

/**
 * Build the AI-friendly structured report for the current startup profile.
 * Returns null when profiling is not enabled or no checkpoints were recorded.
 */
export function getStartupAiReport(): AiReport | null {
  if (!SHOULD_PROFILE) return null

  const marks = getStartupMarks()
  if (marks.length === 0) return null

  const checkpoints = marksToCheckpoints(
    marks,
    (_name, index) => memorySnapshots[index],
  )
  const checkpointTimes = new Map(
    marks.map((mark, index) => [mark.name, mark.startTime]),
  )
  const phases = phasesFromCheckpoints(PHASE_DEFINITIONS, checkpointTimes, 0)

  return buildReport({ mode: 'startup', checkpoints, phases })
}

/**
 * Sync write with fsync, replacing the original `writeFileSync_DEPRECATED`
 * flush path from `src/utils/slowOperations.ts`.
 */
function writeFileSyncFlushed(filePath: string, data: string): void {
  const fd = openSync(filePath, 'w')
  try {
    writeFileSync(fd, data, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
