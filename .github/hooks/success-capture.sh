#!/bin/bash
# Mansoni Learning Hook — success-capture
# Fires on PostToolUse (Bash) to detect successful commands.
# Captures "winning patterns" for future reference.

set -e

OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
[ -z "$OUTPUT" ] && exit 0

# Success patterns — what we want to learn from
SUCCESS_PATTERNS=(
    "0 errors"
    "0 warnings"
    "Build successful"
    "build finished"
    "Tests:       1 passed"
    "Tests passed"
    "passed"
    "ready in"
    "Successfully"
    "successfully"
    "compiled successfully"
    "All files pass"
    "No changes detected"
    "already up to date"
    "Migrations applied"
    "Deploy complete"
    "created successfully"
    "written successfully"
)

# Check for success patterns
for pattern in "${SUCCESS_PATTERNS[@]}"; do
    if [[ "$OUTPUT" == *"$pattern"* ]]; then
        # Don't capture trivial successes (file reads, simple ops)
        if [[ "$OUTPUT" == *"is not a valid"* ]]; then
            exit 0
        fi

        # Get the command context
        CMD="${CLAUDE_TOOL_INPUT:-unknown}"

        # Capture only meaningful patterns: tsc, build, test, deploy
        case "$CMD" in
            *tsc*|*build*|*test*|*deploy*|*migration*|*commit*)
                TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
                SLUG="win-$(date +%s)"
                MEMO_DIR="memories/repo"
                mkdir -p "$MEMO_DIR"

                # Extract key info from output
                SUMMARY=$(echo "$OUTPUT" | tail -5 | tr '\n' ' ' | cut -c1-200)

                cat > "$MEMO_DIR/$SLUG.md" << EOF
---
name: $SLUG
description: "Winning pattern: $CMD"
type: winning-pattern
timestamp: $TIMESTAMP
---

## Winning Pattern

- **Command:** $CMD
- **Result:** $SUMMARY

## What Worked

<!-- TODO: describe what made this successful -->

## When to Apply

<!-- TODO: when to use this pattern again -->
EOF
                exit 0
                ;;
        esac
        exit 0
    fi
done

exit 0
