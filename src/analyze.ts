/**
 * AI-friendly analysis of profiler checkpoints.
 *
 * Converts raw perf_hooks marks into structured, actionable JSON that an AI
 * agent (or harness) can consume to quickly locate and fix performance
 * bottlenecks: checkpoints, phase durations, detected anomalies with
 * severity, ranked bottlenecks, and concrete suggestions.
 */

import { getSessionId } from './config.js'

export type AnomalySeverity = 'critical' | 'warning' | 'info'

export type CheckpointInfo = {
  name: string
  /** Milliseconds since the first recorded checkpoint (or process start). */
  totalMs: number
  /** Milliseconds since the previous checkpoint. */
  deltaMs: number
  rssBytes?: number
  heapUsedBytes?: number
}

export type PhaseInfo = {
  name: string
  start: string
  end: string
  durationMs: number
  /** Share of total time, 0-100. */
  sharePct: number
}

export type Anomaly = {
  severity: AnomalySeverity
  checkpoint?: string
  phase?: string
  durationMs: number
  thresholdMs: number
  reason: string
  suggestion: string
}

/**
 * Failure details attached to a run report when the profiled command fails
 * (spawn failure or non-zero exit). Carries the captured child output so an
 * AI agent can see *why* it failed without re-running the command.
 */
export type ReportErrorInfo = {
  errorType: 'spawn_failed' | 'nonzero_exit'
  /** What the error is. */
  message: string
  /** Tail of the child's stdout/stderr that explains the failure. */
  stdoutTail?: string
  stderrTail?: string
}

export type AiReport = {
  schema: 'perf-profiler/report@1'
  generatedAt: string
  sessionId: string
  mode: 'startup' | 'query' | 'headless' | 'run'
  totals: {
    totalMs: number
    checkpointCount: number
    exitCode?: number
    wallMs?: number
    cpuMs?: number
  }
  checkpoints: CheckpointInfo[]
  phases: PhaseInfo[]
  anomalies: Anomaly[]
  bottlenecks: Array<{
    name: string
    durationMs: number
    sharePct: number
    suggestion: string
  }>
  summary: string
  suggestions: string[]
  /** Present only when the profiled command failed. */
  error?: ReportErrorInfo
}

const DEFAULT_SLOW_MS = 100
const DEFAULT_VERY_SLOW_MS = 1000
const KNOWN_BOTTLENECK_MS = 50
const MEMORY_WARN_BYTES = 512 * 1024 * 1024

// Phase-name -> fix suggestion mapping. Order matters: first match wins.
const PHASE_SUGGESTIONS: Array<[RegExp, string]> = [
  [
    /tool schemas?|tool_schema/i,
    'Cache tool schemas or build them lazily instead of regenerating per query.',
  ],
  [
    /client creation|client_creation/i,
    'Reuse a persistent API client instance instead of constructing one per query.',
  ],
  [
    /git/i,
    'Cache git status/diff results or run them asynchronously off the hot path.',
  ],
  [
    /network|ttfb|first.?chunk/i,
    'Check endpoint latency, connection keep-alive, compression, and request timeouts.',
  ],
  [
    /context loading/i,
    'Prefetch context during idle time, or trim system-prompt/tool-description size.',
  ],
  [
    /compact/i,
    'Tune compaction thresholds, or disable autocompact for latency-sensitive turns.',
  ],
  [
    /import|startup|init/i,
    'Lazy-load heavy modules and parallelize startup I/O to cut import time.',
  ],
  [
    /settings/i,
    'Cache settings reads and avoid synchronous disk I/O on hot paths.',
  ],
  [
    /tool execution/i,
    'Parallelize independent tool calls and cap output sizes.',
  ],
]

export function suggestForPhase(phaseName: string): string {
  const match = PHASE_SUGGESTIONS.find(([re]) => re.test(phaseName))
  return match
    ? match[1]
    : 'Investigate this phase for unnecessary work, blocking I/O, or serialization.'
}

function suggestForCheckpoint(checkpointName: string): string {
  const match = PHASE_SUGGESTIONS.find(([re]) => re.test(checkpointName))
  return match
    ? match[1]
    : 'Investigate this checkpoint for blocking work or repeated expensive setup.'
}

export type BuildReportInput = {
  mode: AiReport['mode']
  checkpoints: CheckpointInfo[]
  phases: PhaseInfo[]
  totalMs?: number
  exitCode?: number
  wallMs?: number
  cpuMs?: number
  summaryOverride?: string
  extraAnomalies?: Anomaly[]
  error?: ReportErrorInfo
}

/**
 * Build a structured AI report from checkpoints + phases, detecting anomalies
 * (slow deltas, known bottlenecks, memory pressure) and ranking bottlenecks
 * with concrete suggestions.
 */
export function buildReport(input: BuildReportInput): AiReport {
  const {
    mode,
    checkpoints,
    phases,
    extraAnomalies = [],
    summaryOverride,
  } = input
  const last = checkpoints.at(-1)
  const totalMs = input.totalMs ?? last?.totalMs ?? 0

  const anomalies: Anomaly[] = [...extraAnomalies]
  const suggestions = new Set<string>()

  // Delta-based anomaly detection. The first checkpoint measures time since
  // process start, so it is not flagged.
  for (let i = 1; i < checkpoints.length; i++) {
    const cp = checkpoints[i]!
    const threshold = cp.deltaMs > DEFAULT_VERY_SLOW_MS
      ? DEFAULT_VERY_SLOW_MS
      : cp.deltaMs > DEFAULT_SLOW_MS
        ? DEFAULT_SLOW_MS
        : KNOWN_BOTTLENECK_MS
    const isKnownBottleneck =
      /tool_schema|client_creation|git_status/.test(cp.name)
    const severity: AnomalySeverity | null =
      cp.deltaMs > DEFAULT_VERY_SLOW_MS
        ? 'critical'
        : cp.deltaMs > DEFAULT_SLOW_MS
          ? 'warning'
          : isKnownBottleneck && cp.deltaMs > KNOWN_BOTTLENECK_MS
            ? 'warning'
            : null
    if (severity) {
      const suggestion = suggestForCheckpoint(cp.name)
      anomalies.push({
        severity,
        checkpoint: cp.name,
        durationMs: cp.deltaMs,
        thresholdMs: threshold,
        reason:
          severity === 'critical'
            ? `Checkpoint delta exceeds ${DEFAULT_VERY_SLOW_MS}ms`
            : severity === 'warning' && !isKnownBottleneck
              ? `Checkpoint delta exceeds ${DEFAULT_SLOW_MS}ms`
              : `Known bottleneck "${cp.name}" exceeds ${KNOWN_BOTTLENECK_MS}ms`,
        suggestion,
      })
      suggestions.add(suggestion)
    }
  }

  // Memory pressure anomaly (heap snapshots are only available in detailed
  // profiling mode).
  const heapCheckpoint = checkpoints.find(
    cp => (cp.heapUsedBytes ?? 0) > MEMORY_WARN_BYTES,
  )
  if (heapCheckpoint) {
    const suggestion =
      'Investigate memory retention: growing heap across checkpoints often means unbounded caches or leaked references.'
    anomalies.push({
      severity: 'warning',
      checkpoint: heapCheckpoint.name,
      durationMs: heapCheckpoint.heapUsedBytes! / (1024 * 1024),
      thresholdMs: MEMORY_WARN_BYTES / (1024 * 1024),
      reason: `Heap usage exceeds ${MEMORY_WARN_BYTES / (1024 * 1024)}MB`,
      suggestion,
    })
    suggestions.add(suggestion)
  }

  // Rank bottlenecks: longest phases first. Whole-run phases (e.g.
  // "total_time") cover nearly the full span and carry no localization value,
  // so they are excluded from the ranking.
  const sortedPhases = phases
    .filter(p => !/^total_/i.test(p.name))
    .sort((a, b) => b.durationMs - a.durationMs)
  const bottlenecks = sortedPhases.slice(0, 5).map(p => {
    const suggestion = suggestForPhase(p.name)
    suggestions.add(suggestion)
    return {
      name: p.name,
      durationMs: p.durationMs,
      sharePct: p.sharePct,
      suggestion,
    }
  })

  const top = bottlenecks[0]
  const summary =
    summaryOverride ??
    `Total ${totalMs.toFixed(1)}ms across ${checkpoints.length} checkpoints` +
      (top
        ? `; top phase "${top.name}" took ${top.durationMs.toFixed(1)}ms (${top.sharePct.toFixed(1)}% of total)`
        : '') +
      (anomalies.length > 0
        ? `; ${anomalies.length} anomaly(ies) detected`
        : '; no anomalies detected')

  return {
    schema: 'perf-profiler/report@1',
    generatedAt: new Date().toISOString(),
    sessionId: getSessionId(),
    mode,
    totals: {
      totalMs,
      checkpointCount: checkpoints.length,
      ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
      ...(input.wallMs !== undefined ? { wallMs: input.wallMs } : {}),
      ...(input.cpuMs !== undefined ? { cpuMs: input.cpuMs } : {}),
    },
    checkpoints,
    phases,
    anomalies,
    bottlenecks,
    summary,
    suggestions: [...suggestions],
    ...(input.error ? { error: input.error } : {}),
  }
}

/**
 * Shared helper to convert perf_hooks marks into CheckpointInfo entries,
 * computing deltas and attaching memory snapshots when available.
 */
export function marksToCheckpoints(
  marks: Array<{ name: string; startTime: number }>,
  memoryFor?: (name: string, index: number) => NodeJS.MemoryUsage | undefined,
): CheckpointInfo[] {
  const baseline = marks[0]?.startTime ?? 0
  let prev = baseline
  return marks.map((mark, index) => {
    const memory = memoryFor?.(mark.name, index)
    const info: CheckpointInfo = {
      name: mark.name,
      totalMs: mark.startTime - baseline,
      deltaMs: index === 0 ? 0 : mark.startTime - prev,
      ...(memory ? { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed } : {}),
    }
    prev = mark.startTime
    return info
  })
}

/**
 * Build PhaseInfo entries from [start, end] checkpoint pairs, computing
 * durations and percentage share of the total baseline span.
 */
export function phasesFromCheckpoints(
  definitions: Record<string, readonly [string, string]>,
  checkpointTimes: Map<string, number>,
  baselineTime: number,
): PhaseInfo[] {
  const totalSpan = Math.max(
    ...checkpointTimes.values(),
    0,
  ) - baselineTime
  const phases: PhaseInfo[] = []
  for (const [name, [start, end]] of Object.entries(definitions)) {
    const startTime = checkpointTimes.get(start)
    const endTime = checkpointTimes.get(end)
    if (startTime === undefined || endTime === undefined) continue
    const durationMs = Math.max(0, endTime - startTime)
    phases.push({
      name,
      start,
      end,
      durationMs,
      sharePct: totalSpan > 0 ? (durationMs / totalSpan) * 100 : 0,
    })
  }
  return phases
}

export function jsonStringifyReport(report: AiReport): string {
  return JSON.stringify(report, null, 2)
}
