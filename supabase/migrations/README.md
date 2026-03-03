# Supabase migrations notes

## Remote mirror placeholder migrations

In this repository, some migrations are intentionally present as **local placeholders** to mirror versions that already existed on the remote project history.

Purpose:
- keep `supabase migration list` in sync between local and remote;
- prevent guarded deploy from failing on history drift (`local='' remote='...'`);
- avoid rewriting production-applied SQL that is not available in this workspace.

These files are named with suffix `_remote_mirror_placeholder.sql` and contain no schema changes (only a no-op statement).

Current mirrored versions:
- `20260301133000`
- `20260301142000`
- `20260301143000`
- `20260301144000`
- `20260301145000`
- `20260301150000`
- `20260301151000`
- `20260301152000`
- `20260301170000`
- `20260301183000`
- `20260301190000`
- `20260301193000`
- `20260301200000`
- `20260301203000`
- `20260301210000`
- `20260301211000`

## Team rules

- Do not delete placeholder migration files once they are used to align history.
- Do not put real DDL/DML into placeholder files.
- New schema changes must always go into normal timestamped migrations.
- If remote has versions absent locally, add new placeholders with the same timestamp version and `_remote_mirror_placeholder.sql` suffix.

## Why guarded deploy failed before

The sync guard checks for migration history drift after `supabase link`. It fails when one side has version rows the other side does not.

After adding placeholders and applying pending local migrations, guarded deploy passes with:
- remote drift check = 0 issues;
- `supabase db push` = up to date.
