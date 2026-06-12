# Mansoni Verification Fusion File Context

- `verification-gate.cjs` не должен зависеть только от env-переменных; канонический источник workflow и review verdict должен жить в `memories/session/swarm/runtime-context.json`.
- `workflow-context.cjs workflow <name>` должен сбрасывать `reviewVerdict` в `PENDING`, чтобы новый workflow не наследовал старый итог.
- prompts для `feature`, `bug`, `review`, `audit`, `hardening`, `refactor` должны в начале задавать workflow context, а в конце фиксировать verdict через helper, иначе fusion останется в `RISKY`.
- `post-task` lifecycle должен вызывать verification gate и записывать итоговый fusion verdict в `memories/session/swarm/decisions.md`.