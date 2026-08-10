/**
 * Query profiling utility for measuring and reporting time spent in the query
 * pipeline from user input to first token arrival.
 *
 * Enable by setting `PERF_PROFILE_QUERY=1`. Produces a human-readable report
 * (TTFT breakdown, phase bars, slow-operation warnings) and an AI-friendly
 * JSON report via getQueryAiReport().
 *
 * Uses Node.js built-in performance hooks API for standard timing measurement.
 * Tracks each query session with detailed checkpoints for identifying
 * bottlenecks.
 *
 * Checkpoints tracked (in order):
 * - query_user_input_received: Start of profiling
 * - query_context_loading_start/end: Loading system prompts and contexts
 * - query_query_start: Entry to query call from REPL
 * - query_fn_entry: Entry to query() function
 * - query_microcompact_start/end: Microcompaction of messages
 * - query_autocompact_start/end: Autocompaction check
 * - query_setup_start/end: StreamingToolExecutor and model setup
 * - query_api_loop_start: Start of API retry loop
 * - query_api_streaming_start: Start of streaming API call
 * - query_tool_schema_build_start/end: Building tool schemas
 * - query_message_normalization_start/end: Normalizing messages
 * - query_client_creation_start/end: Creating Anthropic client
 * - query_api_request_sent: HTTP request dispatched (before await, inside retry body)
 * - query_response_headers_received: .withResponse() resolved (headers arrived)
 * - query_first_chunk_received: First streaming chunk received (TTFT)
 * - query_api_streaming_end: Streaming complete
 * - query_tool_execution_start/end: Tool execution
 * - query_recursive_call: Before recursive query call
 * - query_end: End of query
 */

import { logForDebugging } from './logger.js'
import { PROFILE_QUERY_ENV_VARS, firstEnvTruthy } from './env.js'
import { formatMs, formatTimelineLine, getPerformance } from './base.js'
import {
  type AiReport,
  type Anomaly,
  buildReport,
  marksToCheckpoints,
  phasesFromCheckpoints,
  suggestForPhase,
} from './analyze.js'

// Module-level state - initialized once when the module loads
const ENABLED = firstEnvTruthy(...PROFILE_QUERY_ENV_VARS)

// Unique mark prefix. Checkpoint names already start with "query_"; the extra
// prefix keeps this profiler's marks isolated from the startup/headless
// profilers on the shared perf_hooks timeline.
const MARK_PREFIX = 'qry_'

// Track memory snapshots separately (perf_hooks doesn't track memory)
const memorySnapshots = new Map<string, NodeJS.MemoryUsage>()

// Track query count for reporting
let queryCount = 0

/**
 * Start profiling a new query session
 */
export function startQueryProfile(): void {
  if (!ENABLED) return

  // Clear only this profiler's marks, leaving other profilers' timelines intact
  clearQueryMarks()
  memorySnapshots.clear()

  queryCount++

  // Record the start checkpoint
  queryCheckpoint('query_user_input_received')
}

/** Remove only marks belonging to this profiler. */
function clearQueryMarks(): void {
  const perf = getPerformance()
  for (const mark of perf.getEntriesByType('mark')) {
    if (mark.name.startsWith(MARK_PREFIX)) {
      perf.clearMarks(mark.name)
    }
  }
}

/** Marks recorded by this profiler, with the prefix stripped. */
function getQueryMarks(): Array<{ name: string; startTime: number }> {
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
 * Record a checkpoint with the given name
 */
export function queryCheckpoint(name: string): void {
  if (!ENABLED) return

  const perf = getPerformance()
  perf.mark(`${MARK_PREFIX}${name}`)
  memorySnapshots.set(`${MARK_PREFIX}${name}`, process.memoryUsage())
}

/**
 * End the current query profiling session
 */
export function endQueryProfile(): void {
  if (!ENABLED) return

  queryCheckpoint('query_profile_end')
}

/**
 * Identify slow operations (> 100ms delta)
 */
function getSlowWarning(deltaMs: number, name: string): string {
  // Don't flag the first checkpoint as slow - it measures time from process start,
  // not actual processing overhead
  if (name === 'query_user_input_received') {
    return ''
  }

  if (deltaMs > 1000) {
    return ' ⚠️  VERY SLOW'
  }
  if (deltaMs > 100) {
    return ' ⚠️  SLOW'
  }

  // Specific warnings for known bottlenecks
  if (name.includes('git_status') && deltaMs > 50) {
    return ' ⚠️  git status'
  }
  if (name.includes('tool_schema') && deltaMs > 50) {
    return ' ⚠️  tool schemas'
  }
  if (name.includes('client_creation') && deltaMs > 50) {
    return ' ⚠️  client creation'
  }

  return ''
}

/**
 * Get a formatted report of all checkpoints for the current/last query
 */
export function getQueryProfileReport(): string {
  if (!ENABLED) {
    return 'Query profiling not enabled (set PERF_PROFILE_QUERY=1)'
  }

  const marks = getQueryMarks()
  if (marks.length === 0) {
    return 'No query profiling checkpoints recorded'
  }

  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push(`QUERY PROFILING REPORT - Query #${queryCount}`)
  lines.push('='.repeat(80))
  lines.push('')

  // Use first mark as baseline (query start time) to show relative times
  const baselineTime = marks[0]?.startTime ?? 0
  let prevTime = baselineTime
  let apiRequestSentTime = 0
  let firstChunkTime = 0

  for (const mark of marks) {
    const relativeTime = mark.startTime - baselineTime
    const deltaMs = mark.startTime - prevTime
    lines.push(
      formatTimelineLine(
        relativeTime,
        deltaMs,
        mark.name,
        memorySnapshots.get(`${MARK_PREFIX}${mark.name}`),
        10,
        9,
        getSlowWarning(deltaMs, mark.name),
      ),
    )

    // Track key milestones for summary (use relative times)
    if (mark.name === 'query_api_request_sent') {
      apiRequestSentTime = relativeTime
    }
    if (mark.name === 'query_first_chunk_received') {
      firstChunkTime = relativeTime
    }

    prevTime = mark.startTime
  }

  // Calculate summary statistics (relative to baseline)
  const lastMark = marks[marks.length - 1]
  const totalTime = lastMark ? lastMark.startTime - baselineTime : 0

  lines.push('')
  lines.push('-'.repeat(80))

  if (firstChunkTime > 0) {
    const preRequestOverhead = apiRequestSentTime
    const networkLatency = firstChunkTime - apiRequestSentTime
    const preRequestPercent = (
      (preRequestOverhead / firstChunkTime) *
      100
    ).toFixed(1)
    const networkPercent = ((networkLatency / firstChunkTime) * 100).toFixed(1)

    lines.push(`Total TTFT: ${formatMs(firstChunkTime)}ms`)
    lines.push(
      `  - Pre-request overhead: ${formatMs(preRequestOverhead)}ms (${preRequestPercent}%)`,
    )
    lines.push(
      `  - Network latency: ${formatMs(networkLatency)}ms (${networkPercent}%)`,
    )
  } else {
    lines.push(`Total time: ${formatMs(totalTime)}ms`)
  }

  // Add phase summary
  lines.push(getPhaseSummary(marks, baselineTime))

  lines.push('='.repeat(80))

  return lines.join('\n')
}

const QUERY_PHASE_DEFINITIONS: Record<string, readonly [string, string]> = {
  'Context loading': ['query_context_loading_start', 'query_context_loading_end'],
  Microcompact: ['query_microcompact_start', 'query_microcompact_end'],
  Autocompact: ['query_autocompact_start', 'query_autocompact_end'],
  'Query setup': ['query_setup_start', 'query_setup_end'],
  'Tool schemas': [
    'query_tool_schema_build_start',
    'query_tool_schema_build_end',
  ],
  'Message normalization': [
    'query_message_normalization_start',
    'query_message_normalization_end',
  ],
  'Client creation': ['query_client_creation_start', 'query_client_creation_end'],
  'Network TTFB': ['query_api_request_sent', 'query_first_chunk_received'],
  'Tool execution': ['query_tool_execution_start', 'query_tool_execution_end'],
}

/**
 * Structured phase durations for the current query (relative to baseline).
 */
function getQueryPhases(
  marks: Array<{ name: string; startTime: number }>,
  baselineTime: number,
): ReturnType<typeof phasesFromCheckpoints> {
  const checkpointTimes = new Map(marks.map(m => [m.name, m.startTime]))
  return phasesFromCheckpoints(
    QUERY_PHASE_DEFINITIONS,
    checkpointTimes,
    baselineTime,
  )
}

/**
 * Get phase-based summary showing time spent in each major phase
 */
function getPhaseSummary(
  marks: Array<{ name: string; startTime: number }>,
  baselineTime: number,
): string {
  const phases = getQueryPhases(marks, baselineTime)
  const markMap = new Map(marks.map(m => [m.name, m.startTime - baselineTime]))
  const lines: string[] = []
  lines.push('')
  lines.push('PHASE BREAKDOWN:')

  for (const phase of phases) {
    const bar = '█'.repeat(Math.min(Math.ceil(phase.durationMs / 10), 50)) // 1 block per 10ms, max 50
    lines.push(
      `  ${phase.name.padEnd(22)} ${formatMs(phase.durationMs).padStart(10)}ms ${bar}`,
    )
  }

  // Calculate pre-API overhead (everything before api_request_sent)
  const apiRequestSent = markMap.get('query_api_request_sent')
  if (apiRequestSent !== undefined) {
    lines.push('')
    lines.push(
      `  ${'Total pre-API overhead'.padEnd(22)} ${formatMs(apiRequestSent).padStart(10)}ms`,
    )
  }

  return lines.join('\n')
}

/**
 * Log the query profile report to debug output
 */
export function logQueryProfileReport(): void {
  if (!ENABLED) return
  logForDebugging(getQueryProfileReport())
}

/**
 * Build the AI-friendly structured report for the current/last query.
 * Returns null when profiling is not enabled or no checkpoints were recorded.
 */
export function getQueryAiReport(): AiReport | null {
  if (!ENABLED) return null

  const marks = getQueryMarks()
  if (marks.length === 0) return null

  const baseline = marks[0]?.startTime ?? 0
  const checkpoints = marksToCheckpoints(marks, name =>
    memorySnapshots.get(`${MARK_PREFIX}${name}`),
  )
  const phases = getQueryPhases(marks, baseline)

  const extraAnomalies: Anomaly[] = []
  const times = new Map(marks.map(m => [m.name, m.startTime - baseline]))
  const apiSent = times.get('query_api_request_sent')
  const firstChunk = times.get('query_first_chunk_received')

  if (apiSent !== undefined && firstChunk !== undefined) {
    const networkLatency = Math.max(0, firstChunk - apiSent)
    if (networkLatency > 1000) {
      extraAnomalies.push({
        severity: 'critical',
        phase: 'Network TTFB',
        durationMs: networkLatency,
        thresholdMs: 1000,
        reason: 'Network latency exceeds 1000ms',
        suggestion: suggestForPhase('Network TTFB'),
      })
    } else if (networkLatency > 300) {
      extraAnomalies.push({
        severity: 'warning',
        phase: 'Network TTFB',
        durationMs: networkLatency,
        thresholdMs: 300,
        reason: 'Network latency exceeds 300ms',
        suggestion: suggestForPhase('Network TTFB'),
      })
    }
  }

  return buildReport({
    mode: 'query',
    checkpoints,
    phases,
    extraAnomalies,
  })
}
