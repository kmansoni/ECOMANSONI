/**
 * @file src/types/feed/feed_policy_types.ts
 * @description Типы политик и бюджетов ленты Mansoni Feed v1.1.
 */

export interface WindowBudget {
  min_social?: number;
  max_discovery?: number;
  max_creator?: number;
  max_utility?: number;
  max_business?: number;
  max_sponsored?: number;
}

export interface RollingBudget {
  max_same_author?: number;
  max_same_topic?: number;
  max_video?: number;
  max_business_cards?: number;
  max_utility?: number;
  max_business?: number;
  max_sponsored?: number;
  min_unique_authors?: number;
}

export interface FeedPolicyBudgetMatrix {
  policy_version: string;
  surface: "home_feed";
  windows: {
    first_5: WindowBudget;
    first_10: WindowBudget;
    rolling_12: RollingBudget;
    rolling_20: RollingBudget;
  };
  caps: {
    video_fast_skip_trigger: number;
    video_budget_after_fast_skip: number;
    discovery_fatigue_trigger: number;
    business_density_trigger: number;
    same_author_hard_block_after: number;
  };
  recovery_rules: {
    after_high_activation_run_insert_social: boolean;
    after_business_cluster_insert_social: boolean;
    after_discovery_fatigue_bias_to_followed: boolean;
  };
  eligibility_hard_rules: string[];
}

export interface SessionState {
  shown_by_source: Record<string, number>;
  shown_by_content_type: Record<string, number>;
  fatigue_level: number;
  fast_skip_video_count: number;
  negative_topics: string[];
  last_updated_at: string;
}
