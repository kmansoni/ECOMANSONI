---
name: "Release Manager"
description: "Coordinated release process with versioning, changelog, and deployment gates. Use when: planning releases, managing versions, or coordinating deployments."
---

# Release Manager

Coordinated release process with quality gates.

## Release Checklist

```markdown
## Release v1.2.3 — Feature: Real-time Chat

### Pre-release
- [ ] All tests green
- [ ] Security scan passed
- [ ] Performance benchmarks met
- [ ] Changelog updated
- [ ] Migration rollback tested

### Deployment
- [ ] Notify stakeholders
- [ ] Set maintenance window
- [ ] Execute migration
- [ ] Deploy application
- [ ] Verify health checks
- [ ] Monitor error rates

### Post-release
- [ ] Verify all features work
- [ ] Update documentation
- [ ] Announce to users
- [ ] Schedule follow-up review
```

## Version Strategy

```
MAJOR.MINOR.PATCH
  │     │     └─ Bug fixes, no new features
  │     └─────── New features, backward compatible
  └───────────── Breaking changes
```

## Git Workflow

```bash
# Feature branch
git checkout -b release/1.2.3

# Update version
npm version patch  # or minor/major

# Create PR to main
gh pr create --base main --head release/1.2.3

# After approval, tag and deploy
git tag v1.2.3
git push origin v1.2.3
```

## Deployment Gates

| Gate | Criteria | Owner |
|------|----------|-------|
| Code Review | 2 approvals | Team |
| Tests | 100% pass | CI |
| Security | No HIGH/CRITICAL | Security |
| Performance | FCP < 3s, LCP < 5s | Performance |
| Changelog | Updated | Author |

## Hotfix Process

```bash
# Create hotfix branch
git checkout -b hotfix/1.2.4

# Fix and test

# Merge to main
git checkout main && git merge hotfix/1.2.4

# Tag immediately
git tag v1.2.4 && git push origin v1.2.4
```

## For Mansoni

Release schedule:
- Major: Quarterly
- Minor: Bi-weekly
- Hotfix: As needed
