# Mansoni Unique Agent Functions Integrated

- Из внешнего `code-skeptic` в Mansoni перенесён evidence gate: PASS теперь зависит не только от verdict, но и от подтверждений в `runtime-context.json`.
- Из внешнего `code-simplifier` перенесён контракт сохранения public API, side effects ordering и error behavior для refactor workflow.
- Из внешнего `code-custom` перенесены security-пункты: trust boundaries, replay/idempotency, race conditions, rollback safety, observability.
- Из `docs-specialist`, `frontend-specialist` и `test-engineer` перенесены doc QA pass, semantic HTML pass и test quality rules для readable assertions и обязательных error paths.