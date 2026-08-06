/**
 * Headless mode profiling utility for measuring per-turn latency in
 * non-interactive (one-shot / `-p`) mode.
 *
 * Extracted from `src/utils/headlessProfiler.ts` (Claude Code source snapshot).
 *
 * Tracks key timing phases per turn:
 * - Time to system message output (turn 0 only)
 * - Time to first query started
 * - Time to first API response (TTFT)
 *
 * Uses Node.js built-in performance hooks API for standard timing measurement.
 * Sampled logging: 5% of sessions to the analytics sink (inert by default).
 *
 * Set `PERF_PROFILE_STARTUP=1` (or `CLAUDE_CODE_PROFILE_STARTUP=1`) for
 * detailed logging output.
 */

import { logEvent } from './analytics.js'
import { logForDebugging } from './logger.js'
import { PROFILE_STARTUP_ENV_VARS, firstEnvTruthy } from './env.js'
import { getPerformance } from './base.js'

// Non-interactive session state. In Claude Code this came from
// `src/bootstrap/state.ts`; embedders of this standalone tool must opt in.
let nonInteractiveSession = false

export function setNonInteractiveSession(value: boolean): void {
  nonInteractiveSession = value
}

export function getIsNonInteractiveSession(): boolean {
  return nonInteractiveSession
}

// Detailed profiling mode - same env var as startupProfiler
const DETAILED_PROFILING = firstEnvTruthy(...PROFILE_STARTUP_ENV_VARS)

// Sampling for telemetry logging: 5% of sessions.
// Decision made once at module load - non-sampled sessions pay no profiling cost.
const STATSIG_SAMPLE_RATE = 0.05
const STATSIG_LOGGING_SAMPLED = Math.random() < STATSIG_SAMPLE_RATE

// Enable profiling if either detailed mode OR sampled for telemetry
const SHOULD_PROFILE = DETAILED_PROFILING || STATSIG_LOGGING_SAMPLED

// Use a unique prefix to avoid conflicts with other profiler marks
const MARK_PREFIX = 'headless_'

// Track current turn number (auto-incremented by headlessProfilerStartTurn)
let currentTurnNumber = -1

/**
 * Clear all headless profiler marks from performance timeline
 */
function clearHeadlessMarks(): void {
  const perf = getPerformance()
  const allMarks = perf.getEntriesByType('mark')
  for (const mark of allMarks) {
    if (mark.name.startsWith(MARK_PREFIX)) {
      perf.clearMarks(mark.name)
    }
  }
}

/**
 * Start a new turn for profiling. Clears previous marks, increments turn number,
 * and records turn_start. Call this at the beginning of each user message processing.
 */
export function headlessProfilerStartTurn(): void {
  // Only profile in headless/non-interactive mode
  if (!getIsNonInteractiveSession()) return
  // Only profile if enabled
  if (!SHOULD_PROFILE) return

  currentTurnNumber++
  clearHeadlessMarks()

  const perf = getPerformance()
  perf.mark(`${MARK_PREFIX}turn_start`)

  if (DETAILED_PROFILING) {
    logForDebugging(`[headlessProfiler] Started turn ${currentTurnNumber}`)
  }
}

/**
 * Record a checkpoint with the given name.
 * Only records if in headless mode and profiling is enabled.
 */
export function headlessProfilerCheckpoint(name: string): void {
  // Only profile in headless/non-interactive mode
  if (!getIsNonInteractiveSession()) return
  // Only profile if enabled
  if (!SHOULD_PROFILE) return

  const perf = getPerformance()
  perf.mark(`${MARK_PREFIX}${name}`)

  if (DETAILED_PROFILING) {
    logForDebugging(
      `[headlessProfiler] Checkpoint: ${name} at ${perf.now().toFixed(1)}ms`,
    )
  }
}

/**
 * Compute headless latency metrics for the current turn.
 * Returns null when profiling is not active or no checkpoints were recorded.
 */
export function getHeadlessTurnMetrics(): Record<
  string,
  number | string | undefined
> | null {
  // Only log in headless mode
  if (!getIsNonInteractiveSession()) return null
  // Only log if enabled
  if (!SHOULD_PROFILE) return null

  const perf = getPerformance()
  const allMarks = perf.getEntriesByType('mark')

  // Filter to only our headless marks
  const marks = allMarks.filter(mark => mark.name.startsWith(MARK_PREFIX))
  if (marks.length === 0) return null

  // Build checkpoint lookup (strip prefix for easier access)
  const checkpointTimes = new Map<string, number>()
  for (const mark of marks) {
    const name = mark.name.slice(MARK_PREFIX.length)
    checkpointTimes.set(name, mark.startTime)
  }

  const turnStart = checkpointTimes.get('turn_start')
  if (turnStart === undefined) return null

  // Compute phase durations relative to turn_start
  const metadata: Record<string, number | string | undefined> = {
    turn_number: currentTurnNumber,
  }

  // Time to system message from process start (only meaningful for turn 0)
  // Use absolute time since perf_hooks startTime is relative to process start
  const systemMessageTime = checkpointTimes.get('system_message_yielded')
  if (systemMessageTime !== undefined && currentTurnNumber === 0) {
    metadata.time_to_system_message_ms = Math.round(systemMessageTime)
  }

  // Time to query start
  const queryStartTime = checkpointTimes.get('query_started')
  if (queryStartTime !== undefined) {
    metadata.time_to_query_start_ms = Math.round(queryStartTime - turnStart)
  }

  // Time to first response (first chunk from API)
  const firstChunkTime = checkpointTimes.get('first_chunk')
  if (firstChunkTime !== undefined) {
    metadata.time_to_first_response_ms = Math.round(firstChunkTime - turnStart)
  }

  // Query overhead (time between query start and API request sent)
  const apiRequestTime = checkpointTimes.get('api_request_sent')
  if (queryStartTime !== undefined && apiRequestTime !== undefined) {
    metadata.query_overhead_ms = Math.round(apiRequestTime - queryStartTime)
  }

  // Add checkpoint count for debugging
  metadata.checkpoint_count = marks.length

  // Add entrypoint for segmentation if provided
  if (process.env.PERF_ENTRYPOINT) {
    metadata.entrypoint = process.env.PERF_ENTRYPOINT
  }

  return metadata
}

/**
 * Log headless latency metrics for the current turn to the analytics sink.
 * Call this at the end of each turn (before processing next user message).
 */
export function logHeadlessProfilerTurn(): void {
  const metadata = getHeadlessTurnMetrics()
  if (!metadata) return

  // Log to analytics sink if sampled
  if (STATSIG_LOGGING_SAMPLED) {
    logEvent('tengu_headless_latency', metadata)
  }

  // Log detailed output if detailed profiling enabled
  if (DETAILED_PROFILING) {
    logForDebugging(
      `[headlessProfiler] Turn ${currentTurnNumber} metrics: ${JSON.stringify(metadata)}`,
    )
  }
}
