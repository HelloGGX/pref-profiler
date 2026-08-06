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
export declare function setNonInteractiveSession(value: boolean): void;
export declare function getIsNonInteractiveSession(): boolean;
/**
 * Start a new turn for profiling. Clears previous marks, increments turn number,
 * and records turn_start. Call this at the beginning of each user message processing.
 */
export declare function headlessProfilerStartTurn(): void;
/**
 * Record a checkpoint with the given name.
 * Only records if in headless mode and profiling is enabled.
 */
export declare function headlessProfilerCheckpoint(name: string): void;
/**
 * Compute headless latency metrics for the current turn.
 * Returns null when profiling is not active or no checkpoints were recorded.
 */
export declare function getHeadlessTurnMetrics(): Record<string, number | string | undefined> | null;
/**
 * Log headless latency metrics for the current turn to the analytics sink.
 * Call this at the end of each turn (before processing next user message).
 */
export declare function logHeadlessProfilerTurn(): void;
