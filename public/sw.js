/**
 * Service Worker — офлайн-кэш медиа + push уведомления
 * Стратегии:
 *   static assets  → Cache First
 *   Supabase media → Stale While Revalidate + LRU eviction
 *   API requests   → Network First с fallback
 *   push events    → show notification
 */

// Bump when caching behavior changes or to evict stale deployed shells/chunks.
const CACHE_VERSION = 'v3';
const MEDIA_CACHE = `media-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const MAX_MEDIA_CACHE_ITEMS = 200;
const MAX_MEDIA_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

// Паттерны URL для Supabase Storage (медиа)
const SUPABASE_STORAGE_PATTERN = /supabase\.co\/storage\/v1\/object\/(public|sign)\//;

// Статические ресурсы для предзагрузки
const STATIC_PRECACHE = [
  '/',
  '/index.html',
];

// ─── INSTALL ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch(() => {
        // Если precache не удался — игнорируем, SW всё равно активируется
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== MEDIA_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Только GET-запросы кэшируем
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Supabase Storage медиа → Stale While Revalidate
  if (SUPABASE_STORAGE_PATTERN.test(request.url)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }

  // 2. Supabase API / Realtime → Network First без кэширования.
  // Ответы REST API содержат персональные данные пользователя (сообщения,
  // профили, TOTP-статус). Кэшировать их нельзя: данные остались бы в
  // STATIC_CACHE после выхода из аккаунта, видимыми через DevTools → Cache Storage.
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/realtime/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 3. Статические ресурсы приложения → Cache First
  // HTML shell intentionally excluded to avoid stale chunk references after deploy.
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|eot|ico|png|svg|webp|jpg|jpeg|gif)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4. Навигационные запросы (SPA) → Network First для свежего index.html.
  // Это предотвращает ситуацию, когда старый shell ссылается на уже удаленные чанки.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 5. Остальное → Network First
  event.respondWith(networkFirst(request));
});

// ─── СТРАТЕГИИ ──────────────────────────────────────────────────────────────

/**
 * Cache First: сначала из кэша, при промахе — сеть + кэшируем.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Stale While Revalidate: возвращаем кэш немедленно, фоново обновляем.
 * После обновления — LRU eviction по размеру и количеству.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
      await evictMediaCache(cache);
    }
    return response;
  }).catch(() => cached || new Response('Offline', { status: 503 }));

  return cached || fetchAndUpdate;
}

/**
 * Network First: пробуем сеть, при ошибке — кэш.
 * Только для не-аутентифицированных ресурсов.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Network Only: никогда не кэшируем.
 * Используется для аутентифицированных API-запросов (Supabase REST, functions)
 * чтобы не утекли персональные данные после выхода из аккаунта.
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * LRU eviction медиа-кэша: удаляем старые записи при превышении лимитов.
 * Cache API не предоставляет метаданные о размере файлов нативно,
 * поэтому используем приближённую эвристику через количество записей.
 */
async function evictMediaCache(cache) {
  const keys = await cache.keys();
  const count = keys.length;

  if (count > MAX_MEDIA_CACHE_ITEMS) {
    const excess = count - MAX_MEDIA_CACHE_ITEMS;
    // Удаляем самые старые (первые в списке, т.к. Cache API добавляет новые в конец)
    const toDelete = keys.slice(0, excess);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// ─── PUSH ────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: 'Новое уведомление',
      body: event.data.text(),
    };
  }

  const title = data.title || 'Уведомление';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: data.data || {},
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── NOTIFICATION CLICK ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || '/';
  // Only allow same-origin URLs or relative paths to prevent open-redirect via push
  let url = '/';
  if (rawUrl.startsWith('/')) {
    url = rawUrl;
  } else {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.origin === self.location.origin) {
        url = rawUrl;
      }
    } catch {
      // Invalid URL — fall back to home
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// ─── MESSAGE CHANNEL ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_CACHE_STATS':
      getCacheStats().then((stats) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'CACHE_STATS', payload: stats });
        }
      });
      break;

    case 'CLEAR_MEDIA_CACHE':
      caches.delete(MEDIA_CACHE).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'MEDIA_CACHE_CLEARED' });
        }
      });
      break;

    // Вызывается при выходе из аккаунта — удаляет ВСЕ кэши включая STATIC_CACHE,
    // чтобы персональные данные не оставались доступными следующему пользователю устройства.
    case 'CLEAR_ALL_CACHES':
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      }).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'ALL_CACHES_CLEARED' });
        }
      });
      break;

    case 'CLEAR_OLD_MEDIA': {
      const { olderThanMs } = event.data;
      clearOldMediaEntries(olderThanMs).then((deleted) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'OLD_MEDIA_CLEARED', payload: { deleted } });
        }
      });
      break;
    }

    case 'PRELOAD_URLS': {
      const { urls } = event.data;
      preloadUrls(urls).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'PRELOAD_DONE' });
        }
      });
      break;
    }

    default:
      break;
  }
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Получить статистику кэша: количество файлов и приближённый размер.
 * Cache API не позволяет точно измерить размер без чтения каждого Response,
 * поэтому используем StorageEstimate API.
 */
async function getCacheStats() {
  let mediaCount = 0;
  let staticCount = 0;

  try {
    const mediaCache = await caches.open(MEDIA_CACHE);
    const mediaKeys = await mediaCache.keys();
    mediaCount = mediaKeys.length;
  } catch {
    mediaCount = 0;
  }

  try {
    const staticCache = await caches.open(STATIC_CACHE);
    const staticKeys = await staticCache.keys();
    staticCount = staticKeys.length;
  } catch {
    staticCount = 0;
  }

  let estimatedSize = 0;
  let quota = 0;
  if ('storage' in self && 'estimate' in self.storage) {
    try {
      const estimate = await self.storage.estimate();
      estimatedSize = estimate.usage || 0;
      quota = estimate.quota || 0;
    } catch {
      estimatedSize = 0;
    }
  }

  return {
    mediaCount,
    staticCount,
    estimatedSizeBytes: estimatedSize,
    quotaBytes: quota,
    maxMediaItems: MAX_MEDIA_CACHE_ITEMS,
    maxMediaSizeBytes: MAX_MEDIA_CACHE_SIZE_BYTES,
  };
}

/**
 * Очистить медиа записи старше olderThanMs миллисекунд.
 * Т.к. Cache API не хранит timestamp, используем дату в URL (если есть)
 * или просто удаляем первые N записей как LRU-приближение.
 */
async function clearOldMediaEntries(olderThanMs) {
  const cutoff = Date.now() - olderThanMs;
  let deleted = 0;

  try {
    const cache = await caches.open(MEDIA_CACHE);
    const keys = await cache.keys();

    for (const request of keys) {
      // Попытка извлечь timestamp из URL query param ?t= или из заголовков Response
      const url = new URL(request.url);
      const ts = parseInt(url.searchParams.get('t') || '0', 10);
      if (ts > 0 && ts < cutoff) {
        await cache.delete(request);
        deleted++;
      }
    }

    // Если ничего не удалили по timestamp — удаляем по LRU (первые N % записей)
    if (deleted === 0 && keys.length > 20) {
      const toDelete = Math.floor(keys.length * 0.2);
      for (let i = 0; i < toDelete; i++) {
        await cache.delete(keys[i]);
        deleted++;
      }
    }
  } catch {
    deleted = 0;
  }

  return deleted;
}

/**
 * Предзагрузить список URL в медиа-кэш.
 */
async function preloadUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return;

  const cache = await caches.open(MEDIA_CACHE);
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const existing = await cache.match(url);
      if (existing) return; // уже в кэше
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        await cache.put(url, response);
      }
    })
  );

  await evictMediaCache(cache);
  return results;
}
