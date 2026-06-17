---
name: "WebApp UAT"
description: "User acceptance testing procedures for web applications. Use when: validating features with real users, conducting UAT sessions, or preparing for release."
---

# WebApp UAT

User acceptance testing framework for real-world validation.

## UAT Process

```
1. UAT Plan → 2. Test Cases → 3. User Testing → 4. Bug Reports → 5. Sign-off
```

## UAT Plan Template

```markdown
## UAT Plan: [Feature Name]

### Objective
Validate [feature] meets business requirements.

### Scope
- Included: [list]
- Excluded: [list]

### Test Environment
- URL: https://staging.mansoni.com
- Credentials: [provided separately]
- Test data: [seed instructions]

### Test Cases

| ID | Description | Steps | Expected Result | Priority |
|----|-------------|-------|----------------|----------|
| UAT-001 | Login flow | 1. Navigate to /login... | Success message | P1 |

### Success Criteria
- [ ] All P1 test cases pass
- [ ] No HIGH/CRITICAL bugs open
- [ ] Stakeholder sign-off received

### Schedule
- Start: [date]
- End: [date]
```

## Bug Report Template

```markdown
## Bug Report: [ID]

**Title:** [concise summary]
**Severity:** P1/P2/P3/P4
**Environment:** [browser, OS, device]

### Steps to Reproduce
1. Navigate to [page]
2. Click on [element]
3. Observe [result]

### Expected
[what should happen]

### Actual
[what happened]

### Evidence
[screenshots, logs]

### Priority to Fix
[P1/P2/P3/P4]
```

## For Mansoni

Key UAT scenarios:
1. New user registration
2. Chat conversation flow
3. Profile update
4. Media upload
5. Notification settings

## Sign-off Checklist

- [ ] All P1 bugs fixed
- [ ] All P2 bugs fixed or scheduled
- [ ] UAT report approved
- [ ] Stakeholder signature obtained