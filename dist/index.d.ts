/**
 * perf-profiler - standalone checkpoint-based performance profiler.
 *
 * Extracted from the Claude Code source snapshot:
 * - src/utils/startupProfiler.ts
 * - src/utils/queryProfiler.ts
 * - src/utils/headlessProfiler.ts
 * - src/utils/profilerBase.ts
 *
 * The original Statsig telemetry, debug-file logging and Claude-internal
 * session state were replaced with inert/pluggable equivalents.
 */
export * from './base.js';
export * from './startup.js';
export * from './query.js';
export * from './headless.js';
export { isEnvTruthy, firstEnvTruthy } from './env.js';
export { getConfigHomeDir, getOutputDir, getSessionId, setSessionId, } from './config.js';
export { logForDebugging, setDebugEnabled } from './logger.js';
export { setAnalyticsSink, type AnalyticsSink } from './analytics.js';
export { formatFileSize } from './format.js';
