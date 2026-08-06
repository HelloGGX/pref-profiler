#!/usr/bin/env node
/**
 * perf-profiler CLI.
 *
 * Commands:
 *   demo    Run a scripted profiling demo (startup / query / headless)
 *   report  Print detailed profiling report files written by the library
 *   run     Run a command and produce a profile timeline + summary
 *   help    Show help
 *
 * The profiler modules decide their enabled state at import time from env
 * variables, so this CLI sets the relevant env vars BEFORE dynamically
 * importing them.
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { getOutputDir, setSessionId } from './config.js'
import { formatMs, formatTimelineLine, getPerformance } from './base.js'
import { formatFileSize } from './format.js'

const USAGE = `perf-profiler - checkpoint-based performance profiler

Usage:
  perf-profiler <command> [options]

Commands:
  demo                 Run a scripted profiling demo.
                       Options: --startup (default) | --query | --headless
                                --out <dir>      report output directory
                                --session-id <id> stable file name for reports
  report [file ...]    Print detailed profiling report files.
                       Options: --dir <dir>  scan a directory (*.txt, newest first)
  run -- <cmd> [args]  Run a command and print a timeline + wall/CPU summary.
                       The child's exit code is propagated.
  help                 Show this help.

Environment:
  PERF_PROFILE_STARTUP=1        Enable detailed startup/headless profiling
                                (alias: CLAUDE_CODE_PROFILE_STARTUP=1)
  PERF_PROFILE_QUERY=1          Enable query profiling
                                (alias: CLAUDE_CODE_PROFILE_QUERY=1)
  PERF_OUTPUT_DIR=<dir>         Where detailed reports are written
                                (default: <config-home>/startup-perf)
  PERF_CONFIG_DIR=<dir>         Config home (default: $CLAUDE_CONFIG_DIR or ~/.claude)
  PERF_DEBUG=1 or --debug       Write debug logs to stderr
`

type CliCommand =
  | 'demo'
  | 'report'
  | 'run'
  | 'help'
  | 'version'

type ProcSample = {
  cpuMs: number
  peakRssBytes: number
}

/**
 * Sample child CPU time and peak RSS from /proc on Linux.
 * Returns null on other platforms (no dependency-free equivalent exists).
 */
function readProcSample(pid: number | undefined): ProcSample | null {
  if (process.platform !== 'linux' || pid === undefined) return null
  try {
    // /proc/<pid>/stat: fields after the comm field are space separated;
    // utime is field 14, stime is field 15 (1-based, comm included), i.e.
    // indexes 11 and 12 in the zero-based array after stripping "pid (comm) ".
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const closeParen = stat.lastIndexOf(')')
    const fields = stat.slice(closeParen + 1).trim().split(/\s+/)
    const utimeTicks = Number(fields[11]) || 0
    const stimeTicks = Number(fields[12]) || 0
    const ticksPerSec = 100 // CLK_TCK on Linux
    const cpuMs = ((utimeTicks + stimeTicks) / ticksPerSec) * 1000

    let peakRssBytes = 0
    const status = readFileSync(`/proc/${pid}/status`, 'utf8')
    const vmHwm = status.match(/^VmHWM:\s+(\d+)\s+kB$/m)
    if (vmHwm) {
      peakRssBytes = Number(vmHwm[1]) * 1024
    }
    return { cpuMs, peakRssBytes }
  } catch {
    return null
  }
}

function parseCommand(argv: string[]): {
  command: CliCommand
  rest: string[]
} {
  const command = argv[0]
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help', rest: [] }
  }
  if (command === '--version' || command === '-v') {
    return { command: 'version', rest: [] }
  }
  if (command === 'demo' || command === 'report' || command === 'run') {
    return { command, rest: argv.slice(1) }
  }
  // Unknown command: treat as error, print usage
  console.error(`Unknown command: ${command}`)
  return { command: 'help', rest: [] }
}

function parseFlags(
  args: string[],
  flagSpec: Record<string, 'flag' | 'value'>,
): { flags: Record<string, string | boolean>; positionals: string[]; rest: string[] } {
  const flags: Record<string, string | boolean> = {}
  const positionals: string[] = []
  let rest: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (rest.length > 0) {
      rest.push(arg)
      continue
    }
    if (arg === '--') {
      rest = args.slice(i + 1)
      break
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      const spec = flagSpec[name]
      if (!spec) {
        console.error(`Unknown option: --${name}`)
        continue
      }
      if (spec === 'value') {
        const value = eq === -1 ? args[++i] : arg.slice(eq + 1)
        if (value === undefined) {
          console.error(`Option --${name} requires a value`)
          process.exitCode = 1
          return { flags, positionals, rest }
        }
        flags[name] = value
      } else {
        flags[name] = true
      }
      continue
    }
    positionals.push(arg)
  }

  return { flags, positionals, rest }
}

async function cmdDemo(flags: Record<string, string | boolean>): Promise<void> {
  const mode =
    typeof flags.mode === 'string' ? flags.mode : 'startup'
  const outDir = typeof flags.out === 'string' ? flags.out : undefined
  if (outDir) {
    process.env.PERF_OUTPUT_DIR = outDir
  }
  if (typeof flags['session-id'] === 'string') {
    setSessionId(flags['session-id'])
  }

  if (mode === 'query') {
    await demoQuery()
  } else if (mode === 'headless') {
    await demoHeadless()
  } else {
    await demoStartup()
  }
}

async function demoStartup(): Promise<void> {
  process.env.PERF_PROFILE_STARTUP = '1'
  const startup = await import('./startup.js')

  // Mimic the checkpoint sequence used in Claude Code's entrypoints/main.tsx
  startup.profileCheckpoint('cli_entry')
  await sleep(40)
  startup.profileCheckpoint('main_tsx_imports_loaded')
  await sleep(20)
  startup.profileCheckpoint('eagerLoadSettings_start')
  await sleep(60)
  startup.profileCheckpoint('eagerLoadSettings_end')
  await sleep(10)
  startup.profileCheckpoint('main_function_start')
  await sleep(15)
  startup.profileCheckpoint('before_validateForceLoginOrg')
  await sleep(80)
  startup.profileCheckpoint('before_connectMcp')
  await sleep(30)
  startup.profileCheckpoint('after_connectMcp')
  await sleep(25)
  startup.profileCheckpoint('run_before_parse')
  await sleep(5)
  startup.profileCheckpoint('run_after_parse')
  await sleep(10)
  startup.profileCheckpoint('main_after_run')

  startup.profileReport()

  const path = startup.getStartupPerfLogPath()
  console.log(await readFileAsync(path))
  console.log(`\nReport written to: ${path}`)
}

async function demoQuery(): Promise<void> {
  process.env.PERF_PROFILE_QUERY = '1'
  const query = await import('./query.js')

  query.startQueryProfile()
  query.queryCheckpoint('query_context_loading_start')
  await sleep(45)
  query.queryCheckpoint('query_context_loading_end')
  query.queryCheckpoint('query_microcompact_start')
  await sleep(12)
  query.queryCheckpoint('query_microcompact_end')
  query.queryCheckpoint('query_setup_start')
  await sleep(30)
  query.queryCheckpoint('query_setup_end')
  query.queryCheckpoint('query_tool_schema_build_start')
  await sleep(70)
  query.queryCheckpoint('query_tool_schema_build_end')
  query.queryCheckpoint('query_message_normalization_start')
  await sleep(18)
  query.queryCheckpoint('query_message_normalization_end')
  query.queryCheckpoint('query_client_creation_start')
  await sleep(50)
  query.queryCheckpoint('query_client_creation_end')
  query.queryCheckpoint('query_api_request_sent')
  await sleep(160)
  query.queryCheckpoint('query_first_chunk_received')
  await sleep(240)
  query.queryCheckpoint('query_api_streaming_end')
  query.queryCheckpoint('query_tool_execution_start')
  await sleep(35)
  query.queryCheckpoint('query_tool_execution_end')
  query.endQueryProfile()

  console.log(query.getQueryProfileReport())
}

async function demoHeadless(): Promise<void> {
  process.env.PERF_PROFILE_STARTUP = '1'
  const headless = await import('./headless.js')
  headless.setNonInteractiveSession(true)

  headless.headlessProfilerStartTurn()
  await sleep(50)
  headless.headlessProfilerCheckpoint('system_message_yielded')
  await sleep(30)
  headless.headlessProfilerCheckpoint('query_started')
  await sleep(65)
  headless.headlessProfilerCheckpoint('api_request_sent')
  await sleep(180)
  headless.headlessProfilerCheckpoint('first_chunk')

  const metrics = headless.getHeadlessTurnMetrics()
  console.log('='.repeat(80))
  console.log('HEADLESS PROFILING METRICS - Turn #0')
  console.log('='.repeat(80))
  if (metrics) {
    for (const [key, value] of Object.entries(metrics)) {
      console.log(`  ${key.padEnd(30)} ${String(value)}`)
    }
  }
  console.log('='.repeat(80))
}

async function cmdReport(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const dir =
    typeof flags.dir === 'string' ? flags.dir : getOutputDir()
  const files =
    positionals.length > 0
      ? positionals
      : listReportFiles(dir)

  if (files.length === 0) {
    console.log(`No report files found in ${dir}`)
    console.log('Run `perf-profiler demo` to generate one.')
    return
  }

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`File not found: ${file}`)
      continue
    }
    console.log(`${'='.repeat(80)}`)
    console.log(`FILE: ${file}`)
    console.log(`${'='.repeat(80)}`)
    console.log(await readFileAsync(file))
    console.log()
  }
}

function listReportFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => name.endsWith('.txt'))
    .map(name => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
}

async function cmdRun(rest: string[]): Promise<void> {
  if (rest.length === 0) {
    console.error('Usage: perf-profiler run -- <command> [args...]')
    process.exitCode = 1
    return
  }

  const [command, ...args] = rest
  const perf = getPerformance()
  const marks: Array<{ name: string; startTime: number }> = []

  const checkpoint = (name: string): void => {
    perf.mark(name)
    const mark = perf.getEntriesByName(name).at(-1)
    if (mark) marks.push({ name, startTime: mark.startTime })
  }

  checkpoint('run_start')
  const child = spawn(command!, args, {
    stdio: 'inherit',
    // No shell: the command is executed directly with its args, so quoting is
    // predictable and no shell-injection/deprecation warnings apply. On
    // Windows, use `cmd /c` or `powershell -Command` explicitly when shell
    // features or .cmd/.bat shims are needed.
    shell: false,
  })
  checkpoint('run_spawned')

  // Sample child CPU/RSS while it runs (Linux only). The final reading is
  // taken after exit; the polled value is the fallback for short processes.
  let lastSample: ProcSample | null = readProcSample(child.pid)
  const sampler = setInterval(() => {
    const sample = readProcSample(child.pid)
    if (sample) lastSample = sample
  }, 250)

  const exitCode = await new Promise<number | null>(resolve => {
    child.on('error', err => {
      console.error(
        `Failed to start command: ${err.message}` +
          (process.platform === 'win32'
            ? ' (on Windows, .cmd/.bat shims need `perf-profiler run -- cmd /c <script>`)'
            : ''),
      )
      resolve(null)
    })
    child.on('close', code => resolve(code))
  })

  clearInterval(sampler)

  if (exitCode === null) {
    process.exitCode = 1
    return
  }

  checkpoint('run_exit')
  const finalSample = readProcSample(child.pid) ?? lastSample

  const baseline = marks[0]?.startTime ?? 0
  let prevTime = baseline
  const lines: string[] = []

  lines.push('='.repeat(80))
  lines.push(`COMMAND PROFILE REPORT - ${command}`)
  lines.push('='.repeat(80))
  lines.push('')

  for (const mark of marks) {
    lines.push(
      formatTimelineLine(
        mark.startTime - baseline,
        mark.startTime - prevTime,
        mark.name,
        undefined,
        10,
        9,
      ),
    )
    prevTime = mark.startTime
  }

  const total = marks.at(-1) ? marks.at(-1)!.startTime - baseline : 0
  lines.push('')
  lines.push(`Wall time:        ${formatMs(total)}ms`)
  if (finalSample) {
    lines.push(`Child CPU:        ${formatMs(finalSample.cpuMs)}ms`)
    lines.push(
      `Peak RSS:         ${formatFileSize(finalSample.peakRssBytes)}`,
    )
  } else {
    lines.push(`Child CPU:        n/a (Linux only)`)
  }
  lines.push(`Exit code:        ${exitCode}`)
  lines.push('='.repeat(80))

  console.log(lines.join('\n'))
  process.exitCode = exitCode ?? 1
}

function readFileAsync(path: string): Promise<string> {
  return Promise.resolve(readFileSync(path, 'utf8'))
}

async function main(): Promise<void> {
  const { command, rest } = parseCommand(process.argv.slice(2))

  if (command === 'help') {
    console.log(USAGE)
    return
  }
  if (command === 'version') {
    console.log('perf-profiler 1.0.0')
    return
  }

  if (command === 'demo') {
    const { flags } = parseFlags(rest, {
      mode: 'value',
      startup: 'flag',
      query: 'flag',
      headless: 'flag',
      out: 'value',
      'session-id': 'value',
    })
    if (flags.query) flags.mode = 'query'
    if (flags.headless) flags.mode = 'headless'
    await cmdDemo(flags)
    return
  }

  if (command === 'report') {
    const { flags, positionals } = parseFlags(rest, {
      dir: 'value',
    })
    await cmdReport(flags, positionals)
    return
  }

  if (command === 'run') {
    const { rest: restArgs } = parseFlags(rest, {})
    await cmdRun(restArgs)
    return
  }
}

void main()
