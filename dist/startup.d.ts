/**
 * Startup profiling utility for measuring and reporting time spent in various
 * initialization phases.
 *
 * Extracted from `src/utils/startupProfiler.ts` (Claude Code source snapshot).
 *
 * Two modes:
 * 1. Sampled logging: logs phase durations to a configurable analytics sink
 *    (inert by default). Sample rate 0.5%.
 * 2. Detailed profiling: `PERF_PROFILE_STARTUP=1` (or the original
 *    `CLAUDE_CODE_PROFILE_STARTUP=1`) - full report with memory snapshots,
 *    written to `<config-home>/startup-perf/<sessionId>.txt`.
 *
 * Uses Node.js built-in performance hooks API for standard timing measurement.
 */
/**
 * Record a checkpoint with the given name.
 */
export declare function profileCheckpoint(name: string): void;
/**
 * Emit the profiling report. Logs phase metrics to the analytics sink (if any)
 * and writes the detailed report to disk when detailed profiling is enabled.
 */
export declare function profileReport(): void;
export declare function isDetailedProfilingEnabled(): boolean;
export declare function getStartupPerfLogPath(): string;
/**
 * Log startup performance phases to the analytics sink.
 * Only logs if this session was sampled at startup.
 */
export declare function logStartupPerf(): void;
