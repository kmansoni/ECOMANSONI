---
name: mansoni-browser-agent
description: "Mansoni browser agent — управляет браузером без скриншотов, видит реальный UI, тестирует проект в реальном времени. Использует Playwright для навигации, проверки состояния и интерактивного тестирования."
trigger: /browser-test
---

# /browser-test

Mansoni browser agent — тестирование проекта в реальном браузере без скриншотов.

## Возможности

1. **Видеть браузер без скриншотов** — прямой доступ к DOM, console, network
2. **Интерактивное тестирование** — клики, ввод, навигация
3. **Мониторинг ошибок** — console errors, page errors, network failures
4. **Проверка состояния UI** — видимые элементы, enabled/disabled, текст

## Использование

```
/browser-test <url>                          # открыть URL и начать тестирование
/browser-test --dev                          # открыть localhost:5173 (Vite dev)
/browser-test --prod                         # открыть mansoni.ru
/browser-test --check-auth                  # проверить auth flow
/browser-test --check-chat                  # проверить чат
/browser-test --check-calls                 # проверить звонки
```

## Browser Session

### Запуск браузера

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch({ 
  headless: false,
  args: ['--start-maximized']
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

// Слушать консоль
page.on('console', msg => {
  if (msg.type() === 'error') {
    console.log('❌ CONSOLE ERROR:', msg.text());
  }
});

page.on('pageerror', err => {
  console.log('❌ PAGE ERROR:', err.message);
});

page.on('requestfailed', request => {
  console.log('❌ FAILED:', request.url());
});
```

### Проверки состояния

```javascript
// Элемент существует и виден
const button = await page.locator('button:has-text("Отправить")');
const isVisible = await button.isVisible();
const isEnabled = await button.isEnabled();

// Получить текст
const text = await page.locator('.message').first().textContent();

// Проверить URL
const url = page.url();

// Ждать элемент
await page.waitForSelector('.chat-messages', { timeout: 5000 });
```

### Интерактивные действия

```javascript
// Клик
await page.click('button:has-text("Войти")');

// Ввод
await page.fill('input[name="email"]', 'test@example.com');
await page.fill('input[name="password"]', 'password123');
await page.click('button:has-text("Войти")');

// Навигация
await page.goto('https://mansoni.ru/chat');
await page.waitForLoadState('networkidle');
```

## Тестовые сценарии

### Auth Flow

```javascript
async function testAuth() {
  await page.goto('https://mansoni.ru/auth');
  
  // Заполнить форму
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  
  // Отправить
  await page.click('button[type="submit"]');
  
  // Проверить редирект
  await page.waitForURL('**/chat/**', { timeout: 10000 });
  
  // Проверить что вошли
  const userAvatar = await page.locator('.user-avatar').isVisible();
  console.log('Auth successful:', userAvatar);
}
```

### Chat Flow

```javascript
async function testChat() {
  await page.goto('https://mansoni.ru/chat');
  
  // Проверить список чатов
  const chats = await page.locator('.chat-list-item').count();
  console.log('Chats loaded:', chats);
  
  // Открыть чат
  await page.click('.chat-list-item:first-child');
  
  // Проверить сообщения
  const messages = await page.locator('.message').count();
  console.log('Messages:', messages);
  
  // Отправить сообщение
  await page.fill('.message-input', 'Привет!');
  await page.click('button:has-text("Отправить")');
  
  // Проверить что сообщение появилось
  await page.waitForSelector('.message:has-text("Привет!")');
}
```

### Calls Flow

```javascript
async function testCalls() {
  await page.goto('https://mansoni.ru/calls');
  
  // Проверить интерфейс звонков
  const callButton = await page.locator('button:has-text("Позвонить")');
  const isEnabled = await callButton.isEnabled();
  
  if (isEnabled) {
    // Начать звонок
    await callButton.click();
    
    // Проверить что звонок инициирован
    await page.waitForSelector('.call-active', { timeout: 5000 });
    
    // Завершить звонок
    await page.click('button:has-text("Завершить")');
  }
}
```

## Автоматический репортинг

```javascript
async function generateTestReport(page, testName) {
  const consoleErrors = [];
  const pageErrors = [];
  const networkFailures = [];
  
  // Собрать информацию
  const url = page.url();
  const title = await page.title();
  
  return {
    testName,
    url,
    title,
    consoleErrors,
    pageErrors,
    networkFailures,
    timestamp: new Date().toISOString()
  };
}
```

## MANSONI Integration

Mansoni использует browser-agent для:

1. **Верификации фич** — перед коммитом проверить что UI работает
2. **Отладки UI багов** — увидеть реальное поведение
3. **E2E тестирования** — проверить critical user flows
4. **Мониторинга ошибок** — поймать console errors в production

```
mansoni-queen → mansoni-tester → browser-agent → report
```

## Команды для Mansoni

- `/browser-test --dev` — открыть dev сервер
- `/browser-test --prod` — открыть production
- `/browser-test --auth` — проверить auth
- `/browser-test --chat` — проверить чат
- `/browser-test --calls` — проверить звонки
- `/browser-test --full` — полный набор тестов