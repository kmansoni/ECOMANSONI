#!/usr/bin/env sh
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks
echo "Installed git hooks: core.hooksPath=.githooks"
