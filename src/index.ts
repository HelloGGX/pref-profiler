/**
 * perf-profiler - standalone checkpoint-based performance profiler.
 *
 * Designed for harness engineering: profile startup, query, or headless
 * phases with perf_hooks checkpoints, and emit AI-friendly structured reports
 * (anomalies + fix suggestions) for fast automated triage.
 */

export * from './analyze.js'
export * from './base.js'
export * from './startup.js'
export * from './query.js'
export * from './headless.js'

export { isEnvTruthy, firstEnvTruthy } from './env.js'
export {
  getConfigHomeDir,
  getOutputDir,
  getSessionId,
  setSessionId,
} from './config.js'
export { logForDebugging, setDebugEnabled } from './logger.js'
export { setAnalyticsSink, type AnalyticsSink } from './analytics.js'
export { formatFileSize } from './format.js'
