/**
 * Environment helpers extracted from `src/utils/envUtils.ts`.
 *
 * The standalone tool keeps the original `CLAUDE_CODE_PROFILE_*` variables for
 * compatibility and adds generic `PERF_PROFILE_*` aliases.
 */
export declare function isEnvTruthy(envVar: string | boolean | undefined): boolean;
/**
 * Returns true if any of the given environment variables is truthy.
 * Used so both the original (`CLAUDE_CODE_*`) and the standalone
 * (`PERF_*`) variable names enable profiling.
 */
export declare function firstEnvTruthy(...names: string[]): boolean;
export declare const PROFILE_STARTUP_ENV_VARS: readonly ["PERF_PROFILE_STARTUP", "CLAUDE_CODE_PROFILE_STARTUP"];
export declare const PROFILE_QUERY_ENV_VARS: readonly ["PERF_PROFILE_QUERY", "CLAUDE_CODE_PROFILE_QUERY"];
