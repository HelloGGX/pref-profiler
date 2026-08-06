/**
 * Environment helpers for enabling the profiler.
 */

export function isEnvTruthy(envVar: string | boolean | undefined): boolean {
  if (!envVar) return false
  if (typeof envVar === 'boolean') return envVar
  const normalizedValue = envVar.toLowerCase().trim()
  return ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

/**
 * Returns true if any of the given environment variables is truthy.
 * Returns true if any of the given environment variables is truthy.
 */
export function firstEnvTruthy(...names: string[]): boolean {
  for (const name of names) {
    if (isEnvTruthy(process.env[name])) return true
  }
  return false
}

export const PROFILE_STARTUP_ENV_VARS = ['PERF_PROFILE_STARTUP'] as const

export const PROFILE_QUERY_ENV_VARS = ['PERF_PROFILE_QUERY'] as const
