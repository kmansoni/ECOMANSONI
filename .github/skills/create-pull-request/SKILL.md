---
name: create-pull-request
description: >-
  Создание GitHub PR по конвенциям проекта. Анализ коммитов, branch management,
  gh CLI. Use when: create PR, pull request, submit for review.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/create-pull-request
---

# Create Pull Request

Структурированное создание GitHub PR по конвенциям проекта.

## Prerequisites

1. `gh --version` — если не установлен, `brew install gh` или https://cli.github.com/
2. `gh auth status` — если не авторизован, `gh auth login`
3. `git status` — чистая рабочая директория

## Сбор контекста

```bash
# Текущая ветка
git branch --show-current

# Base branch
git remote show origin | grep "HEAD branch"

# Коммиты относительно main
git log origin/main..HEAD --oneline --no-decorate

# Изменённые файлы
git diff origin/main..HEAD --stat
```

## Информация для PR

1. **Related Issue**: поискать `#123`, `fixes #123`, `closes #123` в коммитах
2. **Description**: какую проблему решает? Почему сделано?
3. **Type of Change**: bug fix, feature, breaking change, refactor, docs
4. **Test Procedure**: как тестировалось?

## Git Best Practices

### Commit Hygiene
- Атомарные коммиты: один коммит = одно логическое изменение
- Conventional commit format: `feat|fix|refactor: описание на русском`
- Без merge коммитов — prefer rebase

### Перед PR
```bash
git fetch origin
git rebase origin/main
git push origin HEAD
```

При force push после rebase:
```bash
git push origin HEAD --force-with-lease
```

## Создание PR

**ВАЖНО**: использовать tmp file для body чтобы избежать проблем с escaping.

```bash
# 1. Записать body во временный файл
# (содержимое формируется по PR template)

# 2. Создать PR
gh pr create --title "feat: описание" --body-file /tmp/pr-body.md --base main

# 3. Очистить
rm /tmp/pr-body.md
```

Для draft:
```bash
gh pr create --title "feat: описание" --body-file /tmp/pr-body.md --base main --draft
```

## Post-Creation

1. Показать URL созданного PR
2. Напомнить про CI checks
3. Предложить:
   - `gh pr edit --add-reviewer USERNAME`
   - `gh pr edit --add-label "bug"`

## Error Handling

| Проблема | Решение |
|---|---|
| No commits ahead of main | Проверить ветку |
| Branch not pushed | `git push -u origin HEAD` |
| PR already exists | `gh pr view`, обновить существующий |
| Merge conflicts | Rebase или resolve conflicts |

## Чеклист

- [ ] gh CLI установлен и авторизован
- [ ] Рабочая директория чистая
- [ ] Все коммиты pushed
- [ ] Branch up-to-date с main
- [ ] Issue number указан
- [ ] Description по шаблону
- [ ] tsc → 0 ошибок
- [ ] lint → 0 warnings
