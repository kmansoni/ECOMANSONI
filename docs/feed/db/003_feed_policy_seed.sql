-- Mansoni Feed v1.1 — Initial policy seed

insert into feed_policy_versions(policy_version, surface, config, is_active)
values (
  'feed_home_v1.1.0',
  'home_feed',
  '{
    "windows": {
      "first_5": { "min_social": 3, "max_discovery": 1, "max_creator": 2, "max_utility": 0, "max_business": 0, "max_sponsored": 0 },
      "first_10": { "min_social": 5, "max_discovery": 3, "max_creator": 4, "max_utility": 1, "max_business": 1, "max_sponsored": 1 },
      "rolling_12": { "max_same_author": 2, "max_same_topic": 3, "max_video": 4, "max_business_cards": 1, "min_unique_authors": 6 },
      "rolling_20": { "max_same_author": 3, "max_same_topic": 4, "max_utility": 2, "max_business": 2, "max_sponsored": 2, "min_unique_authors": 10 }
    },
    "caps": {
      "video_fast_skip_trigger": 3,
      "video_budget_after_fast_skip": 2,
      "discovery_fatigue_trigger": 4,
      "business_density_trigger": 2,
      "same_author_hard_block_after": 3
    },
    "recovery_rules": {
      "after_high_activation_run_insert_social": true,
      "after_business_cluster_insert_social": true,
      "after_discovery_fatigue_bias_to_followed": true
    }
  }'::jsonb,
  true
)
on conflict (policy_version) do nothing;
