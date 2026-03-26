/**
 * src/lib/utils/isTableMissingError.ts
 *
 * Checks if a Supabase/PostgREST error indicates a missing table or column.
 * PostgreSQL error codes:
 *   42P01 — undefined_table
 *   42703 — undefined_column
 *
 * This is the single canonical implementation; all lib files must import from here.
 */
export function isTableMissingError(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    (msg.includes("does not exist") &&
      (msg.includes("relation") || msg.includes("column")))
  );
}
