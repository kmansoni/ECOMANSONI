# P3D — GDPR/DSAR + Data Residency Playbook

Дата: 2026-02-22

Цель: сделать комплаенс исполнимым процессом, а не декларацией.

---

## 1) DSAR запросы (Data Subject Access Requests)

Типы:
- DSAR-EXPORT: экспорт данных
- DSAR-DELETE: удаление данных

Сроки (baseline):
- экспорт: ≤ 30 дней
- удаление: ≤ 30 дней (с исключениями по закону)

---

## 2) Экспорт данных (DSAR-EXPORT)

Что включать:
- профиль (public.profiles)
- контент (reels/stories/posts + publish objects)
- события (в пределах retention)
- сообщения: только где разрешено политиками

Формат:
- архив (JSON/CSV + манифест)

Аудит:
- кто запросил
- кто исполнил
- когда

---

## 3) Удаление (DSAR-DELETE)

Правило:
- удаление делится на:
  - hard delete (PII)
  - soft delete/retention (финансовые/юридические требования)

Процесс:
1) верификация личности
2) постановка в очередь
3) удаление/анонимизация
4) подтверждение

---

## 4) Data residency

Решение baseline:
- PII хранится в primary region
- публичный контент может кешироваться в CDN
- multi-region read-path не должен кэшировать данные, нарушающие residency

---

## 5) Acceptance

Готово если:
- DSAR-EXPORT/DELETE процессы описаны и аудируются
- сроки определены
- residency правила заданы
- есть kill-switch "pause DSAR" (на случай инцидента)
