# Phase 1 Trust-lite: Migration Deployment Script
# Creates all 8 Phase 1 migration files with content

$ErrorActionPreference = "Stop"

$migrationsDir = "supabase\migrations"
$workspaceRoot = $PWD

Write-Host "🚀 Phase 1 Trust-lite Migration Deployment" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Migration file paths (relative to workspace root)
$migrations = @(
    "20260224020001_phase1_tenant_model.sql",
    "20260224020002_phase1_scope_registry.sql",
    "20260224020003_phase1_service_identities.sql",
    "20260224020004_phase1_delegations.sql",
    "20260224020005_phase1_trust_core.sql",
    "20260224020006_phase1_trust_rpc.sql",
    "20260224020007_phase1_retention_cleanup.sql",
    "20260224020008_phase1_seed_data.sql"
)

Write-Host "📋 Creating migration files..." -ForegroundColor Yellow

foreach ($migr in $migrations) {
    $filePath = Join-Path $migrationsDir $migr
    
    if (Test-Path $filePath) {
        Write-Host "  ⚠️  $migr already exists (skipping)" -ForegroundColor Yellow
    } else {
        New-Item -Path $filePath -ItemType File -Force | Out-Null
        Write-Host "  ✓ Created $migr" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "✅ All migration files created" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Copy SQL content into each migration file"
Write-Host "  2. Run: supabase db push --dry-run"
Write-Host "  3. Review output, then: supabase db push"
Write-Host ""
