import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

// identifiers that frequently become ambiguous in JOIN/CTE heavy RPCs
const TARGETS = ["conversation_id", "user_id", "id"];

// crude but effective: detect PL/pgSQL function blocks
const FUNC_RE =
  /create\s+or\s+replace\s+function[\s\S]*?language\s+plpgsql[\s\S]*?\$\$([\s\S]*?)\$\$[\s]*;/gim;

// lines to skip within function body (headers/ddl-ish)
const SKIP_LINE_RE =
  /^\s*(returns\s+table\s*\(|on\s+conflict\s*\(|declare\b|language\b|security\s+definer\b)/i;

// patterns to ignore: qualified identifiers like alias.col or schema.table.col
function isQualified(body, idx) {
  // look backwards for '.' or '"."'
  // if immediately preceded by '.' (after optional quotes), treat as qualified
  const before = body.slice(Math.max(0, idx - 4), idx);
  return before.includes("."); // coarse but works for alias.col and schema.table.col
}

function stripCommentsPreserveNewlines(s) {
  // remove /* ... */ but preserve line breaks
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  // remove -- ... (to end of line)
  s = s.replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
  return s;
}

function stripStringLiteralsPreserveNewlines(s) {
  // replace '...' with spaces, preserving newlines
  return s.replace(/'(?:''|[^'])*'/g, (m) => m.replace(/[^\n]/g, " "));
}

function computeLineCol(text, index) {
  const upTo = text.slice(0, index);
  const lines = upTo.split("\n");
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

function lintFunctionBody(filename, body, baseOffsetInFile, fileText) {
  const violations = [];

  // pre-strip comments and string literals to reduce false positives
  let cleaned = stripCommentsPreserveNewlines(body);
  cleaned = stripStringLiteralsPreserveNewlines(cleaned);

  // Do not lint trivial single-source functions; ambiguity risk is join/cte-heavy SQL.
  const hasJoinOrCte = /\b(join|with)\b/i.test(cleaned);
  if (!hasJoinOrCte) return violations;

  // Collect how many distinct qualifiers are used per target in this function.
  // We only flag bare identifiers when at least 2 qualifiers exist for the same column.
  const qualifierSets = new Map(TARGETS.map((t) => [t, new Set()]));
  const qualRe = /\b([a-z_][a-z0-9_]*)\s*\.\s*(conversation_id|user_id|id)\b/gi;
  let q;
  while ((q = qualRe.exec(cleaned)) !== null) {
    qualifierSets.get(q[2].toLowerCase())?.add(q[1].toLowerCase());
  }

  const lines = cleaned.split("\n");
  let cursor = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const rawLine = lineText;

    cursor += i === 0 ? 0 : lines[i - 1].length + 1;

    if (SKIP_LINE_RE.test(rawLine)) continue;

    // Only flag in likely SQL clauses (heuristic)
    // If line doesn't contain these keywords, skip to avoid noise
    const hasClause = /\b(select|where|order\s+by|group\s+by|join|having|from|on)\b/i.test(
      rawLine
    );
    if (!hasClause) continue;

    for (const ident of TARGETS) {
      const qualifierCount = qualifierSets.get(ident)?.size ?? 0;
      if (qualifierCount < 2) continue;

      // find bare word occurrences
      const wordRe = new RegExp(`\\b${ident}\\b`, "gi");
      let m;
      while ((m = wordRe.exec(rawLine)) !== null) {
        const localIdx = m.index;
        const globalIdxInBody = cursor + localIdx;

        // skip if preceded by a dot -> qualified (alias.ident)
        if (isQualified(rawLine, localIdx)) continue;
        // skip NEW.id / OLD.id / EXCLUDED.id style pseudo-record fields
        const prevToken = rawLine.slice(Math.max(0, localIdx - 10), localIdx).toLowerCase();
        if (/\b(new|old|excluded)\s*\.\s*$/.test(prevToken)) continue;

        // skip common safe contexts:
        // - on conflict (...) already filtered by SKIP_LINE_RE
        // - returns table(...) already filtered
        // - parameter names p_conversation_id etc not matched due to word boundary
        // - table/alias qualification not present (we would have continued)

        // Now check if this is part of "select ident" / "where ident" / "order by ident" / "group by ident" etc.
        // We only flag if ident is used in a clause context without qualification.
        const context = rawLine.toLowerCase();

        // avoid false positives in assignments like: new_id := ...
        if (context.includes(":=") && /:=\s*\b(id|user_id|conversation_id)\b/i.test(rawLine)) {
          continue;
        }

        // If it's in SELECT list or WHERE/ON/ORDER/GROUP, flag it
        const clauseFlag =
          /\bselect\b/i.test(rawLine) ||
          /\bwhere\b/i.test(rawLine) ||
          /\bon\b/i.test(rawLine) ||
          /\border\s+by\b/i.test(rawLine) ||
          /\bgroup\s+by\b/i.test(rawLine) ||
          /\bjoin\b/i.test(rawLine) ||
          /\bin\s*\(\s*select\b/i.test(rawLine);

        if (!clauseFlag) continue;

        // locate in full file for accurate line/col
        const absoluteIndex = baseOffsetInFile + globalIdxInBody;
        const { line, col } = computeLineCol(fileText, absoluteIndex);

        violations.push({
          filename,
          line,
          col,
          ident,
          snippet: rawLine.trim().slice(0, 200),
        });
      }
    }
  }

  return violations;
}

function listSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => path.join(dir, f));
}

function main() {
  const files = listSqlFiles(MIGRATIONS_DIR);
  const allViolations = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");

    let match;
    while ((match = FUNC_RE.exec(text)) !== null) {
      const body = match[1];
      const bodyStartIndex = match.index + match[0].indexOf("$$") + 2; // start after first $$
      const violations = lintFunctionBody(
        path.relative(ROOT, file),
        body,
        bodyStartIndex,
        text
      );
      allViolations.push(...violations);
    }
  }

  if (allViolations.length > 0) {
    console.error("SQL RPC alias lint failed. Unqualified identifiers found:\n");
    for (const v of allViolations) {
      console.error(
        `${v.filename}:${v.line}:${v.col}  Unqualified '${v.ident}' in SQL clause. Use an alias (e.g., cp.${v.ident}).\n  ${v.snippet}\n`
      );
    }
    process.exit(1);
  }

  console.log("SQL RPC alias lint: OK");
}

main();
