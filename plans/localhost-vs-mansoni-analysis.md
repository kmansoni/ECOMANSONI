# Анализ различий: localhost vs mansoni.ru (production)

## Обзор

Провести комплексный анализ различий между локальной разработкой (localhost) и production-окружением (mansoni.ru).

---

## TODO: Анализ различий

- [ ] **1. Переменные окружения - API Endpoints**
  - [ ] 1.1 Supabase URL и ключи
  - [ ] 1.2 Calls/WebRTC (SFU endpoints)
  - [ ] 1.3 AI API (api.mansoni.ru)
  - [ ] 1.4 Media Server URL
  - [ ] 1.5 Analytics Ingest URL
  - [ ] 1.6 TURN Credentials URL

- [ ] **2. CORS и безопасность**
  - [ ] 2.1 CORS_ALLOWED_ORIGINS
  - [ ] 2.2 ANALYTICS_CORS_ORIGINS
  - [ ] 2.3 SSRF защита (localhost blocking)

- [ ] **3. Dev/Prod условная логика в коде**
  - [ ] 3.1 import.meta.env.DEV проверки
  - [ ] 3.2 Fallback на localhost
  - [ ] 3.3 Логирование

- [ ] **4. Backend сервисы**
  - [ ] 4.1 Email Router (localhost:8090 vs mail.mansoni.ru)
  - [ ] 4.2 Media Server (localhost:3100 vs media.mansoni.ru)
  - [ ] 4.3 Editor API (localhost:3002)
  - [ ] 4.4 Phone Auth (localhost:3001)

- [ ] **5. Базы данных и инфраструктура**
  - [ ] 5.1 Supabase (local vs cloud)
  - [ ] 5.2 PostgreSQL
  - [ ] 5.3 Redis
  - [ ] 5.4 Kafka

- [ ] **6. Сводка критических различий**
  - [ ] 6.1 Создание таблицы различий
  - [ ] 6.2 Выявление потенциальных проблем

---

## Ключевые находки (предварительные)

### Endpoints:
| Сервис | localhost | production |
|--------|-----------|------------|
| Supabase | localhost:54321 | lfkbgnbjxskspsownvjm.supabase.co |
| SFU WebSocket | N/A | sfu-ru.mansoni.ru, sfu-tr.mansoni.ru, sfu-ae.mansoni.ru |
| AI API | localhost | api.mansoni.ru |
| Media | localhost:3100 | media.mansoni.ru |
| Analytics | localhost | analytics.mansoni.ru |
| Email Router | localhost:8090 | mail.mansoni.ru |

### CORS:
- localhost: 5173, 3000, 8080
- production: https://mansoni.ru, https://www.mansoni.ru
