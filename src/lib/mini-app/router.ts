/**
 * Mini App — SPA Router with Deep Link Support
 *
 * Лёгкий клиентский роутер:
 * - Парсинг Telegram deep links (t.me/..., tg://...)
 * - Хэш-роутинг (#/path) для SPA
 * - Навигация через history API
 *
 * Не более 150 строк.
 */

import { parseDeepLink, buildMiniAppLink, extractStartAppPayload } from '@/lib/telegram/deepLinks';

// ── Route types ──────────────────────────────────────────────

export interface Route {
  path: string;
  name?: string;
  params: Record<string, string>;
  query: Record<string, string>;
  hash: string;
  meta?: Record<string, unknown>;
}

// ── Current state ────────────────────────────────────────────

let _currentRoute: Route | null = null;
const _listeners: Array<(route: Route) => void> = [];

// ── Parse location ───────────────────────────────────────────

function parseLocation(url: string): Route {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const hash = urlObj.hash.slice(1);
    const params: Record<string, string> = {};
    const query: Record<string, string> = {};

    for (const [k, v] of Array.from(urlObj.searchParams.entries())) {
      query[k] = v;
    }

    // Extract path params (e.g., /user/:id)
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      params.path = segments.join('/');
    }

    return { path, name: segments[0] || '', params, query, hash, meta: {} };
  } catch {
    return { path: '/', name: '', params: {}, query: {}, hash: '', meta: {} };
  }
}

// ── Navigation ───────────────────────────────────────────────

export function navigate(path: string, replace = false): void {
  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  const route = parseLocation(window.location.href);
  _currentRoute = route;
  _listeners.forEach((fn) => fn(route));
}

export function goBack(): void {
  window.history.back();
}

export function getCurrentRoute(): Route | null {
  if (!_currentRoute) {
    _currentRoute = parseLocation(window.location.href);
  }
  return _currentRoute;
}

export function onRouteChange(fn: (route: Route) => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

// ── Hash router ──────────────────────────────────────────────

export function initHashRouter(routes: Record<string, () => void | Promise<void>>): void {
  function handleHash() {
    const hash = location.hash.slice(1) || '/';
    const handler = routes[hash] || routes['*'];
    if (handler) void handler();
  }

  window.addEventListener('hashchange', handleHash);
  handleHash(); // initial
}

// ── Deep links ───────────────────────────────────────────────

export { parseDeepLink, buildMiniAppLink, extractStartAppPayload, parseLocation };

export function handleDeepLink(
  url: string,
  handlers: {
    onStartApp?: (payload: string, botUsername?: string) => void;
    onStart?: (payload: string, botUsername?: string) => void;
    onResolve?: (botUsername: string) => void;
    onNavigate?: (path: string) => void;
  }
): boolean {
  const parsed = parseDeepLink(url);
  if (!parsed) return false;

  switch (parsed.command) {
    case 'startapp':
      handlers.onStartApp?.(parsed.payload ?? '', parsed.botUsername);
      return true;
    case 'start':
      handlers.onStart?.(parsed.payload ?? '', parsed.botUsername);
      return true;
    case 'resolve':
      if (parsed.botUsername) handlers.onResolve?.(parsed.botUsername);
      return true;
    case 'open':
      handlers.onNavigate?.(`/mini-app/open`);
      return true;
    default:
      return false;
  }
}

// ── Init ─────────────────────────────────────────────────────

export function initRouter(): void {
  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    const route = parseLocation(window.location.href);
    _currentRoute = route;
    _listeners.forEach((fn) => fn(route));
  });

  // Initial route
  _currentRoute = parseLocation(window.location.href);
}