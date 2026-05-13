# Telegram Production Readiness — Task Tracker

## ✅ Phase 1: Core Mini App Functionality (WEEKS 1-2) — DONE

### Созданные файлы:

| Файл | Строки | Назначение |
|------|--------|------------|
| `src/lib/telegram/types.ts` | 231 | Единые TypeScript-типы (Bot API 9.6–10.0) |
| `src/lib/telegram/miniApp.ts` | 267 | Core API wrapper (theme, buttons, storage, biometric, QR, sensors, location) |
| `src/lib/telegram/deepLinks.ts` | 133 | Парсинг t.me/... и tg://... deep links |
| `src/lib/telegram/payments.ts` | 164 | Stars (XTR) клиент — createInvoice, pay, list, balance |
| `src/lib/telegram/analytics.ts` | 148 | Telegram-метрики поверх существующего analytics |
| `src/hooks/useMiniApp.ts` | 161 | React-хук инициализации Mini App |

**Итого: 1104 строки, 6 файлов, каждый ≤400 строк**

### Реализовано:
- [x] `miniApp.ts` — `ready`, `expand`, `close`, `setHeaderColor`, `setBackgroundColor`, `MainButton`, `SettingsButton`, `BackButton`, `showPopup`, `showAlert`, `showConfirm`, `haptic`, `cloudStorage`, `secureStorage`, `biometric`, `openQRScanner`, `closeQRScanner`, `setSwipeBehavior`, `addToHomeScreen`, `checkHomeScreenStatus`, `requestChat`, `downloadFile`, `getLocation`, `accelerometer`, `gyroscope`, `deviceOrientation`, `locationManager`, `showEmojiStatus`, `requestContact`, `requestWriteAccess`, `shareFiles`, `getInitData`, `showBioCheckPopup`
- [x] `deepLinks.ts` — `parseDeepLink`, `isDeepLink`, `extractStartAppPayload`, `buildMiniAppLink`, `handleDeepLink`
- [x] `payments.ts` — `Stars.createInvoice`, `Stars.payInvoice`, `Stars.listInvoices`, `Stars.getStarsBalance`
- [x] `analytics.ts` — `initMiniAppAnalytics`, `trackMiniAppPageView`, `trackMiniAppEvent`, стандартные события (open, close, expand, QR, contact, emoji, stars)
- [x] `useMiniApp.ts` — единый хук: `ready`, `platform`, `version`, `isMobile`, `isDesktop`, `colorScheme`, `themeParams`, `showPopup`, `showConfirm`, `showAlert`, `close`, `expand`, `mainButton`, `setBackHandler`, `clearBackHandler`
- [x] `types.ts` — User, Chat, ThemeParams, ColorScheme, Biometric, CloudStorage, Location, Accelerometer, Gyroscope, QR, Popup, MainButton, SettingsButton, BackButton, EmojiStatus, Contact, SwipeBehavior, InitData, BioCheck, FileSharing, SafeArea
- [x] `src/lib/mini-app/index.ts` — мост между Telegram API и нативными Web API (реэкспорты lifecycle, buttons, dialogs, storage, QR, sensors, location, payments, analytics, router)
- [x] `src/lib/mini-app/analytics.ts` — bridge над Yandex/GA4/Firehose + Telegram-метрики
- [x] `src/lib/mini-app/payments.ts` — bridge над Stars (XTR) через Supabase Edge Functions
- [x] `src/lib/mini-app/router.ts` — SPA-роутер с deep-link парсингом и hash-роутингом
- [x] `src/components/MainButton.tsx` — React UI-компонент + `useMainButtonAPI()` хук
- [x] `src/components/BackButton.tsx` — React UI-компонент + `useBackButtonAPI()` хук
- [x] `src/components/SettingsButton.tsx` — React UI-компонент + `useSettingsButtonAPI()` хук
- [x] `src/hooks/useMiniApp.ts` — исправлены сломанные импорты, подключены `@/lib/mini-app` и `@/lib/mini-app/analytics`
- [x] `src/lib/telegram/miniApp.ts` — исправлена рекурсивная ошибка в `BackButton.onClick`

### НЕ дублировано:
- `telegramWebApp.ts` — оставлен как fallback (простая проверка наличия Telegram WebApp)
- `formatTelegramTime.ts` — оставлен без изменений
- `MiniAppContainer.tsx` — iframe-обёртка для рендера mini apps, не пересекается с хуками
- `MiniAppListPage.tsx` — страница управления mini apps, использует `miniAppApi` (REST API)
- Ботовые типы и API (`bots/types.ts`, `bots/api.ts`) — не тронуты, существующая интеграция сохранена

## 🔲 Phase 2: Advanced Bot API Features (Weeks 3-4)
- [ ] Guest mode, polls, live photos, drafts, reactions (bot-api расширение)

## 🔲 Phase 3: Telegram Stars Payment Integration (Weeks 5-6)
- [ ] UI-компоненты Stars (StarsBalance, StarsPaymentSheet)
- [ ] Подписки и подарки

## 🔲 Phase 4: Push Notifications & Deep Linking (Weeks 7-8)
- [ ] Telegram push handler, deep link routing

## 🔲 Phase 5: Analytics & Security (Weeks 9-10)
- [ ] Rate limiting verification, security audit

## 🔲 Phase 6: Documentation & Release (Weeks 11-12)
- [ ] API docs, release notes, stakeholder sign-off