---
name: penetration-test-reporter
description: "Формирование отчёта по результатам пентеста: executive summary, severity distribution, findings по OWASP, remediation roadmap. Use when: пентест отчёт, результаты security audit, оформить находки, vulnerability report."
argument-hint: "[список находок или файл с результатами]"
user-invocable: true
---

# Penetration Test Reporter — Отчёт по безопасности

Структурированный формат отчёта для команды разработки и руководства.

---

## Шаблон отчёта

```markdown
# Отчёт по безопасности: [Название проекта]
**Дата**: [дата]
**Версия**: [версия приложения]
**Тестировал**: [агент/специалист]
**Scope**: [что тестировалось]

---

## Executive Summary

| Показатель | Значение |
|---|---|
| Критических уязвимостей | N |
| Высокий риск | N |
| Средний риск | N |
| Низкий риск | N |
| Информационных | N |
| Общая оценка безопасности | [A-F] |

**Вердикт**: [PASS / CONDITIONAL PASS / FAIL]

Краткое описание (2-3 абзаца для нетехнической аудитории).

---

## Методология

- OWASP Testing Guide v4.2
- OWASP Top 10:2025
- Специфика: React SPA + Supabase Backend + WebRTC

**Инструменты**:
- grep/bash (статический анализ кода)
- curl (API тестирование)
- Browser DevTools (WebSocket, Storage)
- Supabase SQL Editor (RLS проверка)

---

## Находки

### [CRIT-001] Критическая уязвимость — [название]

**Серьёзность**: 🔴 CRITICAL
**Категория**: OWASP A01: Broken Access Control
**CVSS Score**: 9.8 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
**Файл/Endpoint**: `supabase/functions/send-message/index.ts`

**Описание**:
[Техническое описание уязвимости]

**Шаги воспроизведения**:
```bash
curl -X POST .../send-message \
  -H "Authorization: Bearer USER_TOKEN" \
  -d '{"channel_id":"ДРУГОЙ_CANNEL"}' 
```

**Ожидалось**: 403 Forbidden
**Получено**: 200 OK, сообщение отправлено

**Рекомендация**:
[Конкретный fix с кодом если возможно]

**Статус**: 🔴 Открыта | 🟡 В работе | 🟢 Исправлена

---

### [HIGH-001] Высокий риск — [название]

**Серьёзность**: 🟠 HIGH
**Категория**: OWASP A07: Authentication Failures
...

---

### [MED-001] Средний риск — [название]

**Серьёзность**: 🟡 MEDIUM
**Категория**: OWASP A05: Security Misconfiguration
...

---

## Положительные стороны

- ✅ [что сделано правильно]
- ✅ [что сделано правильно]

---

## Дорожная карта исправлений

| Приоритет | Находки | Срок | Ответственный |
|---|---|---|---|
| P0 (немедленно) | CRIT-001, CRIT-002 | 24ч | Backend |
| P1 (эта неделя) | HIGH-001, HIGH-002 | 7д | Backend + Frontend |
| P2 (этот спринт) | MED-001 — MED-003 | 14д | Frontend |
| P3 (следующий спринт) | LOW-001 — LOW-005 | 30д | Любой |

---

## Следующий аудит

Рекомендуется провести повторное тестирование через [N дней] после исправления P0/P1 находок.
```

---

## Severity Scoring Guide

| Уровень | CVSS | Критерий | Срок исправления |
|---|---|---|---|
| 🔴 CRITICAL | 9.0-10.0 | RCE, полная потеря данных, auth bypass | 24 часа |
| 🟠 HIGH | 7.0-8.9 | IDOR, эскалация привилегий, XSS с кражей данных | 7 дней |
| 🟡 MEDIUM | 4.0-6.9 | Утечка metadata, пропущенные headers, rate limit absent | 30 дней |
| 🟢 LOW | 0.1-3.9 | Информационная утечка, verbose errors | Следующий цикл |
| ℹ️ INFO | N/A | Улучшения без риска | По возможности |

---

## Автоматизация отчёта

```typescript
// Генератор markdown отчёта из JSON findings
interface Finding {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  file?: string;
  steps: string[];
  recommendation: string;
  status: 'open' | 'in-progress' | 'fixed';
}

function generateReport(findings: Finding[], projectName: string): string {
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const high = findings.filter(f => f.severity === 'HIGH');

  const verdict = critical.length > 0 ? 'FAIL'
    : high.length > 2 ? 'CONDITIONAL PASS'
    : 'PASS';

  return `# Отчёт по безопасности: ${projectName}
Дата: ${new Date().toISOString().split('T')[0]}
Вердикт: ${verdict}
Критических: ${critical.length} | Высоких: ${high.length}
...`;
}
```
