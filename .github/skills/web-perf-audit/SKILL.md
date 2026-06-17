---
name: "Web Performance Audit"
description: "Frontend performance testing and optimization. Use when: auditing Core Web Vitals, optimizing load times, or improving UX performance."
---

# Web Performance Audit

Frontend performance testing and optimization.

## Core Web Vitals

| Metric | Good | Needs Work | Poor |
|--------|------|------------|------|
| LCP | < 2.5s | 2.5-4s | > 4s |
| FID/INP | < 100ms | 100-300ms | > 300ms |
| CLS | < 0.1 | 0.1-0.25 | > 0.25 |

## Lighthouse Audit

```bash
# Run Lighthouse CI
npx lhci autorun

# Single page audit
npx lighthouse http://localhost:8080 \
  --output=html \
  --output-path=./lighthouse-report.html
```

## Performance Budget

```json
{
  "budgets": [
    {
      "resourceSizes": [
        { "resourceType": "script", "budget": 200 },
        { "resourceType": "image", "budget": 150 },
        { "resourceType": "total", "budget": 500 }
      ],
      "resourceCounts": [
        { "resourceType": "third-party", "budget": 10 }
      ]
    }
  ]
}
```

## Critical Rendering Path

1. **HTML** → parse → DOM
2. **CSS** → parse → CSSOM → Render tree
3. **JS** → execute → layout → paint

Optimize:
- [ ] Inline critical CSS
- [ ] Defer non-critical JS
- [ ] Preload key resources
- [ ] Compress images
- [ ] Use CDN

## For Mansoni

Performance targets:
- LCP: < 2.5s (chat interface)
- FID: < 100ms
- Bundle: < 300KB gzipped

## Bundle Analysis

```bash
# Analyze bundle
npx vite-bundle-visualizer

# Source map explorer
npx source-map-explorer dist/assets/*.js
```