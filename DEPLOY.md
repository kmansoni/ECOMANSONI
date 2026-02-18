# Deploy

## 1) Supabase (DB + Edge Functions)

Prereqs:
- Supabase CLI installed (already in VS Code tasks)
- `SUPABASE_ACCESS_TOKEN` set in your PowerShell session (starts with `sbp_...`)

Run:

```powershell
cd "C:\Users\manso\Desktop\разработка\your-ai-companion-main"
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
./scripts/supabase-deploy.ps1
```

Alternative (VS Code tasks):
- Run Task → `Supabase: Link project (lfkbgnbjxskspsownvjm)`
- Run Task → `Supabase: DB push (dry-run, linked)` → `Supabase: DB push (linked)`
- Run Task → `Supabase: Functions deploy (vk-webhook)`

Notes:
- Dry run only:

```powershell
./scripts/supabase-deploy.ps1 -DryRun
```

- Deploy only functions (skip DB):

```powershell
./scripts/supabase-deploy.ps1 -SkipDbPush
```

### vk-webhook secrets

`vk-webhook` requires these secrets in Supabase (Project → Edge Functions → Secrets, or CLI):
- `VK_CALLBACK_SECRET` (required)
- `VK_CONFIRMATION_TOKEN` (required)
- `VK_GROUP_TOKEN` (required)
- `VK_GROUP_ID` (optional)
- `OPENAI_API_KEY` (optional; if missing the bot replies with a fallback message)
- `OPENAI_MODEL` (optional)
- `VK_AI_SYSTEM_PROMPT` (optional)

CLI example (replace values):

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$sb = "$env:LOCALAPPDATA\supabase-cli\v2.75.0\supabase.exe"
& $sb secrets set VK_CALLBACK_SECRET="..." VK_CONFIRMATION_TOKEN="..." VK_GROUP_TOKEN="..." OPENAI_API_KEY="..."
```

### Verify

- Function URL is typically one of:
   - `https://lfkbgnbjxskspsownvjm.supabase.co/functions/v1/vk-webhook`
   - `https://lfkbgnbjxskspsownvjm.functions.supabase.co/vk-webhook`
   Check the exact URL in Supabase Dashboard → Edge Functions.

- Logs:
   - Run Task → `Supabase: Functions logs (vk-webhook)`

## 2) Frontend hosting (site)

Supabase is the backend; it doesn’t host a Vite SPA like Vercel/Netlify/GitHub Pages.

### Option A (recommended): GitHub Pages (already configured)

Workflow: `.github/workflows/deploy-pages.yml`

Steps:
1. Push to `main` (or `master`) on GitHub.
2. GitHub → Settings → Pages → Source: **GitHub Actions**.
3. GitHub → Settings → Secrets and variables → Actions → add:
   - `VITE_SUPABASE_URL` = `https://lfkbgnbjxskspsownvjm.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your Supabase `anon` key

The workflow sets `VITE_BASE=/<repo>/` automatically.

### Option B: Vercel

1. `npm i -g vercel`
2. `vercel --prod`
3. Add env vars in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
