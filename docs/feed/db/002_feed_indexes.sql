-- Mansoni Feed v1.1 — Indexes

create index if not exists idx_feed_posts_author_published
  on feed_posts(author_id, published_at desc);

create index if not exists idx_feed_posts_status_published
  on feed_posts(status, published_at desc);

create index if not exists idx_feed_posts_topic_tags_gin
  on feed_posts using gin(topic_tags);

create index if not exists idx_feed_user_author_affinity_user_score
  on feed_user_author_affinity(user_id, affinity_score desc);

create index if not exists idx_feed_user_content_controls_user
  on feed_user_content_controls(user_id);

create index if not exists idx_feed_trust_profiles_subject
  on feed_trust_profiles(subject_type, subject_id);

create index if not exists idx_feed_policy_versions_active
  on feed_policy_versions(surface, is_active);
