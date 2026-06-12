# Reason Codes Registry (Stable Codes)

Дата: 2026-02-22

Цель: единый справочник стабильных `reason_code` / `error_code` для:
- explainability выдачи,
- модерации,
- anti-abuse enforcement,
- rollouts/rollback,
- UI ошибок/деградаций (D0.000 compatible).

Правила:
- Коды **стабильны**: нельзя переименовывать без маппинга.
- Коды **машиночитаемы**: snake_case.
- Коды имеют область (namespace): `feed.*`, `rank.*`, `event.*`, `mod.*`, `abuse.*`, `rollout.*`, `create.*`, `ads.*`, `svc.*`.

---

## 1) Feed / Read-path (`feed.*`)

- `feed.page_ok` — страница успешно сформирована.
- `feed.cursor_expired` — курсор устарел/нельзя продолжить.
- `feed.fallback_recency` — применён fallback по новизне.
- `feed.fallback_no_freqcap` — применён fallback с ослаблением freq-cap.
- `feed.empty_first_page` — строгий pass вернул 0 на первой странице.

---

## 2) Ranking / Explainability (`rank.*`)

Source pools:
- `rank.source_following`
- `rank.source_interest`
- `rank.source_trending`
- `rank.source_fresh_creator`
- `rank.source_safe_pool`

Boosts:
- `rank.boost_freshness`
- `rank.boost_diversity`
- `rank.trust_weighted` — сигналы/скоринг были trust-weighted (интеграция с trust-lite).

Penalties:
- `rank.penalty_repeat_item`
- `rank.penalty_author_fatigue`
- `rank.penalty_negative_feedback`
- `rank.penalty_safety_reports`
- `rank.penalty_borderline`
- `rank.penalty_controversial`

Guardrails:
- `rank.guardrail_triggered` — конфиг нарушил guardrail.

---

## 3) Events / Integrity (`event.*`)

- `event.dedup_hit` — событие схлопнуто как повтор.
- `event.invalid_sequence` — последовательность невозможна.
- `event.invalid_payload` — некорректный payload.
- `event.offline_replay` — событие пришло из offline очереди.

---

## 4) Create / Upload / Publish (`create.*`)

Validation:
- `create.file_type_not_supported`
- `create.file_size_limit_exceeded`
- `create.duration_limit_exceeded`

Upload:
- `create.upload_network_error`
- `create.upload_permission_denied`
- `create.upload_bucket_missing`
- `create.upload_conflict_object_exists`

Publish:
- `create.publish_conflict_duplicate_intent`
- `create.publish_validation_failed`
- `create.publish_rate_limited`

---

## 5) Moderation (`mod.*`)

Decisions:
- `mod.allow`
- `mod.restrict`
- `mod.needs_review`
- `mod.block`

Queues:
- `mod.queue_escalated_reports`
- `mod.queue_escalated_low_trust`
- `mod.queue_escalated_velocity`
- `mod.queue_deprioritized_low_quality_reporter`

Mass-report guard:
- `mod.mass_report_burst_detected`
- `mod.mass_report_attack_suspected`

Appeals:
- `mod.appeal_submitted`
- `mod.appeal_accepted`
- `mod.appeal_rejected`

---

## 6) Anti-abuse / Enforcement (`abuse.*`)

Trust:
- `abuse.trust_tier_a`
- `abuse.trust_tier_b`
- `abuse.trust_tier_c`
- `abuse.trust_tier_d`

Enforcement levels:
- `abuse.enforce_e0_none`
- `abuse.enforce_e1_soft`
- `abuse.enforce_e2_hard`
- `abuse.enforce_e3_distribution_restricted`
- `abuse.enforce_e4_temp_suspension`
- `abuse.enforce_e5_perm_ban`

Rate limits:
- `abuse.rate_limit_publish`
- `abuse.rate_limit_like`
- `abuse.rate_limit_comment`
- `abuse.rate_limit_report`

Anomalies:
- `abuse.anomaly_velocity`
- `abuse.anomaly_regular_intervals`
- `abuse.anomaly_invalid_events`

---

## 7) Rollouts / Ops (`rollout.*`)

- `rollout.stage_1pct`
- `rollout.stage_10pct`
- `rollout.stage_50pct`
- `rollout.stage_100pct`
- `rollout.rollback_triggered`
- `rollout.rollback_completed`
- `rollout.killswitch_activated`

---

## 8) Ads / Monetization (`ads.*`)

- `ads.placement_cap_hit`
- `ads.frequency_cap_hit`
- `ads.invalid_traffic_detected`
- `ads.brand_safety_blocked`

---

## 9) Services / Conversion (`svc.*`)

- `svc.content_open_service`
- `svc.service_cta_click`
- `svc.service_lead_created`
- `svc.chat_started_from_service`
- `svc.deal_completed`

---

## 10) Change policy

- Добавление новых кодов допускается всегда.
- Удаление/переименование — только с маппингом `old_code -> new_code` и периодом совместимости.
