---
name: changelog-generator
description: >-
  Генерация user-facing changelog из git коммитов. Анализ истории, категоризация,
  перевод технических коммитов в понятные пользователю заметки.
  Use when: release notes, changelog, обновления, app store, product updates.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/changelog-generator
---

# Changelog Generator

Превращение технических git коммитов в понятные user-facing changelogs.

## Когда использовать

- Подготовка release notes для новой версии
- Создание еженедельных product update
- Документирование изменений для пользователей
- App store submission описания
- Генерация update notifications
- Поддержка публичного changelog

## Что делает

1. **Сканирует Git History**: коммиты за период или между версиями
2. **Категоризирует**: features, improvements, bug fixes, breaking changes, security
3. **Переводит Technical → User-Friendly**: язык разработчика → язык пользователя
4. **Форматирует**: чистые структурированные changelog entries
5. **Фильтрует шум**: исключает internal коммиты (refactoring, tests, ci)
6. **Следует Best Practices**: changelog guidelines + brand voice

## Использование

```bash
# Базовый
git log origin/main..HEAD --oneline --no-decorate

# За период
git log --after="2026-04-01" --before="2026-04-15" --oneline

# Между версиями
git log v2.4.0..v2.5.0 --oneline
```

## Формат вывода

```markdown
# Обновления — Неделя 10 апреля 2026

## ✨ Новые возможности

- **Рабочие пространства команд**: создавайте отдельные пространства
  для разных проектов. Приглашайте участников.

- **Горячие клавиши**: нажмите ? для списка клавиш.

## 🔧 Улучшения

- **Быстрая синхронизация**: файлы синхронизируются 2x быстрее
- **Поиск**: теперь включает содержимое файлов

## 🐛 Исправления

- Исправлена загрузка больших изображений
- Корректное отображение часовых поясов
- Верный счётчик уведомлений

## 🔒 Безопасность

- Обновлены зависимости с известными уязвимостями
```

## Правила категоризации

| Префикс коммита | Категория |
|---|---|
| `feat:` | ✨ Новые возможности |
| `fix:` | 🐛 Исправления |
| `perf:` | ⚡ Производительность |
| `security:` | 🔒 Безопасность |
| `refactor:`, `test:`, `ci:`, `chore:` | Пропустить (internal) |
| `BREAKING CHANGE` | ⚠️ Breaking Changes |

## Советы

- Запускать из корня git репозитория
- Указывать диапазон дат для фокусированного changelog
- Использовать CHANGELOG.md для постоянного ведения
- Review перед публикацией
- Язык пользователя, НЕ разработчика
