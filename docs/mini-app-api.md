# API Документация Mini App

## 🚀 Unified Bridge Architecture

Mansoni Mini App использует **единый фасад-мост** (`src/lib/mini-app/index.ts`), который автоматически выбирает реализацию:

- **Если `window.Telegram?.WebApp` доступен** → все вызовы делегируются Telegram WebApp API.
- **Если Telegram отсутствует** (браузер, десктоп, мобильный Safari без Telegram) → автоматически используются нативные Web API fallback'и.

**Принцип:**
```ts
import { showPopup, location, cloudStorage } from '@/lib/mini-app';

// Один и тот же код работает везде
showPopup({ message: 'Привет!' }); // Telegram popup OR DOM overlay
location.request(); // Telegram location OR Geolocation API
```

### Fallback Matrix

| API Group | Telegram | Native Fallback |
|-----------|----------|-----------------|
| **Dialogs** | `WebApp.showPopup()` | DOM `document.createElement('dialog')` |
| **Storage** | `WebApp.cloudStorage` | IndexedDB (`idb-keyval`) + AES-256-GCM |
| **Sensors** | `WebApp.accelerometer` | `DeviceMotionEvent` / `DeviceOrientationEvent` |
| **Geolocation** | `WebApp.getLocation()` | `navigator.geolocation.getCurrentPosition()` |
| **Haptics** | `WebApp.HapticFeedback` | `navigator.vibrate()` |
| **QR Scanner** | `WebApp.showScanQrPopup()` | `jsqr` + `MediaDevices.getUserMedia()` |
| **Contacts** | `WebApp.requestContact()` | `navigator.contacts.select()` + prompt polyfill |
| **Share** | `WebApp.shareMessage()` | `navigator.share()` (Web Share API) |
| **Clipboard** | `WebApp.readTextFromClipboard()` | `navigator.clipboard.readText()` |

---

## Обзор

Mansoni Mini App — автономная система мини-приложений, работающая без зависимости от `window.Telegram.WebApp`. Все API реализованы через нативные Web API с опциональной поддержкой Telegram (при наличии `window.Telegram`).

## Быстрый старт

```tsx
import { useMiniApp } from '@/hooks/useMiniApp';

function MyApp() {
  const { ready, platform, colorScheme, showPopup, mainButton } = useMiniApp();

  if (!ready) return <div>Loading...</div>;

  return (
    <div>
      <h1>Платформа: {platform}</h1>
      <button onClick={() => showPopup({ message: 'Привет!' })}>
        Показать popup
      </button>
    </div>
  );
}
```

---

## API Reference

### Lifecycle

#### `init()`
Инициализирует Telegram Mini App (вызывает `ready()` + `expand()`). Безопасна при отсутствии Telegram.

#### `ready()`
Сообщает Telegram, что приложение готово. Нативная реализация: no-op.

#### `expand()`
Расширяет приложение на весь экран. Нативная реализация: no-op.

#### `close()`
Закрывает приложение. Нативная реализация: no-op.

---

### UI — Диалоги

#### `showPopup(params)`
```ts
type PopupParams = {
  title?: string;
  message: string;
  buttons?: PopupButton[]; // { id?: string; type: 'default'|'destructive'|'ok'|'cancel'|'close'; text: string }
};
// → Promise<{ ok: boolean; result?: string }>
```
Показывает модальное окно. На Web — использует DOM-оверлей.

#### `showAlert(message)`
```ts
// → Promise<{ ok: boolean }>
```
Простое алерт-окно с кнопкой OK.

#### `showConfirm(message)`
```ts
// → Promise<{ ok: boolean; result: boolean }>
```
Окно подтверждения с кнопками OK / Отмена.

---

### Кнопки навигации

#### `MainButton`
```ts
{
  show: () => void;
  hide: () => void;
  setText: (text: string) => void;
  setParams: (params: MainButtonParams) => void;
  onClick: (cb: () => void) => void;
  offClick: () => void;
}
```
Визуальный компонент доступен через `useMiniApp().mainButton`. React-компонент `<MainButton />` рендерится автоматически при использовании `MiniAppProvider`.

#### `BackButton`
```ts
{
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: () => void;
}
```

#### `SettingsButton`
```ts
{
  show: () => void;
  hide: () => void;
  setParams: (params: SettingsButtonParams) => void;
  onClick: (cb: () => void) => void;
}
```

---

### Хранение данных

#### `cloudStorage`
```ts
{
  get: (keys: string[]) → Promise<StorageItem[]>;
  getOne: (key: string) → Promise<string | null>;
  set: (items: StorageItem[]) → Promise<void>;
  delete: (keys: string[]) → Promise<void>;
}
```
IndexedDB-хранилище. Асинхронное, поддерживает до ~50 MB.

#### `secureStorage`
```ts
{
  get: (key: string) → Promise<string | null>;
  set: (key: string, value: string) → Promise<void>;
}
```
AES-256-GCM шифрование через Web Crypto API. Для чувствительных данных (токены, ключи).

#### `sessionStorage`
```ts
{
  get: (key: string) → string | null;
  set: (key: string, value: string) → void;
  delete: (key: string) → void;
  clear: () => void;
}
```
In-memory хранилище. Очищается при закрытии приложения.

---

### Сенсоры

#### `accelerometer`
```ts
{
  start: () => void;
  stop: () => void;
  on: (cb: (data: AccelerometerData) => void) => void;
  off: () => void;
  isSupported: () => boolean;
}
```

#### `gyroscope`
```ts
{
  start: () => void;
  stop: () => void;
  on: (cb: (data: GyroscopeData) => void) => void;
  off: () => void;
  isSupported: () => boolean;
}
```

#### `deviceOrientation`
```ts
{
  start: () => void;
  stop: () => void;
  on: (cb: (data: DeviceOrientationData) => void) => void;
}
```

---

### Геолокация

#### `location`
```ts
{
  request: (opts?: LocationRequestOptions) → Promise<GeoLocation>;
  startUpdates: (cb: (loc: GeoLocation) => void) → void;
  stopUpdates: () → void;
}
```
Использует `navigator.geolocation`. Требует разрешения пользователя.

#### `locationManager`
```ts
{
  request: (opts?) → Promise<void>;
  onUpdate: (cb: (loc) => void) → void;
  offUpdate: () → void;
}
```

---

### QR-сканер

#### `openQRScanner(opts?)`
```ts
// → Promise<QRResult | null>
type QRResult = { raw: string; text: string; format: 'qr_code' | 'barcode' };
type QRScannerOptions = { facingMode?: 'environment' | 'user'; formats?: string[] };
```
Использует камеру + `jsqr`. Возвращает `null` если камера недоступна.

#### `closeQRScanner()`
Останавливает камеру и декодер.

#### `isQRScannerSupported()`
```ts
// → boolean
```
Проверяет наличие камеры и jsqr.

---

### Контакты

#### `requestContact()`
```ts
// → Promise<ContactPayload | null>
type ContactPayload = {
  phoneNumber: string;
  firstName: string;
  lastName?: string;
  userId?: string;
};
```
Использует `navigator.contacts.select()` (Chrome/Android). На других платформах — fallback с ручным вводом.

---

### Хэптика

#### `haptic`
```ts
{
  impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') → void;
  notification: (type: 'error' | 'success' | 'warning') → void;
  selectionChanged: () → void;
}
```
Использует Vibration API. No-op на десктопах.

---

### Платежи (Stars / XTR)

#### `Stars.createInvoice(params)`
```ts
type CreateInvoiceParams = {
  title: string;
  description: string;
  amount: number;
  currency?: string;    // default 'XTR'
  provider?: 'stripe' | 'yookassa' | 'internal';
  metadata?: Record<string, string>;
};
// → Result<Invoice>
```

#### `Stars.payInvoice(invoiceId)`
```ts
// → Result<{ client_secret?: string }>
```

#### `Stars.listInvoices(botId?, limit?, offset?)`
```ts
// → Result<{ invoices: Invoice[]; total: number }>
```

#### `Stars.getStarsBalance()`
```ts
// → Result<number>
```

---

### Аналитика

#### `trackEvent(name, props?)`
Отправляет событие в Yandex.Metrika (reachGoal) и GA4 (event).

#### `trackPageView(params?)`
Отправляет page_view в YM и GA4.

#### `trackMiniAppEvent(event, props?)`
Telegram-специфичная обёртка — добавляет `platform`.

#### `trackMiniAppPageView(screen, params?)`
Трекинг просмотра экрана в Mini App.

#### События Mini App
```ts
trackAppOpen(payload?)
trackAppClose()
trackExpand()
trackQRScan()
trackContactRequest()
trackEmojiStatus()
trackStarsPaymentInitiated(amount, currency)
trackStarsPaymentCompleted(amount, currency)
startSessionTracking()
endSessionTracking()
```

---

### Роутер

#### `navigate(path, replace?)`
Переход по маршруту через History API.

#### `goBack()`
Вызов `window.history.back()`.

#### `getCurrentRoute()`
```ts
// → Route | null
type Route = {
  path: string;
  name?: string;
  params: Record<string, string>;
  query: Record<string, string>;
  hash: string;
  meta?: Record<string, unknown>;
};
```

#### `onRouteChange(fn)`
Подписка на изменения маршрута. Возвращает unsubscribe-функцию.

#### `handleDeepLink(url, handlers)`
```ts
// → boolean (true если ссылка распознана)
handlers: {
  onStartApp?: (payload, botUsername?) => void;
  onStart?: (payload, botUsername?) => void;
  onResolve?: (botUsername) => void;
  onNavigate?: (path) => void;
}
```
Поддерживает форматы: `t.me/bot?startapp=…`, `tg://resolve?domain=…`, `tg://open?startapp=…`

#### `initRouter()`
Инициализация роутера. Ставит listener на `popstate`.

---

### Типы

```ts
type ColorScheme = 'light' | 'dark';
type SwipeBehavior = 'none' | 'horizontal' | 'vertical';
type HeaderColorType = 'bg_color' | 'secondary_bg_color';

interface ThemeParams { bg_color, button_color, button_text_color, hint_color, link_color, ... }
interface GeoLocation { latitude, longitude, accuracy, altitude?, altitudeAccuracy?, heading?, speed? }
interface QRResult { raw, text, format }
interface ContactPayload { phoneNumber, firstName, lastName?, userId? }
interface AttachmentFile { name, type, size, blob }
interface Invoice { id, title, description, amount, currency, status, createdAt, paidAt? }
interface MainButtonParams { text?, color?, textColor?, hasShineEffect?, isActive?, isVisible?, onClick? }
```

---

### Подключение в React

```tsx
import { MiniAppProvider, useMiniAppContext } from '@/contexts/MiniAppContext';

function App() {
  return (
    <MiniAppProvider>
      <MyMiniApp />
    </MiniAppProvider>
  );
}

function MyMiniApp() {
  const { ready, platform, showPopup, mainButton: MainBtn } = useMiniAppContext();
  // MainBtn.Component автоматически рендерится в bottom bar
}
```

---

## 🔄 Migration Guide

### From `@/lib/telegram/miniApp` to `@/lib/mini-app`

**Было (Telegram only):**
```ts
import { showPopup, cloudStorage } from '@/lib/telegram/miniApp';
// Падало без window.Telegram
```

**Стало (Unified):**
```ts
import { showPopup, cloudStorage } from '@/lib/mini-app';
// Работает везде: Telegram OR native browser
```

### API Changes

| Old API | New API | Notes |
|---------|---------|-------|
| `initTelegramMiniApp()` | `init()` (deprecated) / `ready()+expand()` | `init()` сохраняется для обратной совместимости |
| `tgShowPopup()` | `showPopup()` | Прямая замена |
| `mainButton` (object) | `mainButton` (same object) | Не изменился |
| `cloudStorage.get(keys)` | возвращает `Result<...>` | Теперь асинхронный Result-тип |
| `location.request()` | возвращает `Promise<Result<...>>` | Изменён возвращаемый тип |

### Deprecated Names (still available)

```ts
// These still work but emit console warnings in development
export const initTelegramMiniApp = () => { ready(); expand(); };
export const tgShowPopup = showPopup;
export const tgShowConfirm = showConfirm;
export const tgShowAlert = showAlert;
```

---

## Заметки

- Все API **no-safe** при отсутствии Telegram Web App — возвращают fallback-значения.
- CSS-изоляция: все визуальные компоненты стилизуются через `.mini-app` scope в `src/styles/mini-app.css`.
- `jsqr` — опциональная зависимость. При отсутствии QR-сканер возвращает `null`.
- Secure Storage использует PBKDF2 + AES-256-GCM. Соль хранится в IndexedDB.
- Платежи работают через Supabase Edge Function `/bot-payments/…`.