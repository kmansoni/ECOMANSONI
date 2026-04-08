# Mansoni Command Wrappers And Review Stages

- `.claude/commands/` используется как command wrapper layer для bootstrap/finalize workflow над helper-скриптами.
- Для slash/quick workflows добавлены отдельные prompts: `workflow-feature`, `workflow-bug`, `workflow-review`, `workflow-audit`, `review-pass`, `review-risky`, `review-fail`.
- `workflow-context.cjs` теперь поддерживает не только `review-verdict`, но и `review-stage`, чтобы review/audit могли проходить через стадии `review-start -> review-risky -> review-pass|review-fail`.
- История стадий должна храниться в `memories/session/swarm/runtime-context.json`, а не теряться после последней записи verdict.