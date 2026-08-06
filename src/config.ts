/**
 * Configuration and session state.
 *
 * Replaces `src/bootstrap/state.ts` (getSessionId) and
 * `src/utils/envUtils.ts` (getClaudeConfigHomeDir) with a standalone
 * equivalent. Defaults match the original behavior:
 *   <config-home>/startup-perf/<sessionId>.txt
 * where config-home is `$CLAUDE_CONFIG_DIR` or `~/.claude`.
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Config home directory, honoring the original CLAUDE_CONFIG_DIR. */
export function getConfigHomeDir(): string {
  return (
    process.env.PERF_CONFIG_DIR ??
    process.env.CLAUDE_CONFIG_DIR ??
    join(homedir(), '.claude')
  ).normalize('NFC')
}

/** Directory where detailed profiling reports are written. */
export function getOutputDir(): string {
  return (
    process.env.PERF_OUTPUT_DIR ?? join(getConfigHomeDir(), 'startup-perf')
  )
}

let sessionId: string | undefined

export function setSessionId(id: string): void {
  sessionId = id
}

/** Stable session id for the current process (random UUID, like the original). */
export function getSessionId(): string {
  if (!sessionId) {
    sessionId = randomUUID()
  }
  return sessionId
}
