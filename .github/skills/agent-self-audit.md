# Agent Self-Audit — Выявление слабых мест скиллов и агента

> Источники: AdieLaine/multi-agent-reasoning (self-evaluation), obra/superpowers (self-improving-agent,
> self-eval), alirezarezvani (self-improving-agent), daymade (fact-checker),
> levnikolaevich (multi-agent-validator, codebase-audit-suite)
> Метод: adversarial self-review + gap analysis + improvement loop

---

## ПРОТОКОЛ САМОДИАГНОСТИКИ

Запускается по команде "выяви слабые места" или автоматически раз в 10 задач.

### Фаза 1: ИНВЕНТАРИЗАЦИЯ (что есть)

```
1. Прочитать .github/agents/mansoni.agent.md — возможности агента
2. Прочитать .github/skills/ — все скиллы
3. Прочитать /memories/repo/ — накопленные уроки
4. Составить матрицу: скилл → последнее использование → результат
```

### Фаза 2: GAP ANALYSIS (чего не хватает)

Проверить наличие скиллов по КАЖДОЙ категории:

| Категория | Критичность | Есть? | Gap |
|---|---|---|---|
| Бесшовный контекст | 🔴 | ? | Handoff без потерь |
| Live testing | 🔴 | ? | Реальный браузер в loop |
| Security audit | 🔴 | ? | OWASP 2025 |
| Error recovery | 🔴 | ? | Retry, rollback, reconnect |
| Documentation | 🟡 | ? | Auto-generation |
| Performance | 🟡 | ? | Profiling, bundle |
| Mobile testing | 🟡 | ? | Capacitor-specific |
| i18n | 🟢 | ? | Мультиязычность |
| Payments | 🟢 | ? | Stripe, billing |
| Legal/GDPR | 🟢 | ? | Compliance |

### Фаза 3: ADVERSARIAL TEST (стресс-тест)

Каждая персона атакует агента со своей стороны:

```
🧠 ARCHITECT → "Может ли агент спроектировать микросервис с нуля?"
💻 ENGINEER → "Код проходит tsc strict? Есть any/as?"
🔒 SECURITY → "Агент проверяет RLS на каждой таблице?"
🐛 DEBUGGER → "Может ли воспроизвести баг из stack trace?"
📊 REVIEWER → "Review находит реальные проблемы или rubber-stamps?"
🔬 RESEARCHER → "Исследование даёт новые insights или повторяет известное?"
⚡ OPTIMIZER → "Есть ли N+1 в сгенерированном коде?"
```

### Фаза 4: ИСТОРИЧЕСКИЙ АНАЛИЗ

```
1. Прочитать /memories/repo/ — какие баги повторялись?
2. Паттерны ошибок:
   - Один тип ошибки > 2 раз = системная слабость
   - Файл касается > 3 раз за неделю = проблемная зона
   - Фикс сломал другое = недостаточный review
3. Антипаттерны агента:
   - Создавал дубликаты (файлы/компоненты с похожими именами)
   - Забывал RLS на новых таблицах
   - Не проверял tsc после изменения
   - Сжатие контекста → потеря важного решения
```

### Фаза 5: IMPROVEMENT PLAN

```
1. Ранжировать gaps по критичности
2. Для каждого gap: конкретное действие (создать скилл / обновить правило)
3. Для каждого повторяющегося бага: guard rule в память
4. Timeline: что починить сейчас vs позже
5. Записать план в /memories/session/self-audit-{date}.md
```

---

## ИЗВЕСТНЫЕ СЛАБЫЕ МЕСТА (выявлены в предыдущих сессиях)

### 🔴 Критичные

1. **Потеря контекста при сжатии**
   - Проблема: conversation-summary теряет детали
   - Решение: ICP (Infinite Context Protocol) с автоматическими checkpoints
   - Status: ✅ Скилл создан

2. **Дубликаты файлов/компонентов**
   - Проблема: агент создаёт новый файл вместо обновления существующего
   - Решение: ОБЯЗАТЕЛЬНЫЙ grep_search перед созданием (rule: "ИССЛЕДУЙ перед кодом")
   - Status: ⚠️ Правило есть, но нарушается

3. **Fake success / заглушки**
   - Проблема: toast "Успешно!" без реального действия
   - Решение: stub-hunter скилл + review на fake success
   - Status: ⚠️ Скилл есть, не всегда запускается

### 🟡 Средние

4. **tsc проверка пропускается**
   - Проблема: агент забывает запустить tsc после изменений
   - Решение: Автоматический tsc в протоколе (после КАЖДОГО файла)
   - Status: ⚠️ Правило есть, compliance ~70%

5. **RLS не проверяется на новых таблицах**
   - Проблема: создаётся миграция без RLS
   - Решение: Review-чеклист: "Есть ли ALTER TABLE ... ENABLE ROW LEVEL SECURITY?"
   - Status: ⚠️ Зависит от reviewer

6. **Миграции с ошибками**
   - Проблема: CREATE TABLE IF NOT EXISTS (пропускает), CONCURRENTLY в транзакции
   - Решение: /memories/repo/sql-migration-pitfalls.md — известные ловушки
   - Status: ✅ Документировано

### 🟢 Улучшения

7. **Нет live browser testing**
   - Проблема: код не проверяется визуально
   - Решение: Live Browser Testing скилл
   - Status: ✅ Скилл создан

8. **Документация отстаёт от кода**
   - Проблема: docs/ не обновляется при изменениях
   - Решение: Doc Writer Pro скилл
   - Status: ✅ Скилл создан

9. **Нет mutation testing**
   - Проблема: тесты могут быть слабыми (проходят но не ловят баги)
   - Решение: Stryker integration для критичных модулей
   - Status: 🔜 Планируется

---

## САМООБУЧЕНИЕ (continuous improvement)

```
После КАЖДОЙ задачи:
1. Что пошло не так? → /memories/repo/
2. Какой скилл помог бы? → создать/обновить
3. Какое правило нарушено? → усилить guard
4. Новый паттерн обнаружен? → записать

Цикл: DO → REVIEW → LEARN → IMPROVE → REPEAT
```
