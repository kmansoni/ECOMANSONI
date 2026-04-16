---
name: skill-creator
description: >-
  Руководство по созданию эффективных скиллов для агентов. Понимание → планирование →
  инициализация → написание → упаковка → итерация.
  Use when: создать скилл, update skill, extend agent capabilities, новый workflow.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/skill-creator
---

# Skill Creator

Руководство по созданию эффективных скиллов для агентов.

## О скиллах

Скиллы — модульные, автономные пакеты, расширяющие возможности агента специализированными знаниями, workflows и инструментами. Как "onboarding guide" для конкретных доменов.

### Что дают скиллы

1. **Specialized workflows** — пошаговые процедуры для домена
2. **Tool integrations** — инструкции для форматов/API
3. **Domain expertise** — знания, схемы, бизнес-логика
4. **Bundled resources** — скрипты, ссылки, ассеты

### Анатомия скилла

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name + description — required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/          - Исполняемый код (Python/Bash)
    ├── references/       - Документация для контекста
    └── assets/           - Файлы для output (шаблоны, иконки)
```

### Progressive Disclosure

| Уровень | Что | Когда |
|---------|-----|-------|
| Metadata (name + description) | ~100 слов | Всегда в контексте |
| SKILL.md body | <5k слов | При триггере скилла |
| Bundled resources | Без ограничений | По необходимости |

### SKILL.md

**Качество metadata определяет когда агент активирует скилл.** Description должен чётко описывать ЧТО делает и КОГДА использовать.

### Scripts/
Код для задач с детерминированной надёжностью. Token-efficient, может выполняться без чтения в контекст.

### References/
Документация, схемы, API docs. Загружается по необходимости. Если файлы >10k слов — включить grep patterns в SKILL.md.

### Assets/
Файлы для output: шаблоны, изображения, boilerplate. Не загружаются в контекст.

## Процесс создания

### Шаг 1: Понять скилл

Конкретные примеры использования:
- "Какие кейсы должен покрывать скилл?"
- "Примеры триггеров?"
- Не спрашивать слишком много за раз

### Шаг 2: Планировать ресурсы

Для каждого примера:
1. Как выполнить с нуля?
2. Какие scripts/references/assets полезны при повторном выполнении?

### Шаг 3: Инициализировать

```bash
scripts/init_skill.py <skill-name> --path <output-directory>
```

### Шаг 4: Написать

**Стиль**: imperative form (verb-first), не "you should". 

SKILL.md должен ответить:
1. Назначение скилла (2-3 предложения)
2. Когда использовать
3. Как использовать (со ссылками на ресурсы)

### Шаг 5: Упаковать

```bash
scripts/package_skill.py <path/to/skill-folder>
```

Автоматическая валидация → упаковка в zip.

### Шаг 6: Итерировать

1. Использовать на реальных задачах
2. Заметить проблемы
3. Обновить SKILL.md и ресурсы
4. Повторить
