/**
 * Debug logger replacing `src/utils/debug.ts` (logForDebugging).
 *
 * The original wrote to `~/.claude/debug/<sessionId>.txt` and gated on
 * `--debug` / USER_TYPE=ant. The standalone version writes to stderr and is
 * enabled by `--debug` or `PERF_DEBUG=1`, or programmatically.
 */
import { isEnvTruthy } from './env.js';
let debugEnabled = isEnvTruthy(process.env.PERF_DEBUG) || process.argv.includes('--debug');
export function setDebugEnabled(enabled) {
    debugEnabled = enabled;
}
export function isDebugEnabled() {
    return debugEnabled;
}
export function logForDebugging(message, options = { level: 'debug' }) {
    if (!debugEnabled)
        return;
    const level = options.level ?? 'debug';
    const timestamp = new Date().toISOString();
    process.stderr.write(`${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`);
}
