/**
 * Debug logger replacing `src/utils/debug.ts` (logForDebugging).
 *
 * The original wrote to `~/.claude/debug/<sessionId>.txt` and gated on
 * `--debug` / USER_TYPE=ant. The standalone version writes to stderr and is
 * enabled by `--debug` or `PERF_DEBUG=1`, or programmatically.
 */

import { isEnvTruthy } from './env.js'

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

let debugEnabled =
  isEnvTruthy(process.env.PERF_DEBUG) || process.argv.includes('--debug')

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled
}

export function isDebugEnabled(): boolean {
  return debugEnabled
}

export function logForDebugging(
  message: string,
  options: { level?: DebugLogLevel } = { level: 'debug' },
): void {
  if (!debugEnabled) return
  const level = options.level ?? 'debug'
  const timestamp = new Date().toISOString()
  process.stderr.write(`${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`)
}
