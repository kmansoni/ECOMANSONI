# /mansoni-learn — Extract patterns from captured experience

Review captured error/success patterns in `memories/repo/`, identify recurring themes, and promote winning patterns to permanent knowledge.

## Steps

1. **Scan memory directory** for unprocessed learning entries:
   - `error-*.md` — captured errors (need root cause analysis)
   - `win-*.md` — captured successes (need pattern extraction)

2. **Group by type and frequency:**
   - Which error patterns repeat? → Root cause is NOT addressed
   - Which winning patterns appear? → Extract generalizable rule

3. **For each unprocessed error entry:**
   - Read the file
   - Identify the root cause
   - Write the resolution and prevention sections
   - If same error appeared 3+ times → promote to CLAUDE.md or `.claude/rules/`

4. **For each unprocessed win entry:**
   - Read the file
   - Fill in "What Worked" and "When to Apply"
   - If pattern is repeatable → create a memory entry in `memories/repo/` with clear description

5. **Promote frequent patterns to CLAUDE.md:**
   - Pattern appeared 3+ times → add to CLAUDE.md rules
   - Pattern affected critical system → add immediately

6. **Clean up:**
   - Archive processed entries (move to `memories/repo/archived/`)
   - Keep raw data for trend analysis

## Output format

```
📊 Mansoni Learning Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Errors captured last session: N
  - Recurring (3+): N
  - New: N
  - Promoted to rules: N

Wins captured last session: N
  - Extracted patterns: N
  - Generalizable rules: N
