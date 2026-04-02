# Часть VII — Дорожная Карта, MVP и Операции

---

## 1. MVP — Определение и Обоснование

### 1.1 Что включает MVP (4 месяца разработки, к маю 2026)

**Принцип:** MVP — это минимально жизнеспособный продукт, способный обеспечить первую транзакцию с ценностью для покупателя и продавца. НЕ "сырой продукт" — это полноценный, но ограниченный по функционалу маркетплейс.

**ВКЛЮЧЕНО в MVP:**

| Модуль | Объём MVP | Обоснование включения |
|--------|-----------|----------------------|
| Регистрация (покупатель + продавец) | Телефон OTP + Email. KYC ФЛ/ИП. | Без этого нет транзакций |
| Каталог | До 50 000 SKU в 5 core категориях | Достаточно для тестирования |
| Поиск | BM25 + базовая персонализация | Без поиска нет покупок |
| PDP | Фото + видео + атрибуты + варианты + базовые отзывы | Ключевая страница конверсии |
| Корзина и Checkout | Мульти-seller, сохр. адрес, 3 метода оплаты | Обязательно для транзакций |
| Оплата | Карта (CloudPay), СБП, NEXUS Pay кошелёк | Core payments |
| Логистика | FBS-only + интеграция с СДЭК/Почтой России + 500 ПВЗ партнёрских | Доставка нужна сразу |
| Seller Center basic | Добавление товаров, статистика GMV/заказы, выплаты T+3 | Продавцам нужен базис |
| Отзывы | Верифицированные текстовые отзывы | Trust фактор |
| Мобильное приложение (iOS + Android) | Полный функционал MVP | 62% трафика мобайл |
| Поддержка | AI чатбот + email | Минимум |
| Антифрод | Базовые правила + 3DS | Безопасность платежей |

**ИСКЛЮЧЕНО из MVP (причины):**

| Функция | Причина исключения | Когда добавляем |
|---------|-------------------|----|
| Live Commerce | Требует отдельную инфраструктуру | Sprint 12 (мес 6) |
| BNPL | Требует партнёрства (3 месяца minimum) | Sprint 8 (мес 4) |
| Криптовалюты | Низкий приоритет, регуляторные риски | Sprint 16 (мес 8) |
| B2B модуль | Отдельный продукт, другой цикл продаж | Sprint 20 (год 2) |
| AI обогащение карточек (full) | Требует fine-tuning данных | Sprint 6 (мес 3) |
| Программа Stars (лояльность) | Нужны данные о поведении | Sprint 10 (мес 5) |
| FBO (свой склад) | Требует физической инфраструктуры | Sprint 16 (мес 8) |
| AR try-on | Сложность, нет данных | Year 2 |
| Тендерная система | После B2B модуля | Year 2 |
| Международная доставка | Требует таможенных соглашений | Year 2 |

### 1.2 MVP KPIs (Success Criteria)

Через 3 месяца после запуска MVP должно быть достигнуто:
- Зарегистрированных продавцов: 500+
- Активных SKU: 25 000+
- Зарегистрированных покупателей: 50 000+
- Успешных заказов: 5 000+
- App Store Rating: ≥ 4.0 ★
- Crash-free sessions: ≥ 99,5%
- P99 API latency: < 2 сек

---

## 2. Дорожная Карта — 24 Месяца (48 спринтов по 2 недели)

### Квартал 1 (Спринты 1–6, январь–июнь 2026): Разработка MVP

| Спринт | Фокус | Ключевые deliverables |
|--------|-------|----------------------|
| S1–2 | Инфраструктура и базовые сервисы | K8s кластер, Kafka, PostgreSQL, Redis, CI/CD pipelines, auth-service, user-service |
| S3–4 | Каталог и поиск | catalog-service, ES индекс, Seller Center базовый (добавление товаров), media upload |
| S5–6 | Заказы и оплата | order-service (simplified), payment-service (карта + СБП), cart-service, checkout flow |

### Квартал 2 (Спринты 7–12, июль–декабрь 2026): MVP → Публичный Запуск

| Спринт | Фокус | Ключевые deliverables |
|--------|-------|----------------------|
| S7–8 | Логистика и мобильное приложение | logistics-service (FBS + СДЭК/Почта), React Native MVP app (iOS + Android) |
| S9–10 | Отзывы, лояльность, уведомления | review-service, notification-service (push + email), базовые промокоды |
| S11–12 | Pre-launch подготовка | Load testing, Security audit, Founders Program онбординг, Seller KYC pipeline оптимизация |
| **🚀 ПУБЛИЧНЫЙ ЗАПУСК — Январь 2027** | | |

### Квартал 3 (Спринты 13–18, январь–июнь 2027): Быстрый Рост

| Спринт | Ключевые deliverables | Бизнес-метрика |
|--------|----------------------|----------------|
| S13–14 | BNPL интеграция (Тинькофф Сплит), поиск по фото (v1), A/B тестирование framework | +15% CVR BNPL покупатели |
| S15–16 | FBO v1 (первые 2 склада МСК/СПб), AI обогащение карточек | FBO adoption: 30% |
| S17–18 | NEXUS Live v1 (стриминг), Stars программа лояльности, персонализация v2 | Live GMV первые ₽50M |

### Квартал 4 (Спринты 19–24, июль–декабрь 2027): Монетизация и Экспасия

| Спринт | Ключевые deliverables | Бизнес-метрика |
|--------|----------------------|----------------|
| S19–20 | NEXUS Ads платформа v1 (Sponsored Products + CPC аукцион), Seller Analytics v2 | Ads revenue ₽100M/мес |
| S21–22 | Динамический репрайсинг AI, B2B модуль v1 (корп. аккаунты + ЭДО), NEXUS Premium | B2B GMV ₽1 млрд |
| S23–24 | Казахстан + Беларусь локализация (мультивалюта + мультиязык), international payments | СНГ выход Q4 2027 |

### Год 2, Квартал 1–2 (Спринты 25–36, январь–июнь 2028): Зрелость

| Спринт | Ключевые deliverables |
|--------|----------------------|
| S25–26 | NEXUS Pay финансовое приложение (кошелёк + кешбэк карта, банковская лицензия) |
| S27–28 | AR try-on v1 (одежда, аксессуары) с использованием WebXR + ML |
| S29–30 | Тендерная система B2B (RFQ, торги), NEXUS Academy (обучение продавцов) |
| S31–32 | GraphSAGE рекомендации v2 (Neo4j), голосовой поиск v2 (natural language) |
| S33–36 | ОАЭ + Турция выход: локализация, платёжные методы, местные склады |

### Год 2, Квартал 3–4 (Спринты 37–48, июль–декабрь 2028): IPO Подготовка

| Спринт | Ключевые deliverables |
|--------|----------------------|
| S37–40 | NEXUS Acquire: покупка/интеграция логистического партнёра в регионах |
| S41–44 | Финансовый продукт: NEXUS Кредит для продавцов (кредитная линия ₽10M+) |
| S45–48 | IPO готовность: аудит, compliance, IR (Investor Relations), road show |

---

## 3. Организационная Структура

### 3.1 Команда при Запуске (Год 0 → Год 1)

**Исполнительный комитет:**

| Роль | Зона ответственности | Найм |
|------|---------------------|------|
| CEO | Стратегия, инвесторы, media | Основатель |
| CTO | Технологии, архитектура | Основатель / Head hunter |
| CPO | Продукт, UX, roadmap | Co-founder / Head hunter |
| CMO | Маркетинг, рост, brand | Head hunter |
| COO | Операции, логистика, HR | Head hunter |
| CFO | Финансы, M&A, compliance | Head hunter |

**Инженерные команды (Год 1, ~60 инженеров):**

| Команда | Размер | Ответственность |
|---------|--------|----------------|
| Platform/Infrastructure | 8 | K8s, CI/CD, security, monitoring |
| Buyer Experience | 10 | Поиск, каталог, PDP, checkout |
| Seller Platform | 8 | Seller Center, analytics, ads |
| Payments & Fintech | 6 | Payment service, NEXUS Pay, BNPL |
| Logistics | 6 | Logistics service, трекинг, ПВЗ |
| AI/ML | 8 | Рекомендации, search ML, AI карточки |
| Mobile | 6 | iOS + Android (React Native) |
| Data/Analytics | 6 | ClickHouse, A/B, dashboards |
| QA | 4 | E2E тесты, performance, security |

**Бизнес-команды (Год 1, ~40 человек):**

| Команда | Размер | Ответственность |
|---------|--------|----------------|
| Seller Success | 10 | Онбординг, success менеджеры, support |
| Customer Support Tier 1-2 | 12 | Чат, email, WhatsApp |
| Marketing | 8 | Performance, content, influencers |
| Category Management | 6 | Выбор категорий, ценовые стратегии |
| Finance & Legal | 4 | Бухгалтерия, договора, compliance |

### 3.2 Plan найма (по кварталам)

| Квартал | +Инженеры | +Бизнес | Итого команда |
|---------|----------|---------|---------------|
| Q1 2026 | 15 | 5 | 20 |
| Q2 2026 | 20 | 10 | 50 |
| Q3 2026 | 15 | 15 | 80 |
| Q4 2026 | 10 | 10 | 100 |
| Q1-2 2027 | 20 | 25 | 145 |
| Q3-4 2027 | 25 | 40 | 210 |
| 2028 | 50 | 80 | 340 |

**Зарплатная политика:**
- Senior Engineers: ₽350K–₽600K/мес
- Principal/Staff Engineers: ₽500K–₽900K/мес
- Product Managers: ₽280K–₽500K/мес
- С опционной программой (ESOP): 5–12% для ключевых людей

---

## 4. Операционные Процессы

### 4.1 Модерация Товаров

**Автоматическая модерация (AI-first, 80% товаров):**

```
Правила автоматического одобрения:
- Продавец с рейтингом > 4.5 + > 100 продаж → auto-approve
- Товар в разрешённых категориях
- Нет стоп-слов в названии/описании
- Фото соответствует стандартам (AI vision check)
- Цена в допустимом диапазоне (нет аномалий: > 0 и < рыночной × 10)
- Штрих-код не заблокирован

Автоматическое отклонение:
- Запрещённые товары (оружие, наркотики, контрафакт, эротика)
- Фото низкого качества (разрешение < 800×800)
- Дублирование title + image у другого продавца (potential copy)
- Ценовая аномалия (₽0 или > ₽10M)

Ручная модерация (20% товаров):
- Уникальные/нестандартные категории
- Товары от новых продавцов (первые 10 SKU)
- Обжалование автоотклонения
- Жалобы конкурентов
- SLA: 8 рабочих часов
```

### 4.2 Обработка Споров

**Классификация споров:**

| Тип | Доля | Автоматическое решение | SLA ручного |
|-----|------|----------------------|-------------|
| "Посылка не пришла" | 35% | Если трекинг подтверждает недоставку → полный возврат | 48ч |
| "Пришло не то" | 25% | При фото доказательстве → возврат | 24ч |
| "Сломано при доставке" | 15% | При фото → возврат, разбор с логистом | 48ч |
| "Неверный размер/цвет" | 20% | Инициация возврата | 8ч |
| "Продавец не отправил" | 5% | Подтверждение трекингом → возврат + штраф продавцу | 24ч |

**Принципы разрешения споров:**
1. Покупатель в первую очередь: при ambiguity — решаем в пользу покупателя (как Amazon)
2. Fairness для продавца: продавец имеет 24 часа на представление доказательств
3. Защита от злоупотреблений: пользователь с > 5% return rate проходит расширенную проверку
4. Anti-chargeback: при подозрении на мошенничество — hold средств до 30 дней

### 4.3 Работа с Продавцами

**Seller Success Team — структура:**

| Тир продавца | GMV/мес | Поддержка |
|-------------|---------|-----------|
| Basic | < ₽100K | Self-service + FAQ + chat bot |
| Growth | ₽100K–₽1M | Chat support SLA 8ч + вебинары |
| Pro | ₽1M–₽10M | Dedicated Success Manager (8 продавцов/менеджер) |
| Elite | > ₽10M | Personal Success Manager (3 продавца/менеджер) |
| Enterprise | > ₽50M | Custom SLA + прямой доступ к CPO/CTO |

**Seller Graduation Program:**
- Новый продавец → 5-шаговый onboarding wizard в Seller Center
- Обязательный вебинар "Как продавать на NEXUS" (запись 2ч)
- Quiz для проверки понимания правил
- Первые 30 дней: еженедельный check-in с Success Manager (Growth+)
- Certification "NEXUS Trusted Seller" — badge на всех товарах

---

## 5. Масштабирование и Международная Экспансия

### 5.1 Приоритизация рынков

| Рынок | Timing | e-com TAM | Локализация Сложность | Стратегия |
|-------|--------|-----------|----------------------|-----------|
| Россия | Q1 2027 | $45B | — | Core market |
| Казахстан | Q4 2027 | $3,2B | Низкая (тенге + казахский) | Российская платформа + KZT + KZ seller support |
| Беларусь | Q4 2027 | $1,8B | Низкая (BYN, русскоязычный) | Налоговые особенности + BYN |
| Узбекистан | Q2 2028 | $1,2B | Средняя (UZS + узбекский + русский) | Партнёрство с местным логистом |
| ОАЭ | Q2 2028 | $9,4B | Высокая (AED + арабский + English) | Русскоязычная диаспора + English first |
| Турция | Q3 2028 | $22B | Высокая (TRY + турецкий) | Joint venture c местным партнёром |

### 5.2 Технологические требования для международной экспансии

**Multi-tenancy архитектура:**
```
Каждый рынок = отдельный "tenant" со своими:
- URL: nexus.kz, nexus.by, nexus.ae
- Базой данных (соответствие требованиям локализации данных)
- Конфигурацией платёжных методов
- Налоговыми правилами
- Языком интерфейса (i18next)
- Валютой (ISO 4217)
- Логистическими партнёрами

Общие компоненты (shared):
- Основная платформа microservices
- AI модели (с дополнительным обучением на локальных данных)
- Seller Center (с флагами по рынку)
- Monitoring и analytics
```

**Регуляторные требования:**
- РФ: 152-ФЗ (персональные данные хранятся в РФ), ФНС (ОФД для онлайн-касс)
- Казахстан: Закон о персональных данных + ЭДО через Казахстанский ЦА
- ОАЭ: VAT 5% (UAE FTA), DIFC data regulations
- Турция: KVKK (персональные данные), электронная торговля закон 6563

---

## 6. Распределение Инвестиций

### 6.1 Pre-Seed ₽150M (Q1 2026)

| Статья | ₽M | % |
|--------|----|----|
| Найм core team (8 человек × 6 мес.) | 48 | 32% |
| Инфраструктура (cloud, tools) | 18 | 12% |
| Legal (ООО, IP, договоры) | 8 | 5% |
| Разработка MVP прототипа | 60 | 40% |
| Операционные расходы | 16 | 11% |

### 6.2 Seed ₽800M (Q3 2026)

| Статья | ₽M | % |
|--------|----|----|
| Команда (найм до 50 чел × 6 мес.) | 240 | 30% |
| Маркетинг pre-launch + launch | 200 | 25% |
| Инфраструктура (production-ready) | 80 | 10% |
| Логистика (первые соглашения с 3PL, 500 ПВЗ) | 160 | 20% |
| Product development | 80 | 10% |
| Операционные + Legal | 40 | 5% |

### 6.3 Series A ₽3,5B (Q2 2027)

| Статья | ₽B | % |
|--------|----|----|
| Логистика: 2 собственных склада FBO (МСК + СПб) | 1,2 | 34% |
| Маркетинг Year 2 (масштабирование) | 0,8 | 23% |
| Команда найм (до 150 чел) | 0,7 | 20% |
| Финтех: NEXUS Pay лицензия + капитал | 0,4 | 11% |
| СНГ экспансия (Казахстан, Беларусь) | 0,2 | 6% |
| Product R&D (AI, рекомендации) | 0,2 | 6% |

---

## Приложения

### Приложение A: Протоколы качества кода

#### A.1 Code Review Protocol

```
ОБЯЗАТЕЛЬНЫЕ требования перед merge в main:
1. Все тесты проходят (unit + integration)
2. Code coverage не снижается (порог: 80% unit, 70% integration)
3. Linter и formatter: без ошибок (ESLint/golangci-lint/ruff)
4. TypeScript: zero TypeScript errors (strict mode)
5. Security scan: Snyk zero critical/high vulnerabilities
6. SAST: SonarCloud Quality Gate pass
7. PR reviewed by ≥ 2 инженеров (≥ 1 из owning team)
8. PR description: что изменено, почему, как тестировать
9. Breaking changes: миграция описана в CHANGELOG.md
10. Database migrations: reviewed by DB Tech Lead отдельно

Время review:
- Критические (hotfix): ≤ 2 часа
- Standard: ≤ 24 рабочих часа
- RFC (крупные изменения): ≤ 5 рабочих дней с архитектурным ревью
```

#### A.2 Стандарты написания кода (Go)

```go
// Пример: правильно написанный Go-обработчик
func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    ctx, span := h.tracer.Start(r.Context(), "order.create")
    defer span.End()
    
    // 1. Decode and validate input
    var req CreateOrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        h.logger.WarnContext(ctx, "invalid request body", slog.String("error", err.Error()))
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    
    if errors := req.Validate(); len(errors) > 0 {
        writeJSON(w, http.StatusUnprocessableEntity, ValidationErrors{Errors: errors})
        return
    }
    
    // 2. Business logic через service layer (не в handler)
    order, err := h.orderService.CreateOrder(ctx, req.ToCommand())
    if err != nil {
        switch {
        case errors.Is(err, ErrInsufficientStock):
            http.Error(w, "insufficient stock", http.StatusConflict)
        case errors.Is(err, ErrProductNotFound):
            http.Error(w, "product not found", http.StatusNotFound)
        default:
            span.RecordError(err)
            h.logger.ErrorContext(ctx, "failed to create order", slog.String("error", err.Error()))
            http.Error(w, "internal server error", http.StatusInternalServerError)
        }
        return
    }
    
    // 3. Publish event
    h.eventBus.Publish(ctx, OrderCreatedEvent{OrderID: order.ID, BuyerID: order.BuyerID})
    
    // 4. Return response
    h.metrics.OrderCreated.WithLabelValues(req.PaymentMethod).Inc()
    writeJSON(w, http.StatusCreated, toOrderResponse(order))
}

// Правила:
// - Один handler: один responsibility
// - Ошибки явно типизированные (no generic error)
// - Tracing span на каждой handler
// - Metrics инкремент на success
// - Structured logging (slog)
// - Нет бизнес-логики в handler — только HTTP → service
```

#### A.3 Стандарты написания кода (TypeScript/React)

```typescript
// Пример: React компонент по стандартам NEXUS
import { type FC, useCallback } from 'react';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils/format';
import type { Product } from '@/types/catalog';

interface AddToCartButtonProps {
  product: Product;
  variant?: 'default' | 'outline';
  className?: string;
  onSuccess?: () => void;
}

export const AddToCartButton: FC<AddToCartButtonProps> = ({
  product,
  variant = 'default',
  className,
  onSuccess,
}) => {
  const { addItem, isLoading, isInCart } = useCart();
  
  const handleAddToCart = useCallback(async () => {
    try {
      await addItem({ productId: product.id, quantity: 1 });
      onSuccess?.();
    } catch (error) {
      // Error handled by React Query + toast in query config
      console.error('Failed to add to cart:', error);
    }
  }, [addItem, product.id, onSuccess]);
  
  if (isInCart(product.id)) {
    return (
      <Button variant="outline" className={className} asChild>
        <a href="/cart">В корзине → Перейти</a>
      </Button>
    );
  }
  
  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleAddToCart}
      disabled={isLoading || !product.inStock}
      aria-label={`Добавить ${product.title} в корзину за ${formatPrice(product.price)}`}
    >
      {isLoading ? 'Добавляем...' : 'Добавить в корзину'}
    </Button>
  );
};

// Правила для React компонентов:
// - Именованные экспорты (НЕ default export для компонентов)
// - Props interface явно typed (не мелкие inline types)
// - useCallback для обработчиков передаваемых в children
// - aria-label на всех кнопках без текстового содержимого
// - Обработка состояний: loading, error, empty, success
// - Нет бизнес-логики в компоненте — только UI + custom hooks
```

#### A.4 Testing Protocol

```
Unit тесты (Go — testify, TypeScript — Vitest):
- Каждая публичная функция/метод имеет unit тест
- Edge cases: nil/null inputs, boundary values, error paths
- Naming: TestFunctionName_Scenario_ExpectedResult
- Нет внешних зависимостей (mocking всего внешнего)

Integration тесты:
- Каждый API endpoint имеет integration тест
- Тест проверяет полный HTTP request → response cycle
- Используется test database (testcontainers)
- Seedata для каждого теста изолирована (transaction rollback)

E2E тесты (Playwright):
- Критические user journeys: регистрация, покупка, возврат
- Запускаются на staging после каждого деплоя
- Screenshot diff при failure
- Performance testing: Lighthouse CI (LCP, INP, CLS threshold check)

Load тестирование:
- k6 сценарии: 10K concurrent users
- Запускается перед major release
- Threshold: p99 < 2s, error rate < 0.1%, no memory leaks
```

---

## Итоговое Резюме документации

Настоящий документ охватывает **полную проектную документацию** маркетплейса NEXUS:

| Раздел | Статус | Файл |
|--------|--------|------|
| I. Конкурентный анализ (80+ параметров) | ✅ Завершён | [`01-competitive-analysis.md`](./01-competitive-analysis.md) |
| II. Концепция, стратегия, спецификации | ✅ Завершён | [`02-concept-strategy.md`](./02-concept-strategy.md) |
| III. Техническая архитектура | ✅ Завершён | [`03-technical-architecture.md`](./03-technical-architecture.md) |
| IV. Дизайн-система и UX | ✅ Завершён | [`04-design-system-ux.md`](./04-design-system-ux.md) |
| V. Бизнес-модель и монетизация | ✅ Завершён | [`05-business-model.md`](./05-business-model.md) |
| VI. Маркетинг и рост | ✅ Завершён | [`06-marketing-growth.md`](./06-marketing-growth.md) |
| VII. Дорожная карта и операции | ✅ Завершён | [`07-roadmap-operations.md`](./07-roadmap-operations.md) |

**Документ готов к использованию командой разработки, инвесторами и всеми стейкхолдерами.**

---

*NEXUS Marketplace Project Documentation v1.0.0 — Confidential*  
*© 2026 NEXUS Technologies. All rights reserved.*
