---
name: meeting-insights-analyzer
description: >-
  Анализ транскриптов встреч: поведенческие паттерны, коммуникационные инсайты,
  избегание конфликтов, filler words, доминирование, активное слушание.
  Use when: анализ встреч, communication patterns, facilitation style, speaking ratio.
metadata:
  category: productivity-organization
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/meeting-insights-analyzer
---

# Meeting Insights Analyzer

Трансформация транскриптов встреч в actionable инсайты о коммуникационных паттернах.

## Когда использовать

- Анализ паттернов коммуникации
- Обратная связь по стилю лидерства
- Определение избегания сложных разговоров
- Привычки речи и filler words
- Отслеживание прогресса коммуникации
- Подготовка к performance review

## Что делает

### 1. Pattern Recognition
- Избегание конфликтов, непрямая коммуникация
- Speaking ratios, turn-taking
- Вопросы vs утверждения
- Активное слушание
- Принятие решений

### 2. Communication Analysis
- Ясность и прямота
- Filler words и hedging
- Тон и сентимент
- Управление встречей

### 3. Actionable Feedback
- Конкретные примеры с таймстампами
- Что произошло → почему важно → как улучшить

### 4. Trend Tracking
- Сравнение паттернов во времени

## Использование

### Базовое
```
Analyze all meetings in this folder and tell me when I avoided conflict.
```

### Расширенное
```
Analyze all transcripts:
1. Когда я перебивал других
2. Мой speaking ratio
3. Моменты прямого фидбэка
4. Filler words
5. Примеры хорошего активного слушания
```

## Инструкции

### 1. Обнаружить данные
- Сканировать папку на транскрипты (.txt, .md, .vtt, .srt)
- Проверить speaker labels и timestamps

### 2. Уточнить цели
- Конкретные паттерны (конфликты, interruptions, fillers)
- Эффективность коммуникации
- Фасилитация

### 3. Анализировать

**Conflict Avoidance**: hedging ("maybe", "kind of"), непрямые просьбы, смена темы при напряжении.

**Speaking Ratios**: % времени, interruptions, длина turn.

**Filler Words**: "um", "uh", "like", "you know" — частота / мин.

**Active Listening**: вопросы по предыдущим пунктам, парафраз, развитие чужих идей.

**Leadership**: directive vs collaborative, хэндлинг разногласий, вовлечение тихих участников.

### 4. Примеры

```markdown
### Hedging on Critical Feedback
**Frequency**: 8 раз в 7 встречах

**Пример — 1:1 с Sarah** — 00:14:32
> "So, I was thinking... maybe we could, like, potentially 
> consider looking at the timeline again?"

**Почему важно**: Hedging ("maybe", "potentially") и deflection делают 
сообщение легко игнорируемым.

**Лучше**: "Sarah, проект отстаёт на 2 недели. Нужно обсудить блокеры 
и составить новый timeline сегодня."
```

### 5. Синтез

```markdown
# Meeting Insights Summary

## Key Patterns Identified
### 1. [Pattern] — Impact — Recommendation

## Communication Strengths
1. [Сильная сторона + пример]

## Growth Opportunities
1. [Область + конкретный совет]

## Speaking Statistics
- Average speaking time: X%
- Questions asked: X per meeting
- Filler words: X per minute
- Interruptions: X given / Y received

## Next Steps
1-5 конкретных действий
```

## Источники транскриптов

- **Zoom**: Cloud recording + transcription → VTT/SRT
- **Google Meet**: Docs auto-transcription → .txt
- **Fireflies.ai / Otter.ai**: Export в bulk

## Best Practices

1. Именование: `YYYY-MM-DD - Meeting Name.txt`
2. Анализ ежемесячно/ежеквартально
3. Один паттерн за раз для глубины
4. Конфиденциальность — данные локально
