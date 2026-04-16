/**
 * Массовая замена `supabase as any` → `dbLoose` в src/hooks/.
 * Запускать: node scripts/refactor-dbloose.mjs
 * Проверять: npx tsc -p tsconfig.app.json --noEmit
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const DIRS = [
  join(import.meta.dirname, "..", "src", "components"),
  join(import.meta.dirname, "..", "src", "lib"),
  join(import.meta.dirname, "..", "src", "providers"),
];

function walkTs(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) result.push(...walkTs(full));
    else if (/\.[tj]sx?$/.test(entry)) result.push(full);
  }
  return result;
}

let totalFiles = 0;
let totalReplacements = 0;

for (const dir of DIRS) {
for (const filePath of walkTs(dir)) {
  let src = readFileSync(filePath, "utf8");
  const orig = src;
  let changes = 0;

  // ── Pattern A: `const db = supabase as any;` aliases ──
  // Replace `const db = supabase as any;` (and sb, supabaseAny) with nothing,
  // then rename all db./sb./supabaseAny. usages to dbLoose.
  // Handle ALL alias declarations (may occur multiple times)
  const aliasGlobalRe = /const\s+(db|sb|supabaseAny)\s*=\s*supabase\s+as\s+any;?\s*\n?/g;
  let aliasMatch;
  const aliases = new Set();
  while ((aliasMatch = aliasGlobalRe.exec(src)) !== null) {
    aliases.add(aliasMatch[1]);
  }
  // Remove all alias lines
  src = src.replace(aliasGlobalRe, () => { changes++; return ""; });

  for (const alias of aliases) {
    // Replace alias usages: `db.from(`, `await db\n  .from(`, etc.
    // Match alias followed by dot (same line or next line)
    const aliasRe = new RegExp(`\\b${alias}(\\s*)\\.`, "g");
    let count = 0;
    src = src.replace(aliasRe, (_, ws) => { count++; return `dbLoose${ws}.`; });
    changes += count;
  }

  // ── Pattern B: inline `(supabase as any)` ──
  const inlineRe = /\(supabase\s+as\s+any\)/g;
  const inlineCount = (src.match(inlineRe) || []).length;
  if (inlineCount > 0) {
    src = src.replace(inlineRe, "dbLoose");
    changes += inlineCount;
  }

  // ── Pattern C: `supabase as any` as function argument ──
  // e.g. fetchUserBriefMap([...ids], supabase as any)
  // Since fetchUserBriefMap has a default client param, just remove the arg
  src = src.replace(
    /,\s*supabase\s+as\s+any\s*\)/g,
    (match) => {
      changes++;
      return ")";
    }
  );

  // Also catch remaining `supabase as any` that aren't in parens
  // e.g. `let q = supabase as any` (should not exist after pattern A, but just in case)
  const remainingRe = /supabase\s+as\s+any/g;
  const remaining = (src.match(remainingRe) || []).length;
  if (remaining > 0) {
    src = src.replace(remainingRe, "dbLoose");
    changes += remaining;
  }

  if (changes === 0) continue;

  // ── Fix imports ──
  // Ensure dbLoose is imported from @/lib/supabase
  const hasDbLooseImport = /\bdbLoose\b/.test(
    src.match(/import\s*{[^}]*}\s*from\s*["']@\/lib\/supabase["']/)?.[0] || ""
  );

  if (!hasDbLooseImport) {
    // Try to add to existing supabase import
    const importRe =
      /import\s*{([^}]*)}\s*from\s*["']@\/lib\/supabase["']/;
    const importMatch = src.match(importRe);
    if (importMatch) {
      const existing = importMatch[1].trim();
      // Check if supabase is still needed in this file
      const supabaseUsed = /\bsupabase\b/.test(
        src.replace(importRe, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
      );
      if (supabaseUsed) {
        src = src.replace(importRe, `import { ${existing}, dbLoose } from "@/lib/supabase"`);
      } else {
        // supabase no longer used, replace entirely
        const newImports = existing
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s !== "supabase");
        newImports.push("dbLoose");
        src = src.replace(importRe, `import { ${newImports.join(", ")} } from "@/lib/supabase"`);
      }
    } else {
      // No existing import — add one at the top after other imports
      const lastImportIdx = src.lastIndexOf("\nimport ");
      if (lastImportIdx >= 0) {
        const lineEnd = src.indexOf("\n", lastImportIdx + 1);
        src =
          src.slice(0, lineEnd + 1) +
          `import { dbLoose } from "@/lib/supabase";\n` +
          src.slice(lineEnd + 1);
      } else {
        src = `import { dbLoose } from "@/lib/supabase";\n` + src;
      }
    }
  }

  // ── Remove unused supabase import if no longer referenced ──
  const afterImportSrc = src.replace(
    /import\s*{[^}]*}\s*from\s*["']@\/lib\/supabase["']/,
    ""
  );
  const supabaseStillUsed = /\bsupabase\b/.test(
    afterImportSrc.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  );
  if (!supabaseStillUsed) {
    src = src.replace(
      /import\s*{([^}]*)}\s*from\s*["']@\/lib\/supabase["']/,
      (match, inner) => {
        const cleaned = inner
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s !== "supabase")
          .join(", ");
        return `import { ${cleaned} } from "@/lib/supabase"`;
      }
    );
  }

  if (src !== orig) {
    writeFileSync(filePath, src, "utf8");
    const rel = relative(join(import.meta.dirname, ".."), filePath);
    console.log(`✓ ${rel} — ${changes} замен`);
    totalFiles++;
    totalReplacements += changes;
  }
}
}

console.log(`\nИтого: ${totalReplacements} замен в ${totalFiles} файлах`);
