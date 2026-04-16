---
name: file-organizer
description: >-
  Организация файлов и папок: анализ структуры, дубликаты, предложения,
  автоматическая очистка. Use when: organize files, cleanup, duplicates, folder structure.
metadata:
  category: productivity-organization
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/file-organizer
---

# File Organizer

Организация файлов и папок в проекте.

## Когда использовать

- Хаотичная структура папок
- Дубликаты файлов
- Структура не имеет смысла
- Подготовка к архивации
- Организация нового проекта

## Что делает

1. **Анализ**: обзор папок и файлов
2. **Дубликаты**: поиск дублей по hash и имени
3. **Предложения**: логичные folder structures
4. **Автоматизация**: перемещение, переименование с подтверждением
5. **Контекст**: решения на основе типов файлов, дат, содержимого

## Процесс

### 1. Понять scope

- Какая директория?
- Основная проблема? (не найти файлы, дубли, бардак)
- Что НЕ трогать? (active projects, sensitive data)
- Агрессивность? (conservative vs comprehensive)

### 2. Анализ текущего состояния

```bash
# Обзор
ls -la [target]

# Типы файлов
find [target] -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn

# Крупные файлы
du -sh [target]/* | sort -rh | head -20
```

### 3. Поиск дубликатов

```bash
# Точные дубли по hash
find [dir] -type f -exec md5sum {} \; | sort | uniq -d

# Одинаковые имена
find [dir] -type f -printf '%f\n' | sort | uniq -d
```

### 4. Plan организации

```markdown
# Organization Plan для [Directory]

## Текущее состояние
- X файлов, Y папок, размер Z

## Предложенная структура
```
Directory/
├── Active/
├── Archive/
└── Templates/
```

## Изменения
1. Создать папки: [list]
2. Переместить файлы: [details]
3. Переименовать: [patterns]
4. Удалить: [duplicates]

## Файлы требующие решения
- [неясные случаи]
```

### 5. Выполнение

```bash
mkdir -p "path/to/new/folders"
mv "old/path/file" "new/path/file"
```

**Правила:**
- ВСЕГДА подтверждение перед удалением
- Логировать все перемещения
- Сохранять modification dates
- Обработка конфликтов имён
- Стоп при неожиданных ситуациях

### 6. Отчёт

```markdown
# Организация завершена

## Изменения
- Создано [X] папок
- Организовано [Y] файлов
- Освобождено [Z] от дубликатов

## Обслуживание
1. Еженедельно: сортировать новые файлы
2. Ежемесячно: review и архивация
3. Ежеквартально: проверка дубликатов
```

## Best Practices

### Именование папок
- Ясные, описательные имена
- Без пробелов (hyphens или underscores)
- Конкретно: `client-proposals` НЕ `docs`
- Префиксы для порядка: `01-current`, `02-archive`

### Именование файлов
- Даты: `2026-04-15-meeting-notes.md`
- Описательно: `q1-financial-report.xlsx`
- Без version numbers в именах (git вместо)

### Когда архивировать
- Проекты не тронутые 6+ месяцев
- Завершённая работа для reference
- Старые версии после миграции
