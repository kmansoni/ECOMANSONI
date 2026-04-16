---
name: skill-share
description: >-
  Создание и распространение агентских скиллов с автоматическим уведомлением в Slack.
  Use when: create skill, share skill, distribute skill, team notification.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/skill-share
---

# Skill Share

Создание и распространение агентских скиллов с уведомлениями команды.

## Когда использовать

- Создание новых скиллов с правильной структурой
- Генерация skill packages для распространения
- Автоматическое уведомление в Slack
- Валидация структуры скилла
- Пайплайн разработки скиллов

## Key Features

### 1. Создание скилла
- Правильная структура: SKILL.md + scripts/ + references/ + assets/
- YAML frontmatter с metadata
- Конвенции именования (hyphen-case)

### 2. Валидация
- Формат SKILL.md и required fields
- Naming conventions
- Полнота metadata

### 3. Упаковка
- Distributable zip файлы
- Все ассеты и документация
- Автоматическая валидация перед упаковкой

### 4. Slack Integration (через Rube)
- Отправка информации о скилле в каналы
- Метаданные: имя, описание, ссылка
- Прямые ссылки на файлы

## Workflow

1. **Инициализация** — имя + описание
2. **Создание** — директория с правильной структурой
3. **Валидация** — проверка корректности metadata
4. **Упаковка** — distributable zip
5. **Уведомление** — Slack-канал команды

## Пример

```
Создание скилла "pdf-analyzer":
1. Создать /skill-pdf-analyzer/ с SKILL.md template
2. Сгенерировать scripts/, references/, assets/
3. Валидировать структуру
4. Упаковать в zip
5. Уведомить Slack: "New Skill: pdf-analyzer — PDF analysis and extraction"
```

## Requirements

- Slack workspace (для уведомлений)
- Write access к директории скиллов
- Python 3.7+ для скриптов
