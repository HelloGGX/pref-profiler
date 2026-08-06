/**
 * Pure display formatters extracted from `src/utils/format.ts` (Claude Code
 * source snapshot). Leaf-safe: no dependencies on the rest of the project.
 */
/**
 * Formats a byte count to a human-readable string (KB, MB, GB).
 * @example formatFileSize(1536) -> "1.5KB"
 */
export declare function formatFileSize(sizeInBytes: number): string;
