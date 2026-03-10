/**
 * tests/load/k6-send.js
 *
 * k6 нагрузочный тест для email-router.
 *
 * ПРОФИЛИ НАГРУЗКИ:
 *   - steady_10k:   10 000 email/час ≈ 2.78 req/sec (3 VU @ 1 req/sec)
 *   - peak_100k:    100 000 email/час ≈ 27.8 req/sec (30 VU @ ~1 req/sec)
 *
 * SLO ПОРОГИ (thresholds):
 *   - http_req_duration: P95 < 2000ms, P99 < 5000ms
 *   - email_send_success: rate > 99%
 *   - http_req_failed: rate < 1%
 *
 * ТРЕБОВАНИЯ:
 *   - k6 v0.54+ установлен: https://k6.io/docs/getting-started/installation/
 *   - email-router запущен и доступен по BASE_URL
 *   - Валидный JWT токен передан через переменную окружения JWT
 *
 * ЗАПУСК:
 *
 *   # Базовый тест (10k/час, 5 минут):
 *   BASE_URL=http://localhost:3100 JWT=your-jwt k6 run tests/load/k6-send.js
 *
 *   # Пиковая нагрузка (100k/час, требует раскомментировать peak_100k):
 *   BASE_URL=http://localhost:3100 JWT=your-jwt k6 run \
 *     --env PROFILE=100k \
 *     tests/load/k6-send.js
 *
 *   # Smoke test (1 VU, 1 итерация):
 *   BASE_URL=http://localhost:3100 JWT=your-jwt k6 run \
 *     --vus 1 --iterations 1 \
 *     tests/load/k6-send.js
 *
 *   # Сохранение результатов:
 *   k6 run --out json=tests/load/results.json tests/load/k6-send.js
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ─── Кастомные метрики ────────────────────────────────────────────────────────

/** Rate: процент успешных отправок (status=202) */
const sendSuccess = new Rate('email_send_success');

/** Trend: распределение времени ответа для /email/send */
const sendDuration = new Trend('email_send_duration_ms');

/** Counter: общее количество успешно поставленных в очередь писем */
const emailsQueued = new Counter('emails_queued_total');

/** Counter: количество ошибок отправки */
const sendErrors = new Counter('email_send_errors_total');

// ─── Настройки теста ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // ── Профиль 10k/час ─────────────────────────────────────────────────────
    // ~2.78 req/sec = 3 VU, каждый делает 1 req/sec
    steady_10k: {
      executor: 'constant-arrival-rate',
      rate: 3,                  // 3 req/sec
      timeUnit: '1s',
      duration: '5m',           // 5 минут = 900 запросов
      preAllocatedVUs: 5,
      maxVUs: 10,
      exec: 'sendEmail',
      tags: { profile: '10k_per_hour' },
    },

    // ── Профиль 100k/час (раскомментировать для пикового теста) ─────────────
    // ~27.8 req/sec = 30 VU, каждый делает ~1 req/sec
    // peak_100k: {
    //   executor: 'constant-arrival-rate',
    //   rate: 28,               // 28 req/sec ≈ 100k/час
    //   timeUnit: '1s',
    //   duration: '10m',
    //   preAllocatedVUs: 30,
    //   maxVUs: 60,
    //   startTime: '6m',        // Начать через 6 минут после steady_10k
    //   exec: 'sendEmail',
    //   tags: { profile: '100k_per_hour' },
    // },
  },

  // ── SLO пороги ──────────────────────────────────────────────────────────────
  thresholds: {
    // P95 время ответа < 2 секунды (SLO: email-router HTTP latency)
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],

    // SLA: минимум 99% успешных отправок
    'email_send_success': ['rate>0.99'],

    // SLA: не более 1% HTTP ошибок (5xx, network errors)
    'http_req_failed': ['rate<0.01'],

    // P95 время для конкретного /email/send endpoint
    'email_send_duration_ms': ['p(95)<1500'],
  },
};

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3100';
const JWT = __ENV.JWT || 'test-jwt-replace-me';

// ─── Тело запроса ─────────────────────────────────────────────────────────────

/**
 * Генерирует payload для /email/send.
 * VU (Virtual User) и ITER (iteration) уникально идентифицируют запрос.
 */
function buildSendPayload() {
  return JSON.stringify({
    to: [
      {
        email: `loadtest-vu${__VU}-iter${__ITER}@example.com`,
        name: `Load Test VU${__VU}`,
      },
    ],
    subject: `Load Test ${__VU}-${__ITER} @ ${new Date().toISOString()}`,
    text: `This is load test email VU=${__VU} ITER=${__ITER}. Service: mansoni.ru`,
    // Уникальный ключ идемпотентности исключает дубликаты при retry
    idempotencyKey: `lt-${__VU}-${__ITER}-${Date.now()}`,
    priority: 3,
    metadata: {
      testProfile: '10k_per_hour',
      vu: __VU,
      iter: __ITER,
    },
  });
}

// ─── Сценарий: отправка одного email ─────────────────────────────────────────

/**
 * Основной сценарий нагрузочного теста.
 * Отправляет POST /email/send и проверяет ответ.
 */
export function sendEmail() {
  const payload = buildSendPayload();

  const res = http.post(`${BASE_URL}/email/send`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT}`,
      'X-Request-Id': `load-test-${__VU}-${__ITER}`,
    },
    // Таймаут для одного запроса
    timeout: '10s',
  });

  // ── Проверки ──────────────────────────────────────────────────────────────

  const success = check(res, {
    'status is 202 (accepted)': (r) => r.status === 202,
    'response has messageId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.data?.messageId !== undefined;
      } catch {
        return false;
      }
    },
    'response is JSON': (r) => {
      try { JSON.parse(r.body); return true; }
      catch { return false; }
    },
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  // ── Метрики ───────────────────────────────────────────────────────────────

  sendSuccess.add(success);
  sendDuration.add(res.timings.duration);

  if (success) {
    emailsQueued.add(1);
  } else {
    sendErrors.add(1);

    // Логирование ошибок для анализа
    if (res.status !== 202) {
      console.error(
        `[VU=${__VU} ITER=${__ITER}] ` +
          `FAIL status=${res.status} ` +
          `body=${res.body?.substring(0, 200)}`,
      );
    }
  }

  // ── Пауза между запросами ─────────────────────────────────────────────────
  // Небольшая пауза для реалистичного распределения нагрузки
  sleep(0.1); // 100ms = до 10 req/sec на VU
}

// ─── Дополнительные сценарии ──────────────────────────────────────────────────

/**
 * Сценарий: проверка health endpoint (baseline, не влияет на email metrics).
 */
export function checkHealth() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'health status 200': (r) => r.status === 200,
    'health status ok': (r) => JSON.parse(r.body)?.status === 'ok',
  });
}

/**
 * Сценарий: проверка статуса конкретного сообщения.
 * Используется для верификации end-to-end flow в отдельном профиле.
 */
export function checkMessageStatus() {
  // В реальном тесте нужно передать messageId из предыдущего send
  // Для демонстрации проверяем несуществующий ID (ожидаем 404)
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const res = http.get(`${BASE_URL}/email/status/${fakeId}`, {
    headers: { Authorization: `Bearer ${JWT}` },
  });

  check(res, {
    'status check returns auth-required or not-found': (r) =>
      r.status === 404 || r.status === 401,
  });
}

// ─── Итоговый отчёт ───────────────────────────────────────────────────────────

/**
 * Генерирует итоговый отчёт по результатам нагрузочного теста.
 * Вызывается k6 автоматически после завершения всех сценариев.
 */
export function handleSummary(data) {
  const summary = textSummary(data, {
    indent: '  ',
    enableColors: true,
  });

  // Формирование JSON отчёта
  const jsonReport = {
    timestamp: new Date().toISOString(),
    profile: '10k_per_hour',
    baseUrl: BASE_URL,
    duration: data.state?.testRunDurationMs,
    metrics: {
      // HTTP
      httpReqDuration: {
        p95: data.metrics?.http_req_duration?.values?.['p(95)'],
        p99: data.metrics?.http_req_duration?.values?.['p(99)'],
        avg: data.metrics?.http_req_duration?.values?.avg,
      },
      // Email-specific
      emailSendSuccess: {
        rate: data.metrics?.email_send_success?.values?.rate,
      },
      emailsQueued: {
        count: data.metrics?.emails_queued_total?.values?.count,
      },
      sendErrors: {
        count: data.metrics?.email_send_errors_total?.values?.count,
      },
      httpReqFailed: {
        rate: data.metrics?.http_req_failed?.values?.rate,
      },
    },
    // SLO compliance
    sloCompliance: {
      p95Under2s: (data.metrics?.http_req_duration?.values?.['p(95)'] ?? 0) < 2000,
      successRateOver99pct: (data.metrics?.email_send_success?.values?.rate ?? 0) > 0.99,
      errorRateUnder1pct: (data.metrics?.http_req_failed?.values?.rate ?? 1) < 0.01,
    },
  };

  return {
    // Консольный вывод
    stdout: summary,
    // JSON результаты для CI анализа
    'tests/load/results.json': JSON.stringify(jsonReport, null, 2),
    // Полные данные k6
    'tests/load/k6-full-results.json': JSON.stringify(data, null, 2),
  };
}
