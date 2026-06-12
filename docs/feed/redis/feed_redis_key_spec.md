# Mansoni Feed v1.1 — Redis Key Specification

## Key Patterns

| Key | TTL | Purpose |
|-----|-----|---------|
| `feed:candidates:{user_id}:{surface}:{policy_version}` | 30–90 sec | Candidate IDs, origins, cheap priors |
| `feed:page:{user_id}:{surface}:{cursor_sig}` | 15–45 sec | Ordered feed item IDs, continuation data |
| `feed:seen:{user_id}` | 7–30 days (rolling) | Recent entity IDs / author frequency |
| `feed:author_budget:{user_id}:{author_id}` | 1–6 hours | Recent author frequency counters |
| `feed:session:{user_id}:{session_id}` | 1–6 hours | Fatigue, shown_by_source, shown_by_type |
| `feed:neg_topics:{user_id}` | Per matrix duration | Suppressed topics |
| `feed:neg_authors:{user_id}` | Per matrix duration | Author penalties / muted authors |
| `feed:feature:user:{user_id}` | 5–15 min | Hot-cached user features |
| `feed:feature:author:{author_id}` | 5–15 min | Hot-cached author features |
| `feed:feature:post:{post_id}` | 5–15 min | Hot-cached content features |

## Stored Payload Examples

### `feed:session:{user_id}:{session_id}`

```json
{
  "shown_by_source": {
    "follow_recent": 4,
    "trusted_discovery": 2
  },
  "shown_by_content_type": {
    "photo": 3,
    "video": 3
  },
  "fatigue_level": 0.23,
  "fast_skip_video_count": 2,
  "negative_topics": ["luxury_cars"],
  "last_updated_at": "2026-03-06T17:00:00Z"
}
```

### `feed:author_budget:{user_id}:{author_id}`

```json
{
  "shown_last_12_slots": 2,
  "shown_last_50_slots": 4
}
```

## Invariants

- **Candidate cache** must be invalidated when policy version changes.
- **Seen set** must use rolling window — not grow unbounded.
- **Session state** must not survive across sessions; TTL = session-bound.
- **Neg-feedback keys** must respect duration from `feed_negative_feedback_matrix.json`.
- **Feature caches** are best-effort; feed must degrade gracefully on cache miss.
