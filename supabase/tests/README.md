# Supabase Integration Tests

## 1) Edge Function unit test

Run Deno unit tests for payload validation:

```bash
deno test supabase/functions/email-send/validation_test.ts
```

## 2) SQL integration assertions

Run after applying migrations:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/nav_driver_availability_integration.sql
```

The SQL script checks:
- `public.nav_set_driver_availability(uuid, text)` exists
- `nav_driver_profiles_active_requires_verification` constraint exists
- `idx_driver_zone_active` index exists
- function error contracts for invalid availability and missing driver profile
