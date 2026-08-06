/**
 * Query profiling utility for measuring and reporting time spent in the query
 * pipeline from user input to first token arrival.
 *
 * Extracted from `src/utils/queryProfiler.ts` (Claude Code source snapshot).
 * Enable by setting `PERF_PROFILE_QUERY=1` (or the original
 * `CLAUDE_CODE_PROFILE_QUERY=1`).
 *
 * Uses Node.js built-in performance hooks API for standard timing measurement.
 * Tracks each query session with detailed checkpoints for identifying
 * bottlenecks.
 *
 * Checkpoints tracked (in order):
 * - query_user_input_received: Start of profiling
 * - query_context_loading_start/end: Loading system prompts and contexts
 * - query_query_start: Entry to query call from REPL
 * - query_fn_entry: Entry to query() function
 * - query_microcompact_start/end: Microcompaction of messages
 * - query_autocompact_start/end: Autocompaction check
 * - query_setup_start/end: StreamingToolExecutor and model setup
 * - query_api_loop_start: Start of API retry loop
 * - query_api_streaming_start: Start of streaming API call
 * - query_tool_schema_build_start/end: Building tool schemas
 * - query_message_normalization_start/end: Normalizing messages
 * - query_client_creation_start/end: Creating Anthropic client
 * - query_api_request_sent: HTTP request dispatched (before await, inside retry body)
 * - query_response_headers_received: .withResponse() resolved (headers arrived)
 * - query_first_chunk_received: First streaming chunk received (TTFT)
 * - query_api_streaming_end: Streaming complete
 * - query_tool_execution_start/end: Tool execution
 * - query_recursive_call: Before recursive query call
 * - query_end: End of query
 */
/**
 * Start profiling a new query session
 */
export declare function startQueryProfile(): void;
/**
 * Record a checkpoint with the given name
 */
export declare function queryCheckpoint(name: string): void;
/**
 * End the current query profiling session
 */
export declare function endQueryProfile(): void;
/**
 * Get a formatted report of all checkpoints for the current/last query
 */
export declare function getQueryProfileReport(): string;
/**
 * Log the query profile report to debug output
 */
export declare function logQueryProfileReport(): void;
