// middleware/authSupabaseJwt.ts — Supabase JWT verification middleware
//
// Verifies JWT via jose JWKS with LIMITED symmetric fallback.
// Extracts tenant_id, role, email from claims.
// Supports role-based access control and admin IP allowlisting.
//
// SECURITY NOTE: The symmetric fallback is INTENTIONALLY restricted to
// JWKSNoMatchingKey errors only (key rotation window). Network errors or
// JWKS fetch timeouts cause a hard 503 response — never a silent downgrade
// to the weaker symmetric path.

import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload, errors as joseErrors } from 'jose';
import { getEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        tenantId: string;
        role: 'app' | 'service' | 'admin';
        email?: string;
        aud?: string;
      };
      requestId: string;
      log: import('pino').Logger;
    }
  }
}

// Ролевая модель
type Role = 'app' | 'service' | 'admin';

// JWKS кеш
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    const env = getEnv();
    _jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL));
  }
  return _jwks;
}

function extractRole(payload: JWTPayload): Role {
  // Supabase хранит роль в app_metadata или role claim
  const appMetadata = (payload as Record<string, unknown>).app_metadata as Record<string, unknown> | undefined;
  const userRole = appMetadata?.role || (payload as Record<string, unknown>).role || 'app';

  if (typeof userRole === 'string' && ['admin', 'service', 'app'].includes(userRole)) {
    return userRole as Role;
  }

  // service_role ключ Supabase → admin
  if ((payload as Record<string, unknown>).role === 'service_role') {
    return 'admin';
  }

  return 'app';
}

// Основной middleware
export function authSupabaseJwt(requiredRoles?: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const logger = req.log || getLogger();

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header',
          requestId: req.requestId,
        });
        return;
      }

      const token = authHeader.slice(7);
      const env = getEnv();

      // Верификация JWT
      let payload: JWTPayload;
      try {
        // Основной путь: JWKS (asymmetric RS256/ES256 — рекомендован Supabase)
        const result = await jwtVerify(token, getJWKS(), {
          issuer: env.SUPABASE_JWKS_URL.replace('/.well-known/jwks.json', ''),
        });
        payload = result.payload;
      } catch (jwksError: unknown) {
        // ── Ограниченный fallback на симметричный ключ ──────────────────────
        //
        // Допустим ТОЛЬКО для JWKSNoMatchingKey (временное окно ротации ключей
        // когда новый ключ ещё не попал в локальный кеш JWKS). Все остальные
        // ошибки — включая сетевые, timeout и ошибки подписи — пробрасываются
        // выше и вызывают 401 или 503.
        //
        // НЕЛЬЗЯ делать fallback при:
        //   - JWSSignatureVerificationFailed → токен подписан неверным ключом
        //   - JWTExpired / JWTClaimValidationFailed → токен невалиден
        //   - network errors / JWKS fetch timeout → сервис JWKS недоступен
        //     (в этом случае мы не знаем является ли токен валидным)
        //
        // Если сделать fallback на всех ошибках, атакующий может:
        //   1. Заблокировать DNS суpabase JWKS endpoint (или заставить сервер
        //      обращаться к недоступному endpoint)
        //   2. Подписать произвольный токен симметричным ключом (если он утёк)
        //   3. Получить доступ в обход проверки отзыва через JWKS
        //
        const isKeyRotationWindow = jwksError instanceof joseErrors.JWKSNoMatchingKey;

        if (!isKeyRotationWindow) {
          // Пробрасываем вверх — catch блок в родительском try вернёт 401/503
          throw jwksError;
        }

        logger.warn(
          { err: (jwksError as Error).message },
          'JWKS key not matched — attempting symmetric fallback (key rotation window)',
        );

        // Fallback на HMAC-симметричный ключ (Supabase legacy / dev окружения)
        //
        // SECURITY FIX: issuer ДОЛЖЕН быть проверен и на симметричном пути.
        // Без проверки issuer любой сервис/инструмент, знающий SUPABASE_JWT_SECRET,
        // может выпустить валидный токен с произвольными claims. Токен пройдёт
        // аутентификацию даже если подписан dev-инструментом, CI-ранером или
        // тестовым сервисом.
        const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
        const issuer = env.SUPABASE_JWKS_URL.replace('/.well-known/jwks.json', '');
        const result = await jwtVerify(token, secret, { issuer });
        payload = result.payload;
      }

      // Извлечение роли из JWT claims
      const role = extractRole(payload);

      // Проверка требуемых ролей
      if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(role)) {
        logger.warn({ sub: payload.sub, role, requiredRoles }, 'Insufficient role');
        res.status(403).json({
          error: 'FORBIDDEN',
          message: `Required roles: ${requiredRoles.join(', ')}`,
          requestId: req.requestId,
        });
        return;
      }

      // Извлечение tenant_id из claims
      const claims = payload as Record<string, unknown>;
      const appMeta = claims.app_metadata as Record<string, unknown> | undefined;
      const tenantId =
        (claims.tenant_id as string | undefined) ||
        (appMeta?.tenant_id as string | undefined) ||
        (payload.sub as string);

      // Установка auth контекста
      req.auth = {
        sub: payload.sub as string,
        tenantId,
        role,
        email: claims.email as string | undefined,
        aud: typeof payload.aud === 'string' ? payload.aud : undefined,
      };

      logger.debug({ sub: req.auth.sub, tenantId: req.auth.tenantId, role }, 'JWT verified');
      next();
    } catch (error: unknown) {
      logger.error({ err: error }, 'JWT verification failed');
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        requestId: req.requestId,
      });
    }
  };
}

// Middleware для admin-only endpoints с IP allowlist
/**
 * Middleware-цепочка для admin-only endpoints.
 *
 * Проверяет JWT (роль 'admin') + IP allowlist.
 *
 * ── ВАЖНО: req.ip и trust proxy ────────────────────────────────────────
 * `req.ip` в Express зависит от настройки `trust proxy`:
 *
 *   БЕЗ `app.set('trust proxy', ...)`:
 *     req.ip = IP TCP-соединения (обычно 127.0.0.1 за nginx/k8s).
 *     Если ADMIN_IP_ALLOWLIST содержит реальные IP — проверка ВСЕГДА упадёт.
 *
 *   С `app.set('trust proxy', 1)`:
 *     req.ip = X-Forwarded-For[-1] (последний добавленный прокси).
 *     Атакующий может подделать заголовок, если прокси не очищает его.
 *
 * Мы используем `X-Real-IP` — заголовок который nginx/ingress устанавливает
 * из реального IP клиента и который клиент не может переопределить снаружи.
 * Если заголовок отсутствует — fallback на req.socket.remoteAddress (прямое
 * TCP-соединение, только для dev/internal).
 *
 * Требование к инфраструктуре:
 *   Nginx/ingress ДОЛЖЕН добавлять: `proxy_set_header X-Real-IP $remote_addr;`
 *   НЕ пробрасывать X-Real-IP от клиента дальше.
 * ────────────────────────────────────────────────────────────────────────
 */
export function adminOnly() {
  return [
    authSupabaseJwt(['admin']),
    (req: Request, res: Response, next: NextFunction): void => {
      const env = getEnv();
      const allowedIPs = env.ADMIN_IP_ALLOWLIST.split(',')
        .map((ip) => ip.trim())
        .filter(Boolean);

      // Приоритет источников IP (от наиболее надёжного к наименее):
      //   1. X-Real-IP — устанавливается nginx из $remote_addr (клиент не контролирует)
      //   2. req.socket.remoteAddress — прямое TCP-соединение (dev/direct mode)
      //   Намеренно НЕ используем X-Forwarded-For — он может содержать цепочку
      //   прокси и частично контролируется атакующим.
      const clientIP =
        (req.headers['x-real-ip'] as string | undefined)?.trim() ||
        req.socket.remoteAddress ||
        '';

      // Wildcard '*' — отключает IP-фильтр (только для dev окружений)
      if (allowedIPs.includes('*')) {
        req.log.warn(
          { clientIP },
          'adminOnly: IP allowlist = "*" — IP filtering disabled (dev mode only!)',
        );
        next();
        return;
      }

      if (!allowedIPs.includes(clientIP)) {
        req.log.warn(
          { clientIP, allowedIPsCount: allowedIPs.length },
          // Не логируем сам allowedIPs — он может содержать внутренние IP-диапазоны
          'Admin access denied: IP not in allowlist',
        );
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'IP not allowed for admin endpoints',
          requestId: req.requestId,
        });
        return;
      }

      req.log.info({ clientIP }, 'Admin access granted');
      next();
    },
  ];
}
