---
name: service-worker-architect
description: "Service Worker архитектура: PWA, offline, cache strategies, background sync, push handling. Use when: PWA, service worker, offline режим, кэширование, background sync, install prompt, cache strategies."
argument-hint: "[стратегия: cache-first | network-first | stale-while-revalidate | all]"
---

# Service Worker Architect — PWA и Offline

---

## Вite PWA Plugin (рекомендуется)

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Precache статические assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Runtime caching
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*supabase\.co\/storage\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/.*supabase\.co\/rest\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'Your AI Companion',
        short_name: 'Companion',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        start_url: '/',
        scope: '/',
      },
    }),
  ],
};
```

---

## Cache Strategies

| Стратегия | Когда использовать |
|---|---|
| `CacheFirst` | Редко меняющиеся: шрифты, аватары, статичные assets |
| `NetworkFirst` | API данные, требующие свежести |
| `StaleWhileRevalidate` | Страницы, профили — показать кэш пока обновляется |
| `NetworkOnly` | Чувствительные данные: платежи, аутентификация |
| `CacheOnly` | Precached assets в offline |

---

## Install Prompt

```typescript
// src/hooks/usePWAInstall.ts
export function usePWAInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault(); // Отложить автоматический prompt
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    const { outcome } = await prompt.prompt();
    if (outcome === 'accepted') setPrompt(null);
  }

  return { canInstall: !!prompt && !isInstalled, install };
}
```

---

## Offline Detection

```typescript
// src/hooks/useOnlineStatus.ts
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Использование в компоненте
function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div role="alert" className="bg-yellow-100 text-yellow-800 p-2 text-center text-sm">
      Нет подключения к интернету. Работаем в режиме кэша.
    </div>
  );
}
```

---

## Background Sync (отложенная отправка)

```typescript
// Регистрация background sync (в service worker)
// sw.ts
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'send-messages') {
    event.waitUntil(sendPendingMessages());
  }
});

// В приложении — при ошибке сети
async function sendMessageWithSync(message: Message) {
  try {
    await sendMessage(message);
  } catch {
    // Сохранить в IndexedDB
    await db.pendingMessages.add(message);
    // Зарегистрировать sync
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('send-messages');
    // Отправится автоматически как только появится сеть
  }
}
```

---

## Чеклист

- [ ] vite-plugin-pwa с workbox конфигом
- [ ] Manifest.json с иконками 192px и 512px
- [ ] OfflineBanner при потере сети
- [ ] CacheFirst для статики, NetworkFirst для API
- [ ] Install prompt предлагается в нужный момент (не сразу)
- [ ] Service Worker update prompt (autoUpdate или показать кнопку)
