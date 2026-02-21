# Contributing to ECOMANSONI

Thank you for your interest in contributing! This guide will help you get set up and understand the contribution process.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Report a Bug](#how-to-report-a-bug)
3. [How to Request a Feature](#how-to-request-a-feature)
4. [Development Setup](#development-setup)
5. [Branching Strategy](#branching-strategy)
6. [Commit Message Convention](#commit-message-convention)
7. [Pull Request Process](#pull-request-process)
8. [Coding Standards](#coding-standards)
9. [Testing](#testing)

---

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to abide by it.

---

## How to Report a Bug

1. Search [existing issues](https://github.com/kmansoni/ECOMANSONI/issues) to avoid duplicates.
2. Open a new issue and include:
   - A clear title and description
   - Steps to reproduce
   - Expected vs. actual behaviour
   - Browser / OS / Node version
   - Relevant console errors or screenshots

---

## How to Request a Feature

1. Open an issue with the label `enhancement`.
2. Describe the use-case and the proposed solution.
3. Be patient — features are reviewed against the project roadmap.

---

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-fork>/ECOMANSONI.git
cd ECOMANSONI

# 2. Install dependencies
npm install

# 3. Copy and fill environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Start the dev server
npm run dev
```

See [README.md](./README.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) for a full environment overview.

---

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code |
| `feature/<short-description>` | New features |
| `fix/<short-description>` | Bug fixes |
| `chore/<short-description>` | Tooling, dependencies, docs |

Always branch off `main` and open a PR back to `main`.

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

**Examples:**
```
feat(insurance): add multi-company comparison table
fix(ar): restore camera permission request on iOS
docs(readme): add deployment section
```

---

## Pull Request Process

1. **Create a branch** from `main` following the naming convention above.
2. **Write or update tests** for any behaviour you change (see [Testing](#testing)).
3. **Run the full suite locally** before pushing:
   ```bash
   npm run lint
   npm test
   npm run build
   ```
4. **Open a PR** and fill in the template. Reference the related issue with `Closes #<issue>`.
5. **Address review comments** — all required checks must pass before merge.
6. PRs are merged by a maintainer using **squash-merge**.

---

## Coding Standards

- **TypeScript** everywhere — avoid `any` where possible.
- **ESLint** — run `npm run lint` and fix all errors before committing.
- **Formatting** — the project relies on ESLint rules for style; no separate Prettier config is required.
- Use `@/` path aliases (e.g. `import { Button } from "@/components/ui/button"`).
- Keep components small and focused; extract logic into custom hooks under `src/hooks/`.
- Prefer `const` and arrow functions for component definitions.

---

## Testing

### Unit tests (Vitest)

Add tests in `src/test/` or co-located `*.test.ts(x)` files:

```bash
npm test         # run once
npm run test:watch  # watch mode
```

### End-to-End tests (Playwright)

E2E specs live in `e2e/`:

```bash
npx playwright test
```

New features must include at least one unit test covering the happy path.
