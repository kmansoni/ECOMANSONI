# Mansoni Task Workflow Autoclassifier

- `.claude/settings.json` поддерживает `Task` hooks: `PreToolUse.Task` для авто-классификации workflow и `PostToolUse.Task` для запуска verification без обязательного subagent stop.
- Авто-классификация не должна жить в промптах: источник истины теперь `workflow-context.cjs infer <task description>` + `mansoni-workflows.json` keywords.
- `runtime-context.json` хранит `taskDescription` и `inference.matches`, чтобы было видно, почему workflow был выбран.
- При отсутствии keyword matches classifier обязан безопасно падать в `general`, а не угадывать произвольный workflow.