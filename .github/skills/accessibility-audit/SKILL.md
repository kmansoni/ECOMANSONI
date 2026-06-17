---
name: "Accessibility Audit"
description: "WCAG compliance and accessibility testing. Use when: auditing accessibility, fixing a11y issues, or testing screen reader compatibility."
---

# Accessibility Audit

WCAG 2.1 compliance and assistive technology testing.

## WCAG 2.1 Checklist

### Perceivable
- [ ] Text alternatives for images (`alt` attributes)
- [ ] Captions for videos
- [ ] Color contrast ratio ≥ 4.5:1 (text), ≥ 3:1 (large text)
- [ ] Content resizable without loss

### Operable
- [ ] All functionality via keyboard
- [ ] No keyboard traps
- [ ] Skip navigation links
- [ ] Focus indicators visible

### Understandable
- [ ] Language declared (`lang` attribute)
- [ ] Consistent navigation
- [ ] Error identification with suggestions

### Robust
- [ ] Valid HTML
- [ ] ARIA used correctly
- [ ] Works with assistive technologies

## Testing Tools

```bash
# Playwright with a11y
npx playwright test --grep a11y

# Axe-core integration
npx playwright test --project=a11y
```

## Common Issues

| Issue | Fix |
|--------|-----|
| Missing `alt` | Add descriptive alt text |
| Low contrast | Use darker colors or increase size |
| No focus ring | Add `:focus-visible` styles |
| Unlabeled buttons | Add `aria-label` or visible text |
| Missing landmarks | Use semantic HTML (`<nav>`, `<main>`) |

## For Mansoni

Priority pages for a11y:
1. Chat interface (main user flow)
2. Settings pages
3. Navigation menus
4. Form inputs

## Testing with Screen Reader

```typescript
test('keyboard navigation', async ({ page }) => {
  await page.goto('/chat');
  await page.keyboard.press('Tab');
  // Focus should move to first interactive element
  await page.keyboard.press('Tab');
  // Continue through all elements
});
```