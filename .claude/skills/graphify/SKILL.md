---
name: mansoni-graphify
description: "Graphify integration for Mansoni — создаёт knowledge graph проекта, ищет связи между компонентами, генерирует отчёты. Использует глобальный graphify."
trigger: /graphify
---

# /graphify

Graphify для проекта Mansoni — превращает код в навигируемый knowledge graph.

## Использование в Mansoni

```
/graphify                          # построить graph для всего проекта
/graphify src/components/chat     # построить graph для папки чата
/graphify --update                # инкрементное обновление
/graphify --mode deep             # глубокий анализ
/graphify --wiki                  # создать wiki
```

## Команды Graphify

```
/graphify query "<вопрос>"        # BFS поиск — найти связи
/graphify query "<вопрос>" --dfs  # DFS — проследить путь
/graphify path "Auth" "Database"  # кратчайший путь между A и B
/graphify explain "useChat"       # объяснить что это и с чем связано
/graphify add <url>              # добавить URL в корпус
```

## Интеграция с Mansoni

Mansoni использует graphify для:

1. **Архитектурный анализ** — понять как модули связаны
2. **Рефакторинг** — найти зависимости перед изменением
3. **Онбординг** — новая фича? → graphify чтобы понять контекст
4. **Debugging** — найти корневую причину через связи

## Graphify Output

После запуска `/graphify`:

```
graphify-out/
├── graph.html          # интерактивный graph
├── graph.json         # raw данные
├── GRAPH_REPORT.md     # отчёт с analysis
└── wiki/              # Obsidian wiki (если --wiki)
```

## Запуск

Graphify установлен глобально. Используй Skill tool для вызова.

```javascript
// PowerShell для локального запуска
$GRAPHIFY_PYTHON = Get-Content graphify-out/.graphify_python
& $GRAPHIFY_PYTHON -m graphify <команда>
```