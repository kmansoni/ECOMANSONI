/**
 * src/lib/utils/isTableMissingError.ts
 *
 * Checks if a Supabase/PostgREST error indicates a missing or inaccessible
 * table or column. PostgreSQL + PostgREST error codes:
 *
 *   42P01  — undefined_table
 *   42703  — undefined_column
 *   PGRST204 — PostgREST “could not find the schema” in the schema cache
 *   PGRST205 — PostgREST “could not find the table” in the schema cache
 *
 * This is the single canonical implementation. All files must import from here;
 * no inline copies of this logic.
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
    code === "PGRST204" ||
    code === "PGRST205" ||
    (msg.includes("does not exist") &&
      (msg.includes("relation") || msg.includes("column"))) ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the schema")
  );
}
