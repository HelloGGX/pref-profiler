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
import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logEvent } from './analytics.js';
import { getOutputDir, getSessionId } from './config.js';
import { PROFILE_STARTUP_ENV_VARS, firstEnvTruthy } from './env.js';
import { logForDebugging } from './logger.js';
import { formatMs, formatTimelineLine, getPerformance } from './base.js';
// Module-level state - decided once at module load
const DETAILED_PROFILING = firstEnvTruthy(...PROFILE_STARTUP_ENV_VARS);
// Sampling for telemetry logging: 0.5% of sessions.
// Decision made once at startup - non-sampled sessions pay no profiling cost.
const STATSIG_SAMPLE_RATE = 0.005;
const STATSIG_LOGGING_SAMPLED = Math.random() < STATSIG_SAMPLE_RATE;
// Enable profiling if either detailed mode OR sampled for telemetry
const SHOULD_PROFILE = DETAILED_PROFILING || STATSIG_LOGGING_SAMPLED;
// Track memory snapshots separately (perf_hooks doesn't track memory).
// Only used when DETAILED_PROFILING is enabled.
// Stored as an array that appends in the same order as perf.mark() calls, so
// memorySnapshots[i] corresponds to getEntriesByType('mark')[i]. Using a Map
// keyed by checkpoint name is wrong because some checkpoints fire more than
// once (e.g. loadSettingsFromDisk_start fires during init and again after
// plugins reset the settings cache), and the second call would overwrite the
// first's memory snapshot.
const memorySnapshots = [];
// Phase definitions for telemetry logging: [startCheckpoint, endCheckpoint]
const PHASE_DEFINITIONS = {
    import_time: ['cli_entry', 'main_tsx_imports_loaded'],
    init_time: ['init_function_start', 'init_function_end'],
    settings_time: ['eagerLoadSettings_start', 'eagerLoadSettings_end'],
    total_time: ['cli_entry', 'main_after_run'],
};
// Record initial checkpoint if profiling is enabled
if (SHOULD_PROFILE) {
    profileCheckpoint('profiler_initialized');
}
/**
 * Record a checkpoint with the given name.
 */
export function profileCheckpoint(name) {
    if (!SHOULD_PROFILE)
        return;
    const perf = getPerformance();
    perf.mark(name);
    // Only capture memory when detailed profiling enabled (env var)
    if (DETAILED_PROFILING) {
        memorySnapshots.push(process.memoryUsage());
    }
}
/**
 * Get a formatted report of all checkpoints.
 * Only available when detailed profiling is enabled.
 */
function getReport() {
    if (!DETAILED_PROFILING) {
        return 'Startup profiling not enabled';
    }
    const perf = getPerformance();
    const marks = perf.getEntriesByType('mark');
    if (marks.length === 0) {
        return 'No profiling checkpoints recorded';
    }
    const lines = [];
    lines.push('='.repeat(80));
    lines.push('STARTUP PROFILING REPORT');
    lines.push('='.repeat(80));
    lines.push('');
    let prevTime = 0;
    for (const [i, mark] of marks.entries()) {
        lines.push(formatTimelineLine(mark.startTime, mark.startTime - prevTime, mark.name, memorySnapshots[i], 8, 7));
        prevTime = mark.startTime;
    }
    const lastMark = marks[marks.length - 1];
    lines.push('');
    lines.push(`Total startup time: ${formatMs(lastMark?.startTime ?? 0)}ms`);
    lines.push('='.repeat(80));
    return lines.join('\n');
}
let reported = false;
/**
 * Emit the profiling report. Logs phase metrics to the analytics sink (if any)
 * and writes the detailed report to disk when detailed profiling is enabled.
 */
export function profileReport() {
    if (reported)
        return;
    reported = true;
    // Log to analytics sink (sampled)
    logStartupPerf();
    // Output detailed report if detailed profiling enabled
    if (DETAILED_PROFILING) {
        const path = getStartupPerfLogPath();
        const dir = dirname(path);
        mkdirSync(dir, { recursive: true });
        writeFileSyncFlushed(path, getReport());
        logForDebugging('Startup profiling report:');
        logForDebugging(getReport());
    }
}
export function isDetailedProfilingEnabled() {
    return DETAILED_PROFILING;
}
export function getStartupPerfLogPath() {
    return join(getOutputDir(), `${getSessionId()}.txt`);
}
/**
 * Log startup performance phases to the analytics sink.
 * Only logs if this session was sampled at startup.
 */
export function logStartupPerf() {
    // Only log if we were sampled (decision made at module load)
    if (!STATSIG_LOGGING_SAMPLED)
        return;
    const perf = getPerformance();
    const marks = perf.getEntriesByType('mark');
    if (marks.length === 0)
        return;
    // Build checkpoint lookup
    const checkpointTimes = new Map();
    for (const mark of marks) {
        checkpointTimes.set(mark.name, mark.startTime);
    }
    // Compute phase durations
    const metadata = {};
    for (const [phaseName, [startCheckpoint, endCheckpoint]] of Object.entries(PHASE_DEFINITIONS)) {
        const startTime = checkpointTimes.get(startCheckpoint);
        const endTime = checkpointTimes.get(endCheckpoint);
        if (startTime !== undefined && endTime !== undefined) {
            metadata[`${phaseName}_ms`] = Math.round(endTime - startTime);
        }
    }
    // Add checkpoint count for debugging
    metadata.checkpoint_count = marks.length;
    logEvent('tengu_startup_perf', metadata);
}
/**
 * Sync write with fsync, replacing the original `writeFileSync_DEPRECATED`
 * flush path from `src/utils/slowOperations.ts`.
 */
function writeFileSyncFlushed(filePath, data) {
    const fd = openSync(filePath, 'w');
    try {
        writeFileSync(fd, data, 'utf8');
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
}
