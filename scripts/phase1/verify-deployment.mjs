#!/usr/bin/env node
/**
 * Phase 1 Deployment Verification (Anon-safe)
 * Usage: VITE_SUPABASE_URL="..." VITE_SUPABASE_ANON_KEY="..." node verify-deployment.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://lfkbgnbjxskspsownvjm.supabase.co";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDI0NTYsImV4cCI6MjA4NzAxODQ1Nn0.WNubMc1s9TA91aT_txY850x2rWJ1ayxiTs7Rq6Do21k";

if (!supabaseUrl || !anonKey) {
  console.error('ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

async function verify() {
  console.log('Phase 1 Deployment Verification\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Public readable tables
  console.log('✓ Check public tables...');
  const publicTables = ['scope_definitions', 'rate_limit_configs'];
  
  for (const table of publicTables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`  ✗ Table ${table} error:`, error.message);
      failed++;
    } else {
      console.log(`  ✓ Table ${table} accessible (${data.length} rows)`);
      passed++;
    }
  }
  
  // Test 2: Seed data
  console.log('\n✓ Check seed data...');
  const { data: scopes, error: scopesError } = await supabase
    .from('scope_definitions')
    .select('*');
  
  if (scopesError) {
    console.error('  ✗ Scope definitions error:', scopesError.message);
    failed++;
  } else {
    const count = scopes.length;
    if (count >= 10) {
      console.log(`  ✓ Scope definitions seeded (${count} scopes)`);
      passed++;
    } else {
      console.error(`  ✗ Insufficient scope definitions (${count} < 10)`);
      failed++;
    }
  }
  
  const { data: limits, error: limitsError } = await supabase
    .from('rate_limit_configs')
    .select('*');
  
  if (limitsError) {
    console.error('  ✗ Rate limit configs error:', limitsError.message);
    failed++;
  } else {
    const count = limits.length;
    if (count >= 10) {
      console.log(`  ✓ Rate limit configs seeded (${count} configs)`);
      passed++;
    } else {
      console.error(`  ✗ Insufficient rate limit configs (${count} < 10)`);
      failed++;
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n✅ Phase 1 deployment verified!');
    console.log('\nNext steps:');
    console.log('1. Set SERVICE_KEY_ENCRYPTION_SECRET in Supabase secrets');
    console.log('2. Test auto-tenant creation (signup new user)');
    console.log('3. Test delegation token issuance');
    process.exit(0);
  } else {
    console.log('\n❌ Phase 1 deployment has errors');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
