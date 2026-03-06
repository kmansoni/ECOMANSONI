/**
 * router.js — Базовый роутер для API v1
 *
 * Простой и производительный HTTP-роутер с поддержкой:
 * - Path parameters (:id)
 * - Query parameters
 * - Middleware chain
 * - Graceful error handling
 *
 * Использует Map для O(1) lookup по методу+пути
 */

export class Router {
  constructor() {
    /** @type {Map<string, Handler>} */
    this.routes = new Map();
    /** @type {Array<import('./middleware/types').Middleware>} */
    this.middlewares = [];
  }

  /**
   * @typedef {Object} Handler
   * @property {Function} handler
   * @property {Array<import('./middleware/types').Middleware>} middlewares
   */

  /**
   * Регистрирует маршрут
   * @param {string} method HTTP метод
   * @param {string} path Путь с параметрами (например /users/:id)
   * @param {Function} handler Обработчик
   * @param {Array<import('./middleware/types').Middleware>} [routeMiddlewares]
   * @returns {this}
   */
  add(method, path, handler, routeMiddlewares = []) {
    const key = `${method.toUpperCase()}:${path}`;
    this.routes.set(key, {
      handler,
      middlewares: routeMiddlewares,
    });
    return this;
  }

  /**
   * @param {string} path
   * @param {Function} handler
   * @param {Array<import('./middleware/types').Middleware>} [middlewares]
   * @returns {this}
   */
  get(path, handler, middlewares = []) {
    return this.add('GET', path, handler, middlewares);
  }

  /**
   * @param {string} path
   * @param {Function} handler
   * @param {Array<import('./middleware/types').Middleware>} [middlewares]
   * @returns {this}
   */
  post(path, handler, middlewares = []) {
    return this.add('POST', path, handler, middlewares);
  }

  /**
   * @param {string} path
   * @param {Function} handler
   * @param {Array<import('./middleware/types').Middleware>} [middlewares]
   * @returns {this}
   */
  put(path, handler, middlewares = []) {
    return this.add('PUT', path, handler, middlewares);
  }

  /**
   * @param {string} path
   * @param {Function} handler
   * @param {Array<import('./middleware/types').Middleware>} [middlewares]
   * @returns {this}
   */
  delete(path, handler, middlewares = []) {
    return this.add('DELETE', path, handler, middlewares);
  }

  /**
   * @param {import('./middleware/types').Middleware} middleware
   * @returns {this}
   */
  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Разбирает URL и извлекает параметры
   * @param {string} pattern Шаблон пути (например /users/:id)
   * @param {string} url Фактический URL
   * @returns {{params: Record<string, string>, matched: boolean}}
   */
  matchRoute(pattern, url) {
    const patternParts = pattern.split('/');
    const urlParts = url.split('?')[0].split('/');

    if (patternParts.length !== urlParts.length) {
      return { params: {}, matched: false };
    }

    /** @type {Record<string, string>} */
    const params = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const urlPart = urlParts[i];

      // Parameter (e.g., :id)
      if (patternPart.startsWith(':')) {
        const paramName = patternPart.slice(1);
        params[paramName] = urlPart;
        continue;
      }

      // Static match
      if (patternPart !== urlPart) {
        return { params: {}, matched: false };
      }
    }

    return { params, matched: true };
  }

  /**
   * Основной метод обработки запроса
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @returns {Promise<boolean>} true если маршрут найден
   */
  async handle(req, res) {
    const method = req.method?.toUpperCase() ?? 'GET';
    const url = req.url?.split('?')[0] ?? '/';

    // Ищем маршрут
    let matchedRoute = null;
    let params = {};

    for (const [key, route] of this.routes) {
      const [routeMethod, routePath] = key.split(':');
      if (routeMethod !== method) continue;

      const match = this.matchRoute(routePath, url);
      if (match.matched) {
        matchedRoute = route;
        params = match.params;
        break;
      }
    }

    if (!matchedRoute) {
      return false;
    }

    // Прикрепляем параметры к запросу
    req.params = params;

    // Прикрепляем query к запросу
    const queryString = req.url?.split('?')[1] ?? '';
    req.query = this.parseQuery(queryString);

    // Build middleware chain
    const allMiddlewares = [...this.middlewares, ...matchedRoute.middlewares];

    // Создаем контекст
    /** @type {import('./types').RequestContext} */
    const ctx = { req, res };

    // Execute middlewares sequentially
    let middlewareIndex = 0;

    const next = async () => {
      if (middlewareIndex >= allMiddlewares.length) {
        // Все middleware прошли, вызываем обработчик
        try {
          await matchedRoute.handler(req, res);
        } catch (err) {
          this.handleError(res, err);
        }
        return;
      }

      const middleware = allMiddlewares[middlewareIndex++];
      try {
        await middleware(ctx, next);
      } catch (err) {
        this.handleError(res, err);
      }
    };

    await next();
    return true;
  }

  /**
   * @param {string} queryString
   * @returns {Record<string, string>}
   */
  parseQuery(queryString) {
    if (!queryString) return {};

    /** @type {Record<string, string>} */
    const query = {};
    const pairs = queryString.split('&');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        query[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
      }
    }

    return query;
  }

  /**
   * @param {http.ServerResponse} res
   * @param {Error} err
   */
  handleError(res, err) {
    const status = err.status ?? 500;
    const message = err.message ?? 'Internal Server Error';

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      })
    );
  }
}

/**
 * Утилита для создания ответа
 */
export function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Утилита для создания ошибки
 */
export function createError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}
