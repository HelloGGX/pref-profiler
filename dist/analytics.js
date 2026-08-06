/**
 * Pluggable telemetry sink.
 *
 * The original modules called `logEvent()` from the Claude Code analytics
 * service (Statsig). In this standalone tool telemetry is inert by default;
 * embedders can attach their own sink to receive the same phase metrics
 * (e.g. `tengu_startup_perf`, `tengu_headless_latency`).
 */
let sink = null;
export function setAnalyticsSink(fn) {
    sink = fn;
}
export function logEvent(eventName, metadata) {
    if (sink) {
        sink(eventName, metadata);
    }
}
