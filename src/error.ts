/**
 * AI-friendly CLI error reporting.
 *
 * Every failure path in the CLI emits the same structured shape so a harness
 * or AI agent can triage without parsing ad-hoc text:
 *   - what happened   -> errorType + message
 *   - where           -> location (command, phase, or file)
 *   - why             -> captured child output / cause
 *   - what to do next -> suggestion
 *
 * In `--json` mode the report is printed to stdout as raw JSON; otherwise it
 * is rendered as readable text on stderr. The process exit code is always set
 * to `exitCode`, so harnesses can rely on the status to detect failure.
 */

export type CliErrorType =
  | 'invalid_args'
  | 'spawn_failed'
  | 'file_not_found'
  | 'internal'

export type CliErrorReport = {
  schema: 'perf-profiler/error@1'
  errorType: CliErrorType
  /** What the error is. */
  message: string
  /** Where the error occurred: command, checkpoint/phase, or file path. */
  location: string
  /** Exit code the CLI should propagate to the shell. */
  exitCode: number
  /** Child command output that explains the failure (tail). */
  stdoutTail?: string
  stderrTail?: string
  /** Actionable next step an AI agent can take. */
  suggestion: string
  /** Internal stack trace; only attached for unexpected exceptions. */
  stack?: string
}

export type EmitCliErrorOptions = {
  /** Print the report as raw JSON on stdout instead of text on stderr. */
  json: boolean
}

/**
 * Emit an error report and set the process exit code. Machine output
 * (JSON) goes to stdout; human-readable diagnostics go to stderr.
 */
export function emitCliError(
  report: CliErrorReport,
  options: EmitCliErrorOptions,
): void {
  process.exitCode = report.exitCode
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const lines = [
    `Error [${report.errorType}]: ${report.message}`,
    `Location: ${report.location}`,
  ]
  if (report.stderrTail) lines.push(`stderr: ${report.stderrTail}`)
  if (report.stdoutTail) lines.push(`stdout: ${report.stdoutTail}`)
  lines.push(`Suggestion: ${report.suggestion}`)
  if (report.stack) lines.push(report.stack)
  console.error(lines.join('\n'))
}
