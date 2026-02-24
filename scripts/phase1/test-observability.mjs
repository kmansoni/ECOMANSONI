/**
 * Phase 1 EPIC M: Observability v1 - E2E Test
 * Purpose: Test guardrail triggers + auto-rollback
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lfkbgnbjxskspsownvjm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Test Helpers
// ============================================================================

async function resetTestState() {
  console.log('🔄 Resetting test state...');

  // Reset feature flags to enabled
  const { error: flagError } = await supabase
    .from('feature_flags')
    .update({ enabled: true, rollout_percentage: 100 })
    .in('flag_name', ['rate_limit_enforcement', 'personalized_ranking']);

  if (flagError) {
    console.error('Failed to reset feature flags:', flagError);
    throw flagError;
  }

  // Clean up test metrics
  const { error: metricsError } = await supabase
    .from('metrics_samples')
    .delete()
    .eq('metric_name', 'test_metric_spike');

  if (metricsError && metricsError.code !== 'PGRST116') {
    // Ignore "no rows found" error
    console.error('Failed to clean metrics:', metricsError);
  }

  console.log('✅ Test state reset');
}

async function verifyGuardrailExists(guardrailName) {
  const { data, error } = await supabase
    .from('guardrails_config')
    .select('*')
    .eq('guardrail_name', guardrailName)
    .single();

  if (error) {
    console.error(`Guardrail ${guardrailName} not found:`, error);
    return false;
  }

  console.log(`✅ Guardrail exists: ${guardrailName}`);
  console.log(`   - Metric: ${data.metric_name}`);
  console.log(`   - Threshold: ${data.threshold_value}`);
  console.log(`   - Action: ${data.action}`);
  console.log(`   - Kill Switch: ${data.kill_switch_flag || 'none'}`);

  return true;
}

async function simulateMetricSpike(
  metricName,
  value,
  count
) {
  console.log(`📊 Simulating metric spike: ${metricName} = ${value} (${count} samples)`);

  for (let i = 0; i < count; i++) {
    const { error } = await supabase.rpc('evaluate_guardrails_v1', {
      p_metric_name: metricName,
      p_value: value,
      p_labels: { test: true, iteration: i },
    });

    if (error) {
      console.error(`Failed to report metric (iteration ${i}):`, error);
      throw error;
    }
  }

  console.log(`✅ Reported ${count} samples`);
}

async function checkFeatureFlagStatus(flagName) {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled, rollout_percentage')
    .eq('flag_name', flagName)
    .single();

  if (error) {
    console.error(`Failed to check feature flag ${flagName}:`, error);
    throw error;
  }

  return data;
}

async function checkAutoRollbackLogs() {
  const { data, error } = await supabase
    .from('metrics_samples')
    .select('*')
    .eq('metric_name', 'guardrail_auto_rollback')
    .order('ts', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Failed to check auto-rollback logs:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Test Cases
// ============================================================================

async function testGuardrailBreach() {
  console.log('\n========================================');
  console.log('Test 1: Guardrail Breach Detection');
  console.log('========================================\n');

  // Verify rate_limit_spike guardrail exists
  const exists = await verifyGuardrailExists('rate_limit_spike');
  if (!exists) {
    throw new Error('Guardrail rate_limit_spike not found');
  }

  // Get initial state
  const initialFlag = await checkFeatureFlagStatus('rate_limit_enforcement');
  console.log(`Initial flag state: enabled=${initialFlag.enabled}, rollout=${initialFlag.rollout_percentage}%`);

  // Simulate metric spike (trigger rate_limit_spike guardrail)
  // Threshold: rate_limit_trigger_rate > 0.10 (10%)
  // We'll send 15% to trigger breach
  await simulateMetricSpike('rate_limit_trigger_rate', 0.15, 10);

  // Wait for evaluation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check if auto-rollback triggered
  const finalFlag = await checkFeatureFlagStatus('rate_limit_enforcement');
  console.log(`Final flag state: enabled=${finalFlag.enabled}, rollout=${finalFlag.rollout_percentage}%`);

  if (finalFlag.enabled === false && finalFlag.rollout_percentage === 0) {
    console.log('✅ Auto-rollback triggered successfully!');
  } else {
    console.log('❌ Auto-rollback did NOT trigger');
    console.log('   Expected: enabled=false, rollout=0');
    console.log(`   Actual: enabled=${finalFlag.enabled}, rollout=${finalFlag.rollout_percentage}`);
    throw new Error('Auto-rollback failed');
  }

  // Check rollback logs
  const logs = await checkAutoRollbackLogs();
  console.log(`\n📋 Auto-rollback logs (${logs.length} entries):`);
  logs.forEach((log, i) => {
    console.log(`   ${i + 1}. ${log.ts}: ${JSON.stringify(log.labels)}`);
  });
}

async function testSLOStatus() {
  console.log('\n========================================');
  console.log('Test 2: SLO Status Query');
  console.log('========================================\n');

  // Query SLO status for trust domain
  const { data, error } = await supabase.rpc('get_slo_status_v1', {
    p_domain: 'trust',
    p_lookback_minutes: 60,
  });

  if (error) {
    console.error('Failed to get SLO status:', error);
    throw error;
  }

  console.log(`📊 SLO Status for domain: ${data.domain || 'all'}`);
  console.log(`   Lookback: ${data.lookback_minutes} minutes`);
  console.log(`   Checked at: ${data.checked_at}`);
  console.log(`   Metrics (${data.metrics.length}):`);

  data.metrics.forEach((metric, i) => {
    const status = metric.met ? '✅' : '❌';
    console.log(`   ${i + 1}. ${status} ${metric.metric} (${metric.type})`);
    if (metric.avg !== undefined) {
      console.log(`      - Avg: ${metric.avg}`);
    }
    if (metric.p95 !== undefined) {
      console.log(`      - P95: ${metric.p95}`);
    }
    console.log(`      - SLO: ${JSON.stringify(metric.slo_target)}`);
    console.log(`      - Samples: ${metric.sample_count}`);
  });
}

async function testActiveBreaches() {
  console.log('\n========================================');
  console.log('Test 3: Active Guardrail Breaches');
  console.log('========================================\n');

  const { data, error } = await supabase.rpc('get_active_guardrail_breaches_v1', {
    p_lookback_minutes: 15,
  });

  if (error) {
    console.error('Failed to get active breaches:', error);
    throw error;
  }

  console.log(`🚨 Active Breaches (lookback: ${data.lookback_minutes} min):`);
  console.log(`   Total: ${data.breach_count}`);
  console.log(`   Checked at: ${data.checked_at}`);

  if (data.breaches.length === 0) {
    console.log('   ✅ No active breaches');
  } else {
    data.breaches.forEach((breach, i) => {
      console.log(`\n   ${i + 1}. ${breach.severity} - ${breach.guardrail}`);
      console.log(`      - Metric: ${breach.metric}`);
      console.log(`      - Avg Value: ${breach.avg_value}`);
      console.log(`      - Threshold: ${breach.threshold} (${breach.condition})`);
      console.log(`      - Breach: ${breach.breach_pct}%`);
      console.log(`      - Action: ${breach.action}`);
      if (breach.kill_switch_flag) {
        console.log(`      - Kill Switch: ${breach.kill_switch_flag}`);
      }
    });
  }
}

async function testMetricSamplesQuery() {
  console.log('\n========================================');
  console.log('Test 4: Metric Samples Query');
  console.log('========================================\n');

  const { data, error } = await supabase.rpc('get_metric_samples_v1', {
    p_metric_name: 'rate_limit_trigger_rate',
    p_lookback_minutes: 60,
    p_limit: 10,
  });

  if (error) {
    console.error('Failed to get metric samples:', error);
    throw error;
  }

  console.log(`📈 Metric Samples: rate_limit_trigger_rate`);
  console.log(`   Recent samples (${data.length}):`);

  data.forEach((sample, i) => {
    console.log(`   ${i + 1}. ${sample.ts}: ${sample.value} (labels: ${JSON.stringify(sample.labels)})`);
  });
}

async function testCleanup() {
  console.log('\n========================================');
  console.log('Test 5: Metric Cleanup');
  console.log('========================================\n');

  // Insert old sample (8 days ago)
  const { error: insertError } = await supabase
    .from('metrics_samples')
    .insert({
      metric_name: 'test_metric_cleanup',
      value: 100,
      ts: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      labels: { test: true },
    });

  if (insertError) {
    console.error('Failed to insert old sample:', insertError);
    throw insertError;
  }

  console.log('✅ Inserted old sample (8 days ago)');

  // Run cleanup (default retention: 7 days)
  const { data, error } = await supabase.rpc('cleanup_old_metric_samples_v1', {
    p_retention_days: 7,
  });

  if (error) {
    console.error('Failed to run cleanup:', error);
    throw error;
  }

  console.log(`🧹 Cleanup result:`);
  console.log(`   - Deleted: ${data.deleted_count} samples`);
  console.log(`   - Retention: ${data.retention_days} days`);
  console.log(`   - Cleaned at: ${data.cleaned_at}`);

  if (data.deleted_count >= 1) {
    console.log('✅ Cleanup successful');
  } else {
    console.log('⚠️ No samples deleted (expected at least 1)');
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runTests() {
  console.log('🧪 Phase 1 EPIC M: Observability E2E Tests');
  console.log('==========================================\n');

  try {
    // Reset state before tests
    await resetTestState();

    // Run test cases
    await testGuardrailBreach();
    await testSLOStatus();
    await testActiveBreaches();
    await testMetricSamplesQuery();
    await testCleanup();

    // Reset state after tests
    await resetTestState();

    console.log('\n========================================');
    console.log('✅ All tests passed!');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ Test failed:', error);
    console.error('========================================\n');
    process.exit(1);
  }
}

// Run tests
runTests();
