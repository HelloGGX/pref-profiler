/**
 * Debug logger replacing `src/utils/debug.ts` (logForDebugging).
 *
 * The original wrote to `~/.claude/debug/<sessionId>.txt` and gated on
 * `--debug` / USER_TYPE=ant. The standalone version writes to stderr and is
 * enabled by `--debug` or `PERF_DEBUG=1`, or programmatically.
 */
export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error';
export declare function setDebugEnabled(enabled: boolean): void;
export declare function isDebugEnabled(): boolean;
export declare function logForDebugging(message: string, options?: {
    level?: DebugLogLevel;
}): void;
