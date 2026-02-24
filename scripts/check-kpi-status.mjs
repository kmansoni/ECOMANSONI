import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lfkbgnbjxskspsownvjm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('kpi_daily_snapshots')
  .select('snapshot_date, phase, status, kpi_scores')
  .order('snapshot_date', { ascending: false })
  .limit(5);

if (error) {
  console.error('DB Error:', error.message);
  process.exit(1);
}

console.log('\n=== Phase 1 KPI Status ===\n');

if (data && data.length > 0) {
  data.forEach((row, idx) => {
    console.log(`${idx + 1}. Date: ${row.snapshot_date}`);
    console.log(`   Phase: ${row.phase}, Status: ${row.status}`);
    if (row.kpi_scores) {
      console.log(`   Scores: ${JSON.stringify(row.kpi_scores, null, 2)}`);
    }
    console.log();
  });
} else {
  console.log('No KPI snapshots found');
}

// Summary for EPIC N decision
if (data && data[0]) {
  const latest = data[0];
  console.log('\n=== EPIC N Decision Gate ===');
  console.log(`Latest status: ${latest.status}`);
  console.log(`Phase 1 KPIs: ${latest.status === 'green' ? 'GREEN ✅' : latest.status === 'yellow' ? 'YELLOW ⚠️' : 'RED 🔴'}`);
  
  if (latest.status === 'green') {
    console.log('\n→ EPIC N (Live beta) is ENABLED - All Phase 1 KPI gates met');
  } else if (latest.status === 'yellow') {
    console.log('\n→ EPIC N (Live beta) is CONDITIONAL - Monitor Phase 1 metrics');
  } else {
    console.log('\n→ EPIC N (Live beta) is BLOCKED - Fix Phase 1 KPI issues first');
  }
}
