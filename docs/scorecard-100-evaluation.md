# Scorecard 100 — Evaluation (2026-02-22)

Оцениваем текущий пакет документов:
- [docs/mansoni-platform-implementation-plan-v1.md](docs/mansoni-platform-implementation-plan-v1.md)
- [docs/phase0-core-mvp-execution-plan.md](docs/phase0-core-mvp-execution-plan.md)
- [docs/phase1-pmf-execution-plan.md](docs/phase1-pmf-execution-plan.md)
- [docs/phases-overview-roadmap.md](docs/phases-overview-roadmap.md)
- [docs/master-backlog-phase0-1.md](docs/master-backlog-phase0-1.md)

Шкала: 0 (нет), 1 (частично), 2 (полно). Итог: баллы/100.

---

## Итог
**72/100** → категория `60–74`: рискованный план, нужен рефактор документа для production‑детализации.

Auto-fail check (обязательные условия):
- Won’t-Have по фазам: ✅ есть
- Idempotency + event dedup: ✅ есть
- Fallback при деградации ранкера: ✅ есть
- Moderation SLA + appeal: ✅ есть (частично детализировано)
- Kill-switch механики: ✅ есть (частично детализировано)
- Server-side privacy enforcement: ✅ есть
- Cost shield/экономические лимиты: ✅ есть (на уровне политики)

---

## 1) Scope и фазы — 16 баллов (1–8)
1. 2 — Есть 4–5 фаз с чёткими границами.
2. 2 — Для каждой фазы есть Must-Have.
3. 2 — Для каждой фазы есть Won’t-Have.
4. 1 — DoD по каждой фазе есть, но для Phase 2–4 слишком общо.
5. 2 — Длительность фаз указана.
6. 1 — Зависимости/гейты есть, но нет единой dependency-map между всеми фазами.
7. 2 — Нет “всё сразу”.
8. 1 — Критерии перехода есть, но без численных порогов/целевых значений.

Подытог: 13/16

---

## 2) Техническое ядро — 20 баллов (9–18)
9. 2 — Unified media core + mode flags зафиксированы.
10. 2 — Event integrity (idempotency/dedup/sequence validation) зафиксирована как контракт.
11. 2 — Cursor-пагинация и версионирование описаны как обязательные.
12. 2 — Read-path fallback описан.
13. 2 — Resumable upload + retry + commit модель описана.
14. 2 — Processing SLA (time-to-ready, queue lag) присутствует.
15. 2 — Visibility/block enforcement server-side явно зафиксированы.
16. 2 — Multi-target publish как отдельный слой описан.
17. 2 — Online/nearline/offline сигналы ранжирования описаны.
18. 1 — Failure modes по ядру есть как упоминания/риски, но нет системного каталога (top-N по доменам).

Подытог: 19/20

---

## 3) Ranking и качество выдачи — 14 баллов (19–27)
19. 2 — Candidate generation источники и квоты есть.
20. 1 — Multi-objective scoring обозначен, но не специфицирован как формальная функция целей/весов.
21. 2 — Diversity constraints есть.
22. 2 — Negative feedback propagation есть.
23. 2 — Cold-start стратегия есть.
24. 1 — Anti-feedback-loop меры есть частично (diversity/negative), но нет явного “echo chamber limiter” как отдельного требования.
25. 2 — Explainability (reason codes) есть.
26. 2 — Guardrails + авто-rollback конфигов есть.
27. 2 — Метрики качества ранжирования перечислены.

Подытог (по пунктам 19–27): 16/18

---

## 4) Safety / Anti-Abuse / Moderation — 16 баллов (28–35)
28. 1 — Trust score модель есть, но пока trust-lite без чёткой формулы/уровней.
29. 1 — Rate limits упомянуты, но нет таблицы “действие→лимит→зависимость от trust”.
30. 1 — Bot/fraud/anomaly detection описано базово.
31. 1 — Progressive enforcement упомянут, но нет жёсткой state machine уровней (0–5) и условий перехода.
32. 1 — Appeal flow + SLA есть, но без SLA чисел и без полного жизненного цикла.
33. 1 — Moderation queue architecture упомянута, но не описана как модель очередей + приоритизация по сигналам.
34. 1 — Borderline policy есть, но без формального “что доступно где” (матрица поверхностей).
35. 1 — Mass-report abuse защита упомянута, но без механизмов детекта/реакции.

Подытог: 8/16

---

## 5) Ops / SLO / Надёжность — 14 баллов (36–42)
36. 1 — SLO/SLA перечислены, но без численных целей.
37. 1 — Structured telemetry упомянута (logs/metrics/traces), но нет “минимального набора полей” и схемы.
38. 1 — Alerting категории есть, но пороги не заданы.
39. 1 — Kill-switch список есть, но не полностью разложен по доменам как каталог.
40. 1 — Incident response упомянут, но нет полного цикла P0–P3 + postmortem шаблона.
41. 1 — DR (RTO/RPO) упомянут, но нет конкретного плана тестов/графика.
42. 1 — Cost observability есть на уровне идеи/политики.

Подытог: 7/14

---

## 6) Безопасность / Комплаенс / Governance — 10 баллов (43–47)
43. 1 — Zero-trust принципы описаны, но без конкретного “service auth standard”.
44. 1 — RBAC/SOD упомянуты, но без матрицы ролей и доступов.
45. 1 — Immutable audit trail упомянут, но без требований к хранению/доступу/неизменяемости.
46. 1 — Data governance описано общо (classification/retention), без конкретных политик.
47. 1 — GDPR/data residency упомянуты, без перечня прав субъекта данных и процедур.

Подытог: 5/10

---

## 7) Дизайн-соответствие D0.000 — 10 баллов (48–50)
48. 2 — D0.000 явно non-negotiable.
49. 1 — Design compliance проверка есть на уровне упоминаний/DoD, но нет единого “design compliance checklist” как артефакта для каждого домена.
50. 1 — UX деградации/ошибок в едином стиле описаны частично.

Подытог: 4/10

---

## Главные пробелы (что мешает выйти на 90–100)

1) Multi-objective scoring формализовать
- Нужен явный контракт: цели, веса, ограничения, как конфигурируется.

2) Anti-feedback-loop выделить отдельным блоком
- Явные требования “echo chamber limiter”, controversial amplification guardrail.

3) Safety/Anti-abuse детализация
- Таблицы лимитов, уровни enforcement, чёткие SLA по appeal и очередям.

4) Ops детализация
- Численные SLO/пороги алертов, kill-switch каталог, DR drill schedule.

5) Governance детализация
- RBAC матрица ролей, стандарт service-to-service auth, audit неизменяемость.

6) D0.000 превратить в артефакт
- Один чеклист (компоненты/отступы/модалки/ошибки/safe-area) и требование прикладывать его к каждой Story.
