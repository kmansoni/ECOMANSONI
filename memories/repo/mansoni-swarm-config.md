---
name: mansoni-swarm-config
description: Конфигурация роя агентов Mansoni — swarm, hive-mind, специалисты
metadata:
  type: project
---

# Mansoni Swarm — Конфигурация

## Swarm
- **ID**: `swarm-1781210382687-mjkprx`
- **Topology**: hierarchical
- **Strategy**: specialized
- **Max Agents**: 20

## Hive-Mind
- **ID**: `hive-1781210403212`
- **Consensus**: raft
- **Queen**: mansoni-queen
- **Workers**: 6

## Агенты

| Agent | Type | Domain | Model | Status |
|-------|------|--------|-------|--------|
| mansoni-queen | orchestrator | orchestration | opus | active |
| mansoni-architect | specialist | architecture | sonnet | idle |
| mansoni-debugger | specialist | debugging | sonnet | idle |
| mansoni-reviewer | specialist | review | sonnet | idle |
| mansoni-security | specialist | security | sonnet | idle |
| mansoni-tester | specialist | testing | sonnet | idle |
| mansoni-performance | specialist | performance | sonnet | idle |
| mansoni-e2ee | specialist | e2ee | sonnet | idle |

## Ролевая модель

- **Mansoni (queen)**: Главный оркестратор с 7 внутренними персонами
  - 🧠 ARCHITECT — архитектура, ADR
  - 💻 ENGINEER — реализация
  - 🔒 SECURITY — OWASP, RLS
  - 🐛 DEBUGGER — root cause
  - 📊 REVIEWER — аудит
  - 🔬 RESEARCHER — исследования
  - ⚡ OPTIMIZER — производительность

- **Specialists**: Подчинённые агенты для узких задач
  - Получают scope от Mansoni
  - Не переопределяют policy и quality gates
  - Возвращают результат в Mansoni для финального вердикта

## Использование

```javascript
// Делегирование задачи
await agent_execute('mansoni-architect', 'Спроектируй новый модуль X...')

//Broadcast queen → workers
await broadcast('Новая задача от пользователя')

//Консенсус для сложных решений
await consensus('propose', {type: 'architecture', value: 'option-a'})
```

**Почему:** Запоминаю конфигурацию swarm для восстановления после перезагрузки сессии.