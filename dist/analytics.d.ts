/**
 * Pluggable telemetry sink.
 *
 * The original modules called `logEvent()` from the Claude Code analytics
 * service (Statsig). In this standalone tool telemetry is inert by default;
 * embedders can attach their own sink to receive the same phase metrics
 * (e.g. `tengu_startup_perf`, `tengu_headless_latency`).
 */
export type AnalyticsMetadata = Record<string, boolean | number | string | undefined>;
export type AnalyticsSink = (eventName: string, metadata: AnalyticsMetadata) => void;
export declare function setAnalyticsSink(fn: AnalyticsSink | null): void;
export declare function logEvent(eventName: string, metadata: AnalyticsMetadata): void;
