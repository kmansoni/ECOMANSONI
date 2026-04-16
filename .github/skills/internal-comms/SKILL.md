---
name: internal-comms
description: >-
  Написание внутренних коммуникаций: статус-отчёты, 3P updates, рассылки, FAQ, инцидент-отчёты.
  Use when: internal comms, status report, leadership update, newsletter, FAQ, incident report.
metadata:
  category: communication-writing
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/internal-comms
---

# Internal Comms

Ресурсы для написания внутренних коммуникаций компании.

## Когда использовать

- 3P updates (Progress, Plans, Problems)
- Рассылки компании (newsletter)
- FAQ ответы
- Статус-отчёты
- Updates для руководства
- Обновления проектов
- Инцидент-отчёты

## Как использовать

1. Определить тип коммуникации из запроса
2. Загрузить подходящий guideline:
   - `examples/3p-updates.md` — Progress/Plans/Problems
   - `examples/company-newsletter.md` — Рассылки
   - `examples/faq-answers.md` — FAQ
   - `examples/general-comms.md` — Всё остальное
3. Следовать инструкциям файла по формату, тону и контенту

Если тип не совпадает ни с одним гайдлайном — уточнить контекст.

## Шаблоны

### 3P Update
```markdown
## Progress (что сделано)
- [достижение 1]
- [достижение 2]

## Plans (что планируется)
- [план 1]
- [план 2]

## Problems (блокеры)
- [проблема 1] → [предложение решения]
```

### Incident Report
```markdown
## Инцидент: [название]
**Время**: [начало] — [конец]
**Severity**: [P0/P1/P2]
**Impact**: [что затронуто]

### Timeline
- HH:MM — [событие]

### Root Cause
[описание]

### Resolution
[что сделали]

### Action Items
- [ ] [action 1] — @owner — deadline
```

## Keywords

3P updates, company newsletter, weekly update, FAQs, status report, internal comms
