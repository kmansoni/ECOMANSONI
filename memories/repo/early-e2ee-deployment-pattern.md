---
name: "early-e2ee-deployment-pattern"
description: "E2EE deployed in multiple iterations with ALLOW gates — proven pattern for safe rollout"
---

# E2EE Deployment Pattern

Извлечён из 7 последовательных коммитов с `[E2EE-ALLOW]`.

## Что сработало

1. **Fail-closed first** (`a3fdf27`): graceful degradation удалена → обязательство, что E2EE всегда включен
2. **ALLOW-gate per commit**: каждый коммит добавлял ровно один `[E2EE-ALLOW]` флаг, а не всё сразу
3. **Deploy metadata separate** (`68a3ade`): build и deploy — разные шаги

## Когда применять

При деплое критической функциональности:
- Fail-closed → ALLOW gates → deploy metadata → фиксы
- Не пытаться деплоить всё сразу
- Каждый gate — отдельный коммит с понятным статусом

## Результат

6 commits, все с `[E2EE-ALLOW]`, ни одного rollback.
