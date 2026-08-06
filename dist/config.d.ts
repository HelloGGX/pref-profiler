/**
 * Configuration and session state.
 *
 * Replaces `src/bootstrap/state.ts` (getSessionId) and
 * `src/utils/envUtils.ts` (getClaudeConfigHomeDir) with a standalone
 * equivalent. Defaults match the original behavior:
 *   <config-home>/startup-perf/<sessionId>.txt
 * where config-home is `$CLAUDE_CONFIG_DIR` or `~/.claude`.
 */
/** Config home directory, honoring the original CLAUDE_CONFIG_DIR. */
export declare function getConfigHomeDir(): string;
/** Directory where detailed profiling reports are written. */
export declare function getOutputDir(): string;
export declare function setSessionId(id: string): void;
/** Stable session id for the current process (random UUID, like the original). */
export declare function getSessionId(): string;
