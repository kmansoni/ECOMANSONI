---
name: "Secret Management"
description: "Secure handling of API keys, tokens, and credentials. Use when: managing secrets, rotating keys, or auditing credential storage."
---

# Secret Management

Secure handling of application secrets and credentials.

## Principles

- Never commit secrets to git
- Use environment variables
- Rotate regularly
- Least privilege access

## For Supabase

```bash
# Set edge function secrets
supabase secrets set MY_SECRET=value

# List secrets (names only, not values)
supabase secrets list

# Unset
supabase secrets unset MY_SECRET
```

## Environment Files

- `.env.local` — local overrides (gitignored)
- `.env.production` — production defaults (committed without secrets)
- `.env.*.local` — sensitive local configs (gitignored)

## What NOT to store in env

- JWT signing keys (use key rotation service)
- Database passwords (use IAM roles)
- API keys for external services (use secrets manager)

## For Mansoni

Critical secrets: SUPABASE_URL, SUPABASE_ANON_KEY/SERVICE_KEY, OpenAI/Anthropic keys, JWT secrets