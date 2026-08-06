/**
 * Shared infrastructure for the profiler modules (startupProfiler,
 * queryProfiler, headlessProfiler). All three use the same perf_hooks timeline
 * and the same line format for detailed reports.
 *
 * Extracted from `src/utils/profilerBase.ts`.
 */
import type { performance as PerformanceType } from 'node:perf_hooks';
export declare function getPerformance(): typeof PerformanceType;
export declare function formatMs(ms: number): string;
/**
 * Render a single timeline line in the shared profiler report format:
 *   [+  total.ms] (+  delta.ms) name [extra] [| RSS: .., Heap: ..]
 *
 * totalPad/deltaPad control the padStart width so callers can align columns
 * based on their expected magnitude (startup uses 8/7, query uses 10/9).
 */
export declare function formatTimelineLine(totalMs: number, deltaMs: number, name: string, memory: NodeJS.MemoryUsage | undefined, totalPad: number, deltaPad: number, extra?: string): string;
