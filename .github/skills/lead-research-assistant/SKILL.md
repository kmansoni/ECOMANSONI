---
name: lead-research-assistant
description: >-
  Идентификация и квалификация лидов: ICP matching, скоринг, контактные стратегии,
  анализ компании, поиск BOFU лидов. Use when: лиды, ICP, квалификация, lead scoring,
  контактная стратегия, outbound, sales research.
metadata:
  category: business-sales
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/lead-research-assistant
---

# Lead Research Assistant

Исследование и квалификация лидов для B2B продаж.

## Когда использовать

- Поиск и квалификация потенциальных клиентов
- Оценка ICP (Ideal Customer Profile) match
- Разработка outbound стратегий
- Анализ компании перед контактом
- Скоринг лидов

## Capabilities

### 1. ICP Matching
- Размер компании, индустрия, география
- Tech stack (BuiltWith, Wappalyzer)
- Стадия роста (найм, фандинг, выручка)
- Совпадение по use case

### 2. Lead Scoring
```
BOFU (Bottom of Funnel) — готов к покупке:
- Ищет альтернативы конкуренту      (+30)
- Негативный отзыв о текущем решении (+25)
- Активный найм на целевую роль       (+20)
- Недавний фандинг                     (+15)

MOFU (Middle of Funnel) — изучает:
- Посещает релевантные мероприятия     (+10)
- Публикует о проблеме                (+10)
- Подписан на конкурентов              (+5)
```

### 3. Company Analysis
- Business model
- Revenue estimate
- Competitive landscape
- Decision makers
- Pain points

### 4. Contact Strategy
- Персонализация на основе исследования
- Timing recommendations
- Channel selection (email, LinkedIn, Twitter)
- Icebreaker suggestions

## Workflows

### Полное исследование лида
```
1. Company overview (размер, индустрия)  
2. Decision makers + org chart  
3. Tech stack analysis  
4. Recent news / triggers  
5. Pain point mapping  
6. ICP score (0-100)  
7. Outreach strategy
```

### Batch qualification
```
1. Список из 50 компаний  
2. ICP scoring каждой  
3. Ранжирование по приоритету  
4. Top 10 с полным анализом  
5. Персонализированные стратегии контакта
```

### Competitive displacement
```
1. Найти пользователей конкурента  
2. Негативные сигналы (churn, жалобы)  
3. Оценить timing для контакта  
4. Switch messaging strategy
```

## Output Format

### Lead Card
```markdown
## [Company Name]
**ICP Score**: 85/100
**Стадия**: BOFU — активно ищет решение
**Размер**: 50-200 чел, Series B
**Стек**: React, PostgreSQL, AWS                  
**Trigger**: Нанимает DevOps engineer
**Pain**: Текущий чат тормозит на 1000+ юзеров     
**Decision Maker**: CTO — @name (LinkedIn)
**Strategy**: Показать кейс со скоростью
**Icebreaker**: Ваш пост про WebSocket проблемы...
```

## Best Practices

✓ Только публичная информация
✓ Уважай GDPR/ФЗ-152
✓ Не спами — quality over quantity
✓ Обновляй данные регулярно
✓ Документируй источники
✗ Не покупай скрейпленные базы
✗ Не автоматизируй массовые контакты без согласия
