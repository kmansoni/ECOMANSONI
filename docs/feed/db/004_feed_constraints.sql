-- Mansoni Feed v1.1 — CHECK constraints

alter table feed_user_preferences
  add constraint chk_feed_user_preferences_weights_nonnegative
  check (
    social_weight >= 0 and
    discovery_weight >= 0 and
    utility_weight >= 0 and
    creator_weight >= 0 and
    business_weight >= 0
  );

alter table feed_trust_profiles
  add constraint chk_feed_trust_profiles_risk_tier
  check (risk_tier in ('A', 'B', 'C', 'D'));

alter table feed_posts
  add constraint chk_feed_posts_status
  check (status in ('draft', 'published', 'hidden', 'deleted', 'review'));

alter table feed_posts
  add constraint chk_feed_posts_content_type
  check (content_type in ('photo', 'video', 'carousel', 'text', 'business_card', 'event_card', 'reel_card'));
