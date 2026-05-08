# Skill: Accessibility (a11y) Expert

**Domain:** WCAG 2.1, screen readers, keyboard navigation, ARIA  
**Files:** `src/components/`, `src/lib/a11y/`  
**When to apply:** New UI component, modal/dialog, form validation, custom controls

---

## Knowledge

### WCAG 2.1 Levels
- **A** (minimum): alt text, no keyboard trap, form labels
- **AA** (target): contrast 4.5:1, focus visible, consistent navigation
- **AAA** (enhanced): contrast 7:1, sign language, extended audio description

### ARIA (Accessible Rich Internet Applications)
- **Roles**: `role="dialog"`, `role="alert"`, `role="listbox"`
- **States**: `aria-expanded`, `aria-checked`, `aria-selected`
- **Properties**: `aria-label`, `aria-labelledby`, `aria-describedby`
- **Live regions**: `aria-live="polite"` (announcements), `assertive` (errors)
- **Atomic**: `aria-atomic="true"` (read whole region)
- **Relevant**: `aria-relevant="additions text"` (what changes announce)

### Screen Readers
- **NVDA** (Windows, free, open-source)
- **JAWS** (Windows, commercial, de facto standard)
- **VoiceOver** (macOS/iOS, built-in)
- **TalkBack** (Android, built-in)
- **Narrator** (Windows 10+)

Testing: NVDA + Firefox, VoiceOver + Safari are the most used combos.

### Keyboard Navigation
- **Tab order**: logical DOM order, visual order matches
- **Focus trap**: modals trap until submit/close
- **Focus indicator**: visible focus ring (not `outline: none`)
- **Skip links**: bypass repetitive nav to main content
- **Shortcuts**: `Enter`/`Space` activates buttons, `Esc` closes dialogs
- **Arrow navigation**: in lists, menus, grids (roving tabindex)

### Color & Contrast
- **Contrast ratio**: text/background AA=4.5:1, AAA=7:1 (large text 3:1/4.5:1)
- **Color not required**: never convey info by color alone
- **Focus ring**: visible against all backgrounds (2px solid #005fcc)
- **High contrast mode**: Windows HC, macOS Increase Contrast

### Forms
- **Label**: every input has `<label>` or `aria-label`
- **Error identification**: `aria-invalid="true"`, `aria-describedby="error-id"`
- **Instructions**: `aria-describedby` for hints
- **Validation**: inline, announced, clear path to fix

### Media
- **Captions**: synchronized (not just auto-generated)
- **Audio description**: for videos with visual-only info
- **Transcripts**: for audio-only (podcasts)
- **No auto-play**: user-initiated media

---

## Quality Gates

1. **No axe violations**: WCAG AA compliance (0 errors, 0 serious)
2. **Keyboard-only**: all features usable without mouse
3. **Screen reader**: NVDA/Firefox navigates all controls with meaningful labels
4. **Focus visible**: never hidden (outline always present on focus)
5. **Contrast**: text achieves 4.5:1 minimum
6. **Touch target**: 44×44 CSS px minimum
7. **Reduced motion**: respects `prefers-reduced-motion`

---

## When to Apply

- New component architecture review
- Modal/dialog/sheet implementation
- Complex interaction (drag-drop, canvas)
- Form validation UX
- Rich text editor accessibility
- Icon-button labeling
- RTL + a11y simultaneously
