#!/bin/bash
# Mansoni Learning Hook — error-capture
# Fires on PostToolUse (Bash) to detect command failures.
# Zero output on success — only captures errors.

set -e

OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
[ -z "$OUTPUT" ] && exit 0

# Error patterns — Mansoni-specific
ERROR_PATTERNS=(
    "error:"
    "Error:"
    "ERROR:"
    "FATAL:"
    "fatal:"
    "FAILED"
    "failed"
    "command not found"
    "No such file or directory"
    "Permission denied"
    "Module not found"
    "ModuleNotFoundError"
    "ImportError"
    "SyntaxError"
    "TypeError"
    "ReferenceError"
    "Cannot find module"
    "ENOENT"
    "EACCES"
    "ECONNREFUSED"
    "ETIMEDOUT"
    "npm ERR!"
    "pnpm ERR!"
    "Traceback (most recent call last)"
    "panic:"
    "segmentation fault"
    "core dumped"
    "exit code"
    "non-zero exit"
    "Build failed"
    "Compilation failed"
    "Test failed"
    # Supabase-specific
    "supabase error"
    "SupabaseError"
    "RLS policy"
    "row level security"
    "Edge Function"
    "Function returned"
    # TypeScript-specific
    "is not assignable to type"
    "is possibly null"
    "is possibly undefined"
    "Property '.*' does not exist"
    "Cannot find name"
    # Vite-specific
    "vite build failed"
    "[vite]"
    "HMR"
)

# Exclusions — don't trigger on known patterns
EXCLUSIONS=(
    "error-capture"
    "success-capture"
    "console.error"
    "catch (error"
    "catch (err"
    ".error("
    "no error"
    "without error"
    "error-free"
    "error-handler"
)

# Check exclusions
for excl in "${EXCLUSIONS[@]}"; do
    if [[ "$OUTPUT" == *"$excl"* ]]; then
        exit 0
    fi
done

# Detect errors
contains_error=false
matched_pattern=""
for pattern in "${ERROR_PATTERNS[@]}"; do
    if [[ "$OUTPUT" == *"$pattern"* ]]; then
        contains_error=true
        matched_pattern="$pattern"
        break
    fi
done

[ "$contains_error" = false ] && exit 0

# Extract error context (first 3 lines)
error_context=$(echo "$OUTPUT" | grep -i -m 3 "$matched_pattern" | head -3 2>/dev/null || echo "$OUTPUT" | head -3)

# Command that was run (from CLAUDE_TOOL_INPUT if available)
CMD="${CLAUDE_TOOL_INPUT:-unknown}"
PROJECT_DIR="$(pwd)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SLUG="error-$(date +%s)"

# Write to memories/repo/ for persistent learning
MEMO_DIR="memories/repo"
mkdir -p "$MEMO_DIR"

cat > "$MEMO_DIR/$SLUG.md" << EOF
---
name: $SLUG
description: "Captured error: $matched_pattern"
type: error-pattern
timestamp: $TIMESTAMP
---

## Error Pattern

- **Pattern:** $matched_pattern
- **Command:** $CMD
- **Context:** $(echo "$error_context" | tr '\n' ' ' | cut -c1-200)

## Root Cause Analysis

<!-- TODO: fill after resolution -->

## Resolution

<!-- TODO: fill after fix -->

## Prevention

<!-- TODO: how to avoid next time -->
EOF

# Output compact reminder
cat << EOF
<learning-capture>
Error captured: "$matched_pattern"
Saved to: memories/repo/$SLUG.md
Review with: /mansoni:learn
</learning-capture>
EOF
