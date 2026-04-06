---
name: pwa-compliance
description: "PWA чеклист: manifest, service worker, offline, install prompt, push notifications. Use when: подготовка к PWA, офлайн-режим, install prompt."
argument-hint: "[аспект PWA: manifest|sw|offline|push|all]"
user-invocable: true
---

# PWA Compliance — Чеклист прогрессивного веб-приложения

Скилл для проверки и реализации PWA-требований. Цель: установка на устройство, офлайн-работа, push-уведомления.

## Когда использовать

- Подготовка приложения к PWA
- Добавление офлайн-режима
- Настройка install prompt
- Внедрение push-уведомлений
- Перед Lighthouse PWA-аудитом

## Минимальные требования PWA

| Требование | Статус |
|---|---|
| HTTPS | Обязательно (localhost — исключение) |
| Web App Manifest | `manifest.json` с обязательными полями |
| Service Worker | Регистрация + fetch handler |
| Icons | 192x192 и 512x512 maskable |
| Viewport meta | `<meta name="viewport">` |
| Offline fallback | Хотя бы offline.html |

## Протокол

1. **Manifest** — создай/проверь `manifest.json` со всеми полями
2. **Icons** — 192, 512, maskable variants
3. **Service Worker** — регистрация, стратегии кэширования
4. **Offline** — shell кэшируется, данные через cache-first/network-first
5. **Install prompt** — перехвати `beforeinstallprompt`, покажи кастомный UI
6. **Theme color** — `<meta name="theme-color">` + в manifest
7. **Push** — подписка, обработка, UI permission request
8. **Тест** — Lighthouse PWA score, ручная установка на устройство

## Manifest

```json
{
  "name": "Your AI Companion",
  "short_name": "AI Companion",
  "description": "Суперплатформа с ИИ-помощником",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a2e",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Install Prompt

```typescript
import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return false
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      if (outcome === 'accepted') setIsInstalled(true)
      return outcome === 'accepted'
    } catch {
      return false
    }
  }, [deferredPrompt])

  return { canInstall: !!deferredPrompt && !isInstalled, isInstalled, install }
}
```

## Service Worker — стратегии кэширования

```typescript
// Cache-first для статики (JS, CSS, изображения)
// Network-first для API и HTML
// Stale-while-revalidate для частично динамического контента

// vite.config.ts — с vite-plugin-pwa
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 100, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
})
```

## Чеклист

- [ ] `manifest.json` подключён в `<head>`
- [ ] Icons: 192x192, 512x512, maskable
- [ ] Service Worker зарегистрирован и обрабатывает fetch
- [ ] Offline fallback — приложение не белый экран без сети
- [ ] `theme-color` в meta и manifest
- [ ] Install prompt перехвачен, кастомный UI
- [ ] Lighthouse PWA score >= 90
- [ ] Работает при медленном 3G (throttle в DevTools)

## Anti-patterns

- **SW без обновления** — старый кэш навечно. `registerType: 'autoUpdate'`
- **Cache everything** — кэшировать POST-запросы и auth-токены. Только GET + статика
- **Без offline UI** — белый экран вместо "Нет соединения"
- **Агрессивный prompt** — "Установить?" при первом визите. Подожди 2+ визита
- **Без maskable icon** — обрезанная иконка на Android. Добавь safe zone
- **Без theme-color** — белая строка браузера. Задай цвет бренда
