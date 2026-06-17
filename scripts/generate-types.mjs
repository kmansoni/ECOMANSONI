#!/usr/bin/env node
/**
 * Генерирует декомпозированные типы из types.ts
 * Usage: node scripts/generate-types.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TYPES_FILE = join(ROOT, 'src/integrations/supabase/types.ts');
const OUTPUT_DIR = join(ROOT, 'src/integrations/supabase/types');
const BACKUP_DIR = join(ROOT, 'src/integrations/supabase/types_backup');
const RPC_OUTPUT_DIR = join(OUTPUT_DIR, 'rpc');

// ── Группировка ─────────────────────────────────────────────────────────────
const GROUPS = {
  auth: ['auth_accounts', 'auth_audit_events', 'auth_devices', 'auth_sessions'],
  core: ['profiles', 'user_sessions', 'user_totp_secrets', 'user_verifications', 'user_badges', 'user_roles'],
  social: ['blocked_users', 'close_friends', 'follow_requests', 'followers', 'user_interactions', 'user_interests', 'user_author_affinity'],
  posts: ['posts', 'post_comments', 'post_likes', 'post_media', 'post_views', 'post_reminders', 'post_collabs', 'post_promotions', 'post_user_tags', 'post_content_tags'],
  stories: ['stories', 'story_views', 'story_reactions', 'story_replies', 'story_emoji_slider_votes', 'story_emoji_sliders', 'story_poll_votes', 'story_polls', 'story_question_answers', 'storyquestions', 'story_quiz_answers', 'story_quizzes', 'story_countdown_subscribers', 'story_countdowns', 'story_highlights', 'story_music', 'story_segments', 'story_stickers'],
  reels: ['reels', 'reel_views', 'reel_likes', 'reel_comments', 'reel_comment_likes', 'reel_shares', 'reel_saves', 'reel_remixes', 'reel_reposts', 'reel_hashtags', 'reel_audio_tracks', 'reel_audios', 'reel_collaborators', 'reel_content_features', 'reel_impressions', 'reel_metrics', 'reel_metrics_snapshots', 'reel_templates', 'reel_trending_topics', 'reel_virality_metrics', 'reel_moderation_audit'],
  messages: ['messages', 'message_reactions', 'message_read_receipts', 'message_reminders', 'message_threads', 'message_edit_history', 'message_polls', 'message_versions'],
  conversations: ['conversations', 'dm_pairs', 'conversation_participants', 'conversation_pins', 'conversation_state', 'conversation_cursors'],
  groupChats: ['group_chats', 'group_chat_members', 'group_chat_messages', 'group_chat_slow_mode_state'],
  channels: ['channels', 'channel_members', 'channel_messages', 'channel_message_views', 'channel_message_reactions', 'channel_invite_links', 'channel_join_requests', 'channel_boosts', 'channel_boost_levels', 'channel_pins', 'channel_post_stats', 'channel_post_view_log', 'channel_audit_log', 'channel_capability_catalog', 'channel_capability_overrides', 'channel_role_capabilities', 'channel_user_settings', 'channel_analytics_daily', 'channel_moderation_log'],
  discovery: ['hashtags', 'hashtag_categories', 'hashtag_category_mapping', 'hashtag_status_changes', 'trending_hashtags', 'trending_topics', 'explore_cache', 'explore_cache_entries', 'explore_sessions', 'explore_section_clicks', 'search_history'],
  media: ['media_objects', 'uploads', 'upload_parts', 'assets', 'video_messages', 'voice_messages'],
  music: ['music_tracks', 'music_playlists', 'music_playlist_tracks', 'music_library'],
  editor: ['editor_projects', 'editor_assets', 'editor_templates', 'editor_tracks', 'editor_clips', 'editor_effects', 'editor_keyframes'],
  live: ['live_sessions', 'live_viewers', 'live_chat_messages', 'live_chat_bans', 'live_donations', 'live_locations', 'live_moderators', 'live_questions', 'live_schedule_reminders', 'live_session_analytics', 'live_stream_reports', 'live_shopping_pins', 'live_shopping_products', 'live_collab_sessions', 'live_badges'],
  calls: ['audio_rooms', 'audio_room_participants', 'audio_tracks', 'video_call_signals', 'video_calls_legacy'],
  notifications: ['notifications', 'notification_settings', 'notification_category_settings', 'notification_deliveries', 'notification_events', 'notification_exceptions', 'notification_schedules', 'push_tokens'],
  userSettings: ['user_settings', 'user_chat_settings', 'user_appearance_settings', 'user_dnd_settings', 'user_global_chat_settings', 'user_energy_saver_settings', 'user_hidden_words', 'user_channel_group_settings', 'user_quick_reaction', 'user_quick_reaction_overrides'],
  userContent: ['user_reactions', 'user_recent_stickers', 'user_saved_gifs', 'user_saved_tracks', 'user_sticker_archive', 'user_sticker_library', 'user_sticker_packs', 'user_emoji_preferences', 'user_emoji_packs', 'user_reaction_packs'],
  payments: ['payment_invoices', 'payment_refunds', 'premium_plans', 'premium_features', 'premium_limits', 'premium_payments', 'premium_subscriptions', 'star_reactions', 'star_transactions', 'payout_requests', 'coupons', 'coupon_usages'],
  shop: ['shops', 'shop_products', 'shop_orders', 'shop_order_items', 'shop_collections', 'shop_collection_items', 'shop_cart_items'],
  creator: ['creator_fund_accounts', 'creator_fund_payouts', 'creator_fund_daily_earnings', 'creator_subscriptions', 'creator_metrics', 'creator_metrics_snapshots', 'creator_earnings', 'render_jobs', 'render_job_logs'],
  taxi: ['taxi_rides', 'taxi_scheduled_rides', 'taxi_drivers', 'taxi_driver_locations', 'taxi_ratings', 'taxi_driver_ratings', 'taxi_complaints', 'taxi_surge_cache'],
  insurance: ['insurance_policies', 'insurance_claims', 'insurance_payments', 'insurance_payouts', 'insurance_products', 'insurance_providers', 'insurance_companies', 'insurance_clients', 'insurance_vehicles', 'insurance_calculations', 'insurance_drafts', 'insurance_quote_sessions', 'insurance_quote_offers', 'insurance_referral_links', 'insurance_commissions', 'insurance_company_reviews', 'insurance_kbm_cache', 'insurance_vehicle_cache', 'insurance_loyalty_history', 'insurance_provider_logs'],
  navigation: ['nav_trips', 'nav_zones', 'nav_pois', 'nav_addresses', 'nav_saved_places', 'nav_location_shares', 'nav_location_history', 'nav_location_history_default', 'nav_driver_profiles', 'nav_risk_events', 'nav_risk_events_default', 'nav_risk_scores', 'nav_surge_pricing', 'nav_traffic_segments', 'nav_traffic_segments_default', 'nav_search_history', 'nav_crowdsource_reports', 'nav_report_votes', 'nav_map_edits', 'nav_geocoding_cache', 'nav_enforcement_actions', 'nav_dispatch_log', 'nav_dispatch_offers', 'nav_demand_forecast', 'nav_road_segments', 'nav_reporter_reputation', 'nav_zone_market_state'],
  admin: ['admin_users', 'admin_roles', 'admin_permissions', 'admin_user_roles', 'admin_staff_profiles', 'admin_audit_events', 'admin_action_log', 'admin_sessions', 'admin_policies', 'admin_role_permissions', 'admin_kill_switches'],
  moderation: ['moderation_reports', 'moderation_cases', 'moderation_decisions', 'moderation_queue_items', 'moderation_actions', 'moderation_appeals', 'moderation_events', 'moderation_reporter_quality', 'content_flags', 'content_reports', 'content_filters', 'content_drafts', 'content_moderation_status', 'content_moderation_actions', 'anti_abuse_policies', 'anti_abuse_weights', 'spam_indicators'],
  bots: ['bots', 'bot_tokens', 'bot_webhooks', 'bot_commands', 'bot_chats', 'bot_messages', 'bot_conversations', 'bot_inline_keyboards', 'bot_analytics', 'bot_update_events', 'bot_payment_providers'],
  email: ['email_threads', 'email_templates', 'email_deliveries', 'email_outbox', 'email_inbox', 'email_imap_settings', 'email_smtp_settings', 'email_otp_codes'],
  infra: ['idempotency_keys', 'idempotency_locks', 'idempotency_register', 'idempotency_outcomes_archive', 'idempotency_outcomes_hot', 'rate_limit_configs', 'rate_limit_audits', 'edge_rate_limits'],
  experiments: ['ab_experiments', 'ab_assignments'],
  misc: ['calls', 'locations', 'comments', 'highlights', 'quick_replies', 'quick_reaction_catalog', 'saved_posts', 'saved_messages', 'saved_collections', 'saved_collection_items', 'recommended_users', 'recommended_content', 'scheduled_messages', 'link_previews', 'feature_flags', 'transit_routes', 'translated_messages', 'kpi_daily_snapshots', 'polls', 'poll_options', 'poll_votes', 'properties', 'property_favorites', 'property_images', 'property_saved_searches', 'property_views', 'tenants', 'tenant_members', 'metrics_registry', 'metrics_samples', 'verification_requests', 'login_events', 'username_transactions', 'collectible_usernames', 'vanish_mode_sessions', 'trust_profiles', 'trust_weight_overrides', 'rights_events', 'restricted_users', 'turn_issuance_audit', 'turn_issuance_rl', 'turn_replay_guard', 'decision_engine_events', 'decision_jobs', 'decision_snapshots', 'delegations', 'delegation_tokens', 'service_identities', 'service_keys', 'settings_change_audit', 'emergency_signals', 'broadcast_channels', 'broadcast_channel_members', 'broadcast_channel_messages', 'business_accounts', 'business_chat_labels', 'guide_items', 'guides', 'incidents', 'integration_webhooks', 'integration_workflows', 'known_devices', 'paid_message_transactions', 'pinned_posts', 'policy_renewals', 'profile_notes', 'profile_links', 'publish_events', 'publish_outbox', 'recovery_emails', 'scope_definitions', 'scope_invites', 'secret_chats', 'sent_gifts', 'service_bugs', 'shared_locations', 'similar_users', 'snapshot_content_hashes', 'supergroup_settings', 'supergroup_member_permissions', 'telemetry_events', 'thread_read_positions', 'threads_muted', 'transcode_jobs', 'trend_runs', 'upload_parts', 'user_embeddings', 'user_notes', 'user_screen_time', 'user_similarity_scores', 'user_story_settings', 'user_locations', 'note_reactions', 'ai_chat_messages', 'ai_feedback', 'ai_stickers', 'ai_usage_limits', 'algorithm_versions', 'anonymous_admin_actions', 'app_icon_catalog', 'appeal_rate_limits', 'approval_steps', 'approvals', 'archived_posts', 'archived_stories', 'aria_memories', 'authorized_sites', 'boosted_posts', 'branded_content_approved_authors', 'branded_content_partner_requests', 'chat_client_metrics', 'chat_encryption_keys', 'chat_events', 'chat_folder_items', 'chat_folders', 'chat_inbox_projection', 'chat_rate_limits', 'chat_recovery_throttle', 'chat_shortcuts', 'chat_stream_heads', 'chat_write_ledger', 'controversial_content_flags', 'core_events', 'core_receipts', 'core_scope_members', 'core_scopes', 'custom_emojis', 'dating_matches', 'dating_profiles', 'dating_swipes', 'delivery_outbox', 'device_accounts', 'device_active_account', 'device_tokens', 'draft_versions', 'drafts', 'emoji_packs', 'emoji_sets', 'feed_impressions', 'feed_quality_metrics', 'gift_catalog', 'guardrail_alerts', 'guardrails_config', 'highlight_stories', 'join_requests', 'live_badges', 'owner_escalation_requests', 'owners', 'payment_invoices', 'payment_refunds', 'phone_otps', 'product_reviews', 'product_tags', 'product_variants', 'projection_watermarks', 'ranking_explanations', 'reaction_pack_items', 'reaction_packs', 'render_jobs', 'rpc_audit_log', 'sticker_items', 'sticker_packs', 'stickers', 'testimonials'],
};

// ── Парсинг types.ts ─────────────────────────────────────────────────────────
function parseTables(content) {
  const lines = content.split('\n');
  const tables = {};
  let current = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Таблица: 8 пробелов + имя + : {
    const tableMatch = line.match(/^( {8})([a-z_]+): \{\s*$/);
    if (tableMatch) {
      current = tableMatch[2];
      depth = 1;
      tables[current] = [line];
      continue;
    }

    if (current) {
      tables[current].push(line);
      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;

      if (depth === 0) {
        current = null;
      }
    }
  }

  return tables;
}

function parseFunctions(content) {
  const lines = content.split('\n');
  const funcs = {};
  let current = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // RPC функции: Tables: или Functions: секции (12 пробелов)
    const funcMatch = line.match(/^( {12})([a-z_]+): \{\s*$/);
    if (funcMatch) {
      current = funcMatch[2];
      depth = 1;
      funcs[current] = [line];
      continue;
    }

    if (current) {
      funcs[current].push(line);
      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;

      if (depth === 0) {
        current = null;
      }
    }
  }

  return funcs;
}

// ── Генерация (с авто-разбиением >400 строк) ─────────────────────────────────
function splitIntoFiles(name, tableNames, parsedTables, maxLines = 400) {
  const results = [];
  const baseLines = [
    `/**`,
    ` * ${name} types`,
    ` * Tables: ${tableNames.length}`,
    ` */`,
    '',
  ];

  let currentFile = [];
  let currentTables = [];
  let fileIndex = 0;

  for (const tableName of tableNames) {
    if (!parsedTables[tableName]) continue;

    const tableLines = parsedTables[tableName];
    const projectedLines = currentFile.length + tableLines.length + 2; // +2 for blank lines

    if (projectedLines > maxLines && currentTables.length > 0) {
      // Сохранить текущий файл
      results.push({
        name: fileIndex === 0 ? name : `${name}_${fileIndex + 1}`,
        content: [...baseLines, ...currentFile].join('\n'),
        tableCount: currentTables.length,
      });
      fileIndex++;
      currentFile = [];
      currentTables = [];
    }

    currentFile.push(`// ${tableName}`, ...tableLines, '');
    currentTables.push(tableName);
  }

  // Последний файл
  if (currentTables.length > 0) {
    results.push({
      name: fileIndex === 0 ? name : `${name}_${fileIndex + 1}`,
      content: [...baseLines, ...currentFile].join('\n'),
      tableCount: currentTables.length,
    });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log('Reading types.ts...');
const content = readFileSync(TYPES_FILE, 'utf8');

console.log('Parsing tables...');
const parsedTables = parseTables(content);
console.log(`  Found ${Object.keys(parsedTables).length} tables`);

console.log('Parsing RPC functions...');
const parsedFuncs = parseFunctions(content);
console.log(`  Found ${Object.keys(parsedFuncs).length} functions`);

// Backup
if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!existsSync(join(BACKUP_DIR, 'types.ts'))) {
  cpSync(TYPES_FILE, join(BACKUP_DIR, 'types.ts'));
}
console.log(`\nBackup: ${BACKUP_DIR}/types.ts`);

// Create dirs
if (existsSync(OUTPUT_DIR)) {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(RPC_OUTPUT_DIR, { recursive: true });

// Generate table files
console.log('\nGenerating files...');
const totalTables = Object.values(GROUPS).flat().length;
let generatedTables = 0;
const allGeneratedFiles = [];

// Table files
for (const [name, tables] of Object.entries(GROUPS)) {
  const files = splitIntoFiles(name, tables, parsedTables);

  for (const file of files) {
    const filePath = join(OUTPUT_DIR, `${file.name}.ts`);
    const lineCount = file.content.split('\n').length;
    if (lineCount > 400) {
      console.warn(`  ⚠ ${file.name}.ts: ${lineCount} lines (exceeds 400)`);
    }
    writeFileSync(filePath, file.content);
    allGeneratedFiles.push(file.name);
    generatedTables += file.tableCount;
    console.log(`  ✓ ${file.name}.ts (${file.tableCount} tables, ${lineCount} lines)`);
  }
}

// Generate index.ts
const indexLines = [
  `/**`,
  ` * Supabase Database Types - Main Export`,
  ` * Generated from types_backup/types.ts`,
  ` * Usage: import type { profiles } from './types/core'`,
  ` */`,
  '',
];

// Collect unique base names (without _1, _2 suffixes)
const uniqueNames = new Set();
for (const name of allGeneratedFiles) {
  const base = name.replace(/_\d+$/, '');
  uniqueNames.add(base);
}

for (const name of [...uniqueNames].sort()) {
  indexLines.push(`export * from './${name}'`);
}

writeFileSync(join(OUTPUT_DIR, 'index.ts'), indexLines.join('\n'));
console.log('  ✓ index.ts');

// Update original types.ts with re-export
const stubContent = `/**
 * @deprecated Import from './types' or specific modules instead
 * Example: import type { Database } from './types/core'
 */
export type Database = {
  public: {
    Tables: {
      [key: string]: {
        Row: { [key: string]: Json | undefined }
        Insert: { [key: string]: Json | undefined }
        Update: { [key: string]: Json | undefined }
        Relationships: []
      }
    }
    Functions: {
      [key: string]: { Args: Record<string, unknown>; Returns: unknown }
    }
  }
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined }
`;

writeFileSync(TYPES_FILE, stubContent);

console.log(`\n✅ Done! ${generatedTables} tables in ${Object.keys(GROUPS).length} files`);
console.log(`\nNext steps:`);
console.log(`  1. Update imports in your code`);
console.log(`  2. Run: npx tsc --noEmit`);
console.log(`  3. If OK, delete: rm -rf ${BACKUP_DIR}`);
