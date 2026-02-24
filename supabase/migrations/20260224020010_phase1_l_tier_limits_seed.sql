-- Phase 1 EPIC L: Enhanced Rate Limit Configs for Trust Tiers
-- Tier A-D with 6 core actions: create_post, send_message, follow, media_upload, search, api_call

INSERT INTO rate_limit_configs(scope, tier, action, algorithm, limit_value, window_seconds, burst, cost_per_action, enabled)
VALUES 
  -- Tier A (Trusted users): Highest limits
  ('tier', 'A', 'create_post', 'token_bucket', 50, 60, 60, 1, true),
  ('tier', 'A', 'send_message', 'token_bucket', 100, 60, 125, 1, true),
  ('tier', 'A', 'follow', 'token_bucket', 40, 60, 50, 1, true),
  ('tier', 'A', 'media_upload', 'token_bucket', 20, 60, 25, 1, true),
  ('tier', 'A', 'search', 'token_bucket', 300, 60, 360, 1, true),
  ('tier', 'A', 'api_call', 'token_bucket', 500, 60, 600, 1, true),
  
  -- Tier B (Normal users): Standard limits
  ('tier', 'B', 'create_post', 'token_bucket', 20, 60, 30, 1, true),
  ('tier', 'B', 'send_message', 'token_bucket', 60, 60, 80, 1, true),
  ('tier', 'B', 'follow', 'token_bucket', 15, 60, 20, 1, true),
  ('tier', 'B', 'media_upload', 'token_bucket', 5, 60, 8, 1, true),
  ('tier', 'B', 'search', 'token_bucket', 100, 60, 120, 1, true),
  ('tier', 'B', 'api_call', 'token_bucket', 200, 60, 250, 1, true),
  
  -- Tier C (Caution): Reduced limits
  ('tier', 'C', 'create_post', 'token_bucket', 5, 60, 8, 1, true),
  ('tier', 'C', 'send_message', 'token_bucket', 15, 60, 20, 1, true),
  ('tier', 'C', 'follow', 'token_bucket', 3, 60, 5, 1, true),
  ('tier', 'C', 'media_upload', 'token_bucket', 1, 60, 2, 1, true),
  ('tier', 'C', 'search', 'token_bucket', 30, 60, 40, 1, true),
  ('tier', 'C', 'api_call', 'token_bucket', 50, 60, 75, 1, true),
  
  -- Tier D (Restricted): Severe limits
    ('tier', 'D', 'create_post', 'token_bucket', 1, 3600, 1, 1, true),
    ('tier', 'D', 'send_message', 'token_bucket', 1, 3600, 2, 1, true),
    ('tier', 'D', 'follow', 'token_bucket', 1, 1, 1, 1, true),
    ('tier', 'D', 'media_upload', 'token_bucket', 1, 1, 1, 1, true),
    ('tier', 'D', 'search', 'token_bucket', 1, 3600, 2, 1, true),
    ('tier', 'D', 'api_call', 'token_bucket', 2, 3600, 4, 1, true)
ON CONFLICT(scope, tier, action) DO NOTHING;
