/**
 * Configuration and session state.
 *
 * Defaults:
 *   reports: <config-home>/reports/<sessionId>.txt|.json
 * where config-home is `$PERF_CONFIG_DIR` or `~/.perf-profiler`.
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Config home directory. */
export function getConfigHomeDir(): string {
  return (
    process.env.PERF_CONFIG_DIR ??
    join(homedir(), '.perf-profiler')
  ).normalize('NFC')
}

/** Directory where detailed profiling reports are written. */
export function getOutputDir(): string {
  return process.env.PERF_OUTPUT_DIR ?? join(getConfigHomeDir(), 'reports')
}

let sessionId: string | undefined

export function setSessionId(id: string): void {
  sessionId = id
}

/** Stable session id for the current process (random UUID). */
export function getSessionId(): string {
  if (!sessionId) {
    sessionId = randomUUID()
  }
  return sessionId
}
