/**
 * Pluggable telemetry sink.
 *
 * Telemetry is inert by default; embedders can attach their own sink to
 * receive phase metrics (e.g. `startup_perf`, `headless_latency`).
 */

export type AnalyticsMetadata = Record<
  string,
  boolean | number | string | undefined
>

export type AnalyticsSink = (
  eventName: string,
  metadata: AnalyticsMetadata,
) => void

let sink: AnalyticsSink | null = null

export function setAnalyticsSink(fn: AnalyticsSink | null): void {
  sink = fn
}

export function logEvent(
  eventName: string,
  metadata: AnalyticsMetadata,
): void {
  if (sink) {
    sink(eventName, metadata)
  }
}
