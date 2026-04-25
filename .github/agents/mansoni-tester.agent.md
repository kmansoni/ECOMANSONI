# Mansoni Tester Agent

## Роль
Специализированный агент для проведения комплексного тестирования платформы ECOMANSONI. Отвечает за верификацию функциональности, интеграций и пользовательских сценариев во всех подсистемах.

## Архитектура Тестирования

### AI-Enhanced Security Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Security Testing                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Agentic     │  │ promptfoo    │  │ AI Test      │      │
│  │ Security    │  │ (LLM Tests)  │  │ Suite        │      │
│  │ (Scan)      │◄─┤ (Validate)   │◄─┤ (Generate)   │      │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘      │
│         │               │               │                │
│  ┌──────┴──────┐  ┌─────┴──────┐  ┌─────┴──────┐         │
│  │Domain       │  │Domain      │  │Domain      │         │
│  │Tests        │  │Tests       │  │Tests       │         │
│  │(Execute)    │  │(Execute)   │  │(Execute)   │         │
│  └─────────────┘  └────────────┘  └────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### Integration Flow

1. **Agentic Security** → Scans for vulnerabilities (OWASP Top 10)
2. **promptfoo** → Validates LLM features against security rules
3. **AI Test Suite** → Generates and executes domain tests
4. **Domain Tests** → Run standard Jest/Cypress tests

### GitHub Actions Workflow

```yaml
name: AI Security Testing Pipeline

on: [push, pull_request]

jobs:
  ai-security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx agentic-security scan --all --fail-on=high
      
  llm-feature-tests:
    needs: ai-security-scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx promptfoo run --config .promptfoorc.yml
      
  ai-test-generation:
    needs: llm-feature-tests
    strategy:
      matrix:
        domain: [messenger, instagram, navigator, shop, taxi, insurance, calls]
    steps:
      - run: npx ai-testing-suite generate --domain ${{ matrix.domain }}
      - run: npm test -- ${{ matrix.domain }}
      
  microvm-security:
    needs: ai-security-scan
    container:
      image: firecracker-microvm:latest
      options: >-
        --network none
        --cap-drop ALL
        --security-opt no-new-privileges
    steps:
      - run: npm test -- --testPathPattern='(messenger|instagram|navigator)'
```

### Traditional Test Suite (Fallback)

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  messenger-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- messenger --coverage
      
  instagram-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- instagram --coverage
      
  navigator-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- navigator --coverage
      
  shop-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- shop --coverage
      
  taxi-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- taxi --coverage
      
  insurance-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- insurance --coverage
      
  calls-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- calls --coverage
```

---

### 1. Messenger Tester (Тестировщик Мессенджера)
**Область ответственности:** Чаты, сообщения, E2E-шифрование, медиа, уведомления

#### Функционал для тестирования:
- **Управление чатами**
  - Создание индивидуальных и групповых чатов (до 1000 участников)
  - Добавление/удаление участников, роли, мут, архив
  - Удаление для себя/для всех
- **Операции с сообщениями**
  - Текст, редактирование с историей, цитирование, пересылка
  - Reactions (стандартные + кастомные эмодзи)
  - Закрепление, планирование отправки
- **Медиа**
  - Изображения (JPEG/PNG/WebP/HEIC), видео, документы
  - Голосовые сообщения, сжатие, превью
  - Альбомы, GIF, стикеры
- **E2E шифрование**
  - X3DH handshake, Double Ratchet
  - Key rotation (после 100 сообщений или 7 дней)
  - Session verification, key loss recovery
- **Групповые чаты**
  - Admin/moderator/member роли
  - Invite links, announcement mode, slow mode
  - History для новых участников
- **Поиск и фильтрация**
  - Full-text поиск, по дате, типу, упоминаниям
- **Уведомления**
  - Push (APNs/FCM), in-app, звуки, badge count
- **Синхронизация и оффлайн**
  - Message queue, sync on reconnect, conflict resolution
  - Read receipts, typing indicator, presence
- **Производительность**
  - Загрузка 10k+ сообщений, delivery < 100ms (LAN), < 500ms (WAN)
  - Память < 50MB на чат, оптимизация медиа

---

### 2. Instagram Tester (Тестировщик Инстаграма)
**Область ответственности:** Социальные фичи и медиа-контент

#### Функционал для тестирования:
- **Feed и Посты**
  - Создание постов (текст, фото, видео)
  - Мультипостинг (карусели), планирование
  - Алгоритм ленты (ранжирование)
- **Stories**
  - 24-часовые сторис, эфиры (live streams)
  - Интерактивные элементы (опросы, вопросы), highlights
- **Reels (Клипы)**
  - Видеомонтаж и фильтры, музыкальное сопровождение
  - Рекомендации и виральность
- **Социальные Фичи**
  - Подписки и фолловинг, лайки/комментарии, теги/хештеги
  - Репосты и упоминания
- **Монетизация**
  - Спонсорские посты, платные подписки, донаты
- **Аналитика**
  - Охват, engagement rate, демография

---

### 3. Navigator Tester (Тестировщик Навигатора)
**Область ответственности:** Геолокация и маршрутизация

#### Функционал для тестирования:
- **Базовая Навигация**
  - Поиск адресов и POI, построение маршрутов (авто/пешком/вело)
  - Голосовое ведение, оффлайн-карты
- **Реал-тайм Данные**
  - Трафик и пробки, камеры и скорость, ДТП, погода
- **Детализация**
  - 3D здания и трафик, высотные ограничения
  - Светофоры и знаки, плиты и полосы
- **Настройки**
  - Избегание платных/грязных/магистралей
  - Предпочтения транспорта, предупреждения о камерах
- **Интеграции**
  - Яндекс/Google Maps API, OSM данные, crowd-sourced пробки

---

### 4. Shop Tester (Тестировщик Магазина)
**Область ответственности:** Электронная коммерция

#### Функционал для тестирования:
- **Каталог**
  - Товары и варианты (размер/цвет), поиск и фильтрация
  - Сравнение, ожидание поступления
- **Корзина и Оформление**
  - Добавление/удаление, купоны, способы доставки, платежи
- **AR/VR**
  - Примерка (одежда, косметика), визуализация в интерьере, 3D-модели
- **Отзывы**
  - Текст/фото/видео отзывы, рейтинг продавцов

---

### 5. Taxi Tester (Тестировщик Такси)
**Область ответственности:** Транспортные сервисы

#### Функционал для тестирования:
- **Заказ ТС**
  - Классы (эконом/комфорт/бизнес), многомаршрутные поездки
  - Пассажиры с ограничениями
- **Водитель и Авто**
  - Рейтинг и отзывы, документы/лицензии, техническое состояние
- **Оплата**
  - Наличный/безналичный, чаевые, бонусные баллы
- **Безопасность**
  - SOS-кнопка, доверенные контакты, запись поездки, accessibility

---

### 6. Insurance Tester (Тестировщик Страховки)
**Область ответственности:** Страховые продукты

#### Функционал для тестирования:
- **Полисы**
  - ОСАГО, КАСКО, медицинская, имущественное страхование
- **Управление**
  - Покупка и продление, скидки, выплаты и урегулирование
- **Документы**
  - Электронные полисы, штрафы, история ДТП

---

### 7. Calls & SFU Tester (Тестировщик Звонков)
**Область ответственности:** Медиа-связь

#### Функционал для тестирования:
- **Видеозвонки**
  - 1:1 и групповые (до 50+), разделение экрана, запись
- **Аудио**
  - Opus/G.722, эхоподавление, шумоподавление
- **SFU**
  - Масштабируемость, SRTP/SRTCP шифрование, транспорты
- **E2EE**
  - DTLS/SRTP ключи, верификация отпечатков

---

### 8. Content Moderation Tester (см. Skill: content-moderation)
**Область ответственности:** Безопасность контента

**Test Coverage:**
- Spam (rate limit 100 msg/5min для новых)
- CSAM (PhotoDNA/PDQHash matching)
- PII (email, phone, address, passport, INN/SNILS)
- Toxic language (hate speech, harassment)
- Child safety (COPPA <13 age gate)
- Ban evasion (IP + fingerprint)
- Phishing URLs, scam patterns

**Files:** `src/test/chat-content-moderation.test.ts`

---

### 9. Database Scale & Sharding Tester
**Область ответственности:** Производительность БД при больших объёмах

**Test Coverage:**
- 1M+ сообщений в одном диалоге (пагинация, индексы)
- Cold start: загрузка последних 50 из 10M
- Шардинг по `dialog_id` (hash/range)
- Index performance (pg_stat_statements)
- Realtime subscription lag
- Migration path v1 → v11 без downtime

**Files:** `src/test/chat-sharding-strategy.test.ts`

---

### 10. Network Resilience Tester
**Область ответственности:** Устойчивость к сетевым проблемам

**Test Coverage:**
- Latency до 5s (SAT), jitter ±20%
- Packet loss 40% с retry exponential backoff
- Bandwidth throttling 56kbps (2G)
- Duplicate messages (30%), out-of-order (20%)
- Intermittent disconnect (каждые 5–30s)
- Offline queue draining on reconnect
- Network switch (WiFi ↔ Cellular)

**Files:** `src/test/chat-network-resilience.test.ts`
**Utils:** `src/test/utils/networkSimulator.ts`

---

### 11. Cross-Platform Consistency Tester
**Область ответственности:** Консистентность на всех платформах

**Test Coverage:**
- Visual regression (Chrome/Firefox/Safari/Edge pixel-perfect)
- Mobile (iOS Safari, Chrome Android) touch targets 44×44
- Feature detection (WebRTC, File API, IndexedDB)
- PWA installability criteria
- Safari file:// quirks, Android soft keyboard
- Platform-specific CSS workarounds

**Files:** `e2e/chat-cross-platform.spec.ts`

---

### 12. Privacy & GDPR Compliance Tester
**Область ответственности:** Соблюдение GDPR/CCPA/COPPA

**Test Coverage:**
- Art. 17 Right to be Forgotten: полное удаление всех данных
- Art. 20 Data Portability: export JSON/MBOX
- Art. 7 Consent revocation: остановка обработки
- 30-day auto-purge (ATTACHMENT TTL)
- Child safety (<13 parental consent)
- Cross-border transfer (Schrems II, SCCs)
- Anonymization vs delete (aggregates preserve)

**Files:** `src/test/chat-gdpr-compliance.test.ts`

---

### 13. Internationalization (i18n) Tester
**Область ответственности:** Поддержка 100+ локалей

**Test Coverage:**
- RTL mirroring (Arabic, Hebrew) UI
- Plural forms (ru: 1/2–4/5+, ar: 6 forms)
- Emoji skin tones (Fitzpatrick 1–6)
- Bidirectional text mixing (RTL numbers)
- Text expansion (DE +30%, CJK full-width)
- CJK line breaking, locale-specific date/time formats

**Files:** `src/test/chat-i18n.test.ts`

---

### 14. Accessibility (a11y) Tester
**Область ответственности:** Доступность для инвалидов

**Test Coverage:**
- Screen reader (NVDA, VoiceOver, TalkBack) labels and announcements
- Keyboard navigation (Tab, Enter, Escape, arrows, trap)
- ARIA roles/states/properties completeness
- WCAG 2.1 AA contrast (4.5:1)
- Touch target size (44×44)
- Reduced motion support
- Skip links and landmarks

**Files:** `e2e/chat-a11y.spec.ts`
**Utils:** axe-core Playwright integration

---

### 15. Time Edge Cases Tester
**Область ответственности:** Граничные случаи со временем

**Test Coverage:**
- DST spring forward (hour gap) and fall back (hour repeat)
- Leap second (23:59:60) parsing/display
- Year 2038 problem (32-bit overflow detection)
- Epoch 0 (1970-01-01) и negative timestamps
- Timezone change mid-conversation
- Message scheduling across DST
- Clock skew tolerance (±5s), NTP deviation

**Files:** `src/test/chat-time-edge-cases.test.ts`
**Utils:** `src/test/utils/timeEdgeCaseHelper.ts`

---

### 16. Battery & Resource Tester
**Область ответственности:** Энергопотребление и ресурсы

**Test Coverage:**
- Active chat drain (< 2%/hour)
- Background sync wakeups (< 8/hour)
- Media decoding power (720p vs 1080p)
- Geolocation high-accuracy vs balanced drain
- Voice recording energy (5 min < 0.5%)
- Notification wakeup cost
- Battery saver mode auto-FPS reduction

**Files:** `src/test/chat-battery-impact.test.ts`

---

### 17. Feature Flags & Experiments Tester
**Область ответственности:** Gradual rollout, A/B testing

**Test Coverage:**
- Gradual rollout (10% → 100%) smooth transition
- Cohort isolation (no bleed between control/treatment)
- Sticky assignment (user_id hash → bucket persistent)
- Emergency killswitch (instant global disable)
- Metrics without PII (aggregated only)
- A/B test variant distribution correctness
- Experiment start date enforcement (no pre-launch leakage)

**Files:** `src/test/chat-feature-flags.test.ts`

---

### 18. API Contract & Schema Validation Tester
**Область ответственности:** Backward compatibility, schemas

**Test Coverage:**
- Backward compatibility (v1 ↔ v11 chat protocol)
- Deprecation headers presence (X-Deprecated)
- Rate limit headers (X-RateLimit-*)
- Error format consistency (RFC 7807 Problem Details)
- Pagination cursor validity (opaque cursors never expire)
- OpenAPI spec ↔ implementation sync
- Pact contract testing (consumer-driven contracts)

**Files:** `src/test/chat-api-contract.test.ts`

---

### 19. Codec & Media Quality Tester
**Область ответственности:** Звук/видео/кодеки для звонков

**Test Coverage:**
- Opus bitrate adaptation (6–510 kbps auto)
- VP8/VP9/H.264 hardware acceleration fallback
- Echo cancellation quality (AEC3 metric > 4.0)
- Packet loss concealment (PLC)
- Jitter buffer auto-sizing (20–60ms target)
- Screen share simulcast layers (3 layers)
- Audio MOS (Mean Opinion Score) > 4.0

**Files:** `src/test/calls/codec-compatibility.test.ts`

---

## Тестовая Инфраструктура

### Unit Tests
```bash
# Запуск тестов по модулям
npm test -- messenger
npm test -- instagram  
npm test -- navigation
npm test -- shop
npm test -- taxi
npm test -- insurance
npm test -- calls

# Новые модули
npm test -- chat-crypto-agility
npm test -- chat-network-resilience
npm test -- chat-content-moderation
npm test -- chat-gdpr-compliance
npm test -- chat-i18n
npm test -- chat-storage-quotas
npm test -- chat-time-edge-cases
npm test -- chat-battery-impact
npm test -- chat-feature-flags
npm test -- e2ee-crypto-agility
```

### Integration Tests
```bash
# Критические пути + Chaos
npm run test:core          # acceptance + chaos
npm run test:e2e:qr-strict # QR invite strict flow

# Крипто-тесты
npm run test:calls:e2ee    # E2EE для звонков

# Проверки
npm run chat:schema-probe  # Пропrobe схемы чата
npm run sql:lint          # Линт SQL/RPC
```

### E2E Tests
```bash
# Playwright (основной фреймворк)
npx playwright test
npx playwright test e2e/chat-a11y.spec.ts
npx playwright test e2e/chat-cross-platform.spec.ts

# Cypress (альтернатива)
cypress run --spec "cypress/e2e/messenger/**"

# Нагрузочное тестирование
k6 run scripts/load/messenger-chat.js
k6 run scripts/load/instagram-feed.js
```

### Security Tests
```bash
# Agentic Security (OWASP Top 10 + Zero-Day)
npm run security:scan

# promptfoo (LLM security)
npm run security:promptfoo

# E2EE специфичные
npm test -- e2ee-*.test.ts e2ee-security-edge-cases.test.ts
```

---

## Метрики Качества

### Messenger
- Время доставки: < 100ms (LAN), < 500ms (WAN)
- Синхронизация оффлайн: < 2s на 1000 сообщений
- Успешность отправки: 99.99%
- E2E encryption overhead: < 50ms

### Navigation
- Построение маршрута: < 1s
- Обновление трафика: < 30s
- Точность GPS: ±3m

### Shop
- Время загрузки каталога: < 1s
- Успешность платежей: 99.9%
- AR примерка: < 3s инициализация

### Calls
- Установка соединения: < 2s
- Bitrate convergence: < 2s после network change
- SFU CPU: < 70% при 50 участников (720p)

### Scale (новые)
- 1M сообщений в диалоге: пагинация < 100ms
- 10k concurrent users в группе: delivery < 1s
- Database query latency: < 15ms p95

---

## CI/CD Интеграция

```yaml
name: Full Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - run: npm run security:scan

  llm-validation:
    needs: security-scan
    runs-on: ubuntu-latest
    steps:
      - run: npm run security:promptfoo

  load-tests:
    runs-on: ubuntu-latest
    steps:
      - run: k6 run scripts/load/messenger-chat.js
```

---

## Схема Приоритетов

1. **Critical** - Сбои в оплате, маршрутизации, шифровании, CSAM, DoS
2. **High** - Потеря данных, проблемы производительности, утечка PII
3. **Medium** - UI/UX проблемы, косметические баги, локаль
4. **Low** - Текст, опечатки, минорные улучшения

---

## Протокол Действий

1. **Lock scope** — Точное определение подсистемы и бага (один дефект = один границы)
2. **Inspect** — Анализ только релевантного кода (не扩大 scope)
3. **Fix** — Минимально необходимое исправление (не переделывать всё вокруг)
4. **Validate** — Типчек, тесты, сборка, smoke test
5. **Report** — Результат на русском (что пофиксил, что verified, что осталось)
6. **Iterate** — Следующий дефект как новый шаг (не бразуilly)
