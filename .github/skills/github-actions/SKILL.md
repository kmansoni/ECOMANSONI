---
name: "GitHub Actions"
description: "CI/CD pipeline configuration and management. Use when: creating workflows, optimizing CI, or managing GitHub Actions."
---

# GitHub Actions

CI/CD pipeline configuration for GitHub.

## Basic Workflow Structure

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
```

## Key Patterns

| Pattern | Implementation |
|---------|---------------|
| Cache | `actions/cache` for node_modules |
| Matrix | `strategy.matrix.node: [18, 20]` |
| Concurrency | `concurrency.group: ${{ github.ref }}` |
| Environment | `environment: production` |
| Artifacts | `actions/upload-artifact` |

## For Mansoni

Active workflows: cicd.yml, ai-test-pipeline.yml, security-scan.yml