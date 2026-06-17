---
name: "A11y Audit"
description: "Comprehensive accessibility testing including WCAG compliance. Use when: full a11y audit, compliance checking, or accessibility certification."
---

# A11y Audit

Comprehensive accessibility compliance testing.

## Standards

| Standard | Level | Requirements |
|----------|-------|-------------|
| WCAG 2.1 | A, AA, AAA | 78 criteria |
| Section 508 | - | Federal compliance |
| EN 301 549 | - | EU standard |

## Testing Checklist

### Level A (Minimum)
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not sole means of information
- [ ] Pages have titles
- [ ] Language is identified

### Level AA (Standard)
- [ ] Contrast 4.5:1 for text
- [ ] Focus indicators visible
- [ ] Navigation links consistent
- [ ] Error messages identified

### Level AAA (Enhanced)
- [ ] Contrast 7:1 for text
- [ ] Extended audio descriptions
- [ ] Sign language interpretation

## Automated Testing

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('login page accessibility', async ({ page }) => {
  await page.goto('/login');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

## Manual Testing

1. **Keyboard only** — navigate entire page with Tab
2. **Screen reader** — test with VoiceOver/NVDA
3. **Zoom 200%** — verify no horizontal scroll
4. **Color picker** — verify contrast ratios

## Report Template

```markdown
## A11y Audit Report

### Summary
- Total violations: N
- Critical: N
- Serious: N
- Moderate: N

### Violations by Page

### Recommendations
1. [Issue] → [Fix]
```

## For Mansoni

Priority areas:
1. Chat interface (core user flow)
2. Settings panels
3. Form inputs
4. Navigation menus