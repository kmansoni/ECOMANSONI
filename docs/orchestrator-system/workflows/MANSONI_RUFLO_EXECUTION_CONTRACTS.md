# Mansoni Ruflo Execution Contracts

> Канонические workflow-контракты для runtime слоя Ruflo внутри режима Mansoni.

---

## 1. Зачем нужны execution contracts

До этого этапа workflow существовали в проекте в трёх разных формах:

- как текстовые инструкции в [CLAUDE.md](../../CLAUDE.md)
- как skills/pipelines в `.github/skills`
- как prompt shortcuts в `.github/prompts`

Этого достаточно для описания поведения, но недостаточно для runtime-связки.

Execution contract нужен для того, чтобы один и тот же канон одновременно существовал:

- в документации
- в prompt-слое
- в hooks/runtime lifecycle
- в verification gate
- в command wrappers и slash bootstrap/finalize командах

---

## 2. Канон

В проекте действуют четыре основных workflow:

| Workflow | Назначение | Topology | Pipeline |
|---|---|---|---|
| `feature` | новая функциональность | `hierarchical` | researcher → architect → coder → reviewer → tester |
| `bug` | исправление бага | `hierarchical` | debugger → coder → reviewer |
| `security` | hardening / security fix | `star` | security-engineer → reviewer-security → coder |
| `audit` | глубокий аудит | `mesh` | inventory → parallel-review → synthesis |

Fallback workflow: `general`.

Источником истины для runtime-слоя является [/.claude/contracts/mansoni-workflows.json](../../../.claude/contracts/mansoni-workflows.json).

---

## 3. Lifecycle binding

### 3.1 Hooks

Hooks не должны быть только “логами вокруг команд”. Для гибрида Mansoni+Ruflo они выполняют три функции:

1. Создают и поддерживают `mansoni-swarm` session state.
2. Импортируют verified repo memory в рабочий session context.
3. Автоматически выводят workflow из `Task` description и пишут его в runtime context.
4. На этапе `post-task` обновляют verification fusion gate.
5. На этапе `post-bash` могут автоматически фиксировать evidence для распознаваемых verification-команд.

Связанные файлы:

- [/.claude/helpers/hook-handler.cjs](../../../.claude/helpers/hook-handler.cjs)
- [/.claude/helpers/auto-memory-hook.mjs](../../../.claude/helpers/auto-memory-hook.mjs)
- [/.claude/helpers/verification-gate.cjs](../../../.claude/helpers/verification-gate.cjs)

### 3.2 Verification fusion

Verification fusion объединяет:

- structural/runtime checks Ruflo
- semantic/project review gate Mansoni
- evidence gate: подтверждения того, что claim о PASS подкреплён реальным фактом

Файл результата:

- [memories/session/swarm/verification.md](../../../memories/session/swarm/verification.md)

Базовая логика:

- Ruflo даёт structural score готовности runtime lifecycle
- Mansoni даёт semantic verdict `PASS`, `RISKY`, `FAIL`
- evidence layer подтверждает `tsc`, `review`, `manual`, `tests` и другие доказательства
- финальный verdict вычисляется как объединение трёх слоёв

### 3.3 Runtime Context and Intermediate Verdicts

Теперь workflow и verdict живут в file-based runtime context:

- [/.claude/helpers/workflow-context.cjs](../../../.claude/helpers/workflow-context.cjs)
- [memories/session/swarm/runtime-context.json](../../../memories/session/swarm/runtime-context.json)

Поддерживаются два уровня записи:

- `workflow <name>` — выбирает активный workflow
- `infer <task description>` — автоматически определяет workflow по описанию задачи
- `review-stage <stage>` — пишет промежуточную или финальную стадию review/audit цикла
- `evidence <kind> <summary>` — записывает подтверждение для verification fusion

Нормализованные стадии:

- `review-start`
- `review-pass`
- `review-risky`
- `review-fail`

Это позволяет многошаговому review не терять эволюцию verdict между итерациями.

Дополнительно `Task` hooks теперь могут автоматически запускать inference без prompt-wrapper, если runtime передаёт `tool.params.task`.

Если task description явно содержит semantic verdict (`pass`, `risky`, `fail`, `accept`, `reject`, `unsafe` и русские эквиваленты), runtime helper сам пишет `reviewVerdict` в context. Для review/audit wrapper-задач это снимает зависимость от ручного вызова `review-verdict`.

Если PASS заявлен без требуемого evidence для текущего workflow, verification gate обязан опустить итог как минимум до `RISKY`.

Для распознаваемых bash-команд (`tsc`, `lint`, `vitest`, `playwright`) hook layer может автоматически записывать evidence в runtime context без ручной команды.

---

## 4. Contract storage

Contracts хранятся в одном месте:

- [/.claude/contracts/mansoni-workflows.json](../../../.claude/contracts/mansoni-workflows.json)

Это минимальный runtime registry, который сейчас используется helpers.

Дальнейшее развитие:

- добавить truth-score ingestion из Ruflo/claude-flow CLI
- добавить retry/escalation policy per workflow
- добавить classifier поверх history/intent, а не только keyword matching

---

## 5. Практический смысл

После введения execution contracts workflow перестаёт быть просто “текстом в промпте”.

Теперь:

- prompts маршрутизируют задачу в `mansoni`
- `mansoni` остаётся каноническим entrypoint
- hooks поддерживают `mansoni-swarm`
- `Task` lifecycle может сам выставить workflow context даже без ручного bootstrap
- `Task` lifecycle может сам зафиксировать explicit semantic verdict из формулировки wrapper-задачи
- slash/command wrappers умеют делать bootstrap и finalize без ручного вспоминания helper-команд
- post-task lifecycle обновляет verification gate
- runtime и docs больше не расходятся по типовым сценариям
