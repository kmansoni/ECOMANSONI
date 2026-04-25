import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Метрики
const errorRate = new Rate('errors');

// Конфигурация нагрузки
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Разогрев: 0 → 50 пользователей за 2 минуты
    { duration: '5m', target: 50 },   // Стабильная нагрузка: 50 пользователей 5 минут
    { duration: '2m', target: 100 },  // Рост: 50 → 100 пользователей за 2 минуты
    { duration: '5m', target: 100 },  // Пиковая нагрузка: 100 пользователей 5 минут
    { duration: '2m', target: 200 },  // Стресс-тест: 100 → 200 пользователей
    { duration: '3m', target: 200 },  // Стресс: 200 пользователей 3 минуты
    { duration: '2m', target: 0 },    // Остывание: 200 → 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% запросов < 500ms, 99% < 1s
    http_req_failed: ['rate<0.05'],                  // Ошибок < 5%
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://mansoni.ru';
const API_URL = __ENV.API_URL || `${BASE_URL}/api`;

export default function () {
  // 1. Health check
  let res = http.get(`${BASE_URL}/health`);
  check(res, {
    'health check status 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // 2. Главная страница
  res = http.get(BASE_URL);
  check(res, {
    'homepage status 200': (r) => r.status === 200,
    'homepage loads in <2s': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1);

  sleep(2);

  // 3. API: получение постов (публичный endpoint)
  res = http.get(`${API_URL}/posts?limit=20`, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    'posts API status 200': (r) => r.status === 200,
    'posts API response time <500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);

  // 4. API: поиск (более тяжёлый запрос)
  res = http.get(`${API_URL}/search?q=test&limit=10`, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    'search API status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'search API response time <1s': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(3);

  // 5. Статические ассеты
  res = http.get(`${BASE_URL}/assets/index.js`);
  check(res, {
    'static asset loads': (r) => r.status === 200 || r.status === 304,
  }) || errorRate.add(1);

  sleep(2);
}

// Teardown: финальный отчёт
export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options?.indent || '';
  const enableColors = options?.enableColors || false;

  const metrics = data.metrics;
  const green = enableColors ? '\x1b[32m' : '';
  const red = enableColors ? '\x1b[31m' : '';
  const reset = enableColors ? '\x1b[0m' : '';

  let summary = `\n${indent}Load Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n\n`;

  // HTTP requests
  const httpReqs = metrics.http_reqs?.values?.count || 0;
  const httpReqDuration = metrics.http_req_duration?.values;
  summary += `${indent}Total HTTP Requests: ${httpReqs}\n`;
  summary += `${indent}Request Duration:\n`;
  summary += `${indent}  avg: ${httpReqDuration?.avg?.toFixed(2)}ms\n`;
  summary += `${indent}  p95: ${httpReqDuration?.['p(95)']?.toFixed(2)}ms\n`;
  summary += `${indent}  p99: ${httpReqDuration?.['p(99)']?.toFixed(2)}ms\n`;
  summary += `${indent}  max: ${httpReqDuration?.max?.toFixed(2)}ms\n\n`;

  // Error rate
  const errorRate = metrics.errors?.values?.rate || 0;
  const errorColor = errorRate < 0.05 ? green : red;
  summary += `${indent}Error Rate: ${errorColor}${(errorRate * 100).toFixed(2)}%${reset}\n\n`;

  // Thresholds
  const thresholds = data.root_group?.checks || [];
  const passedChecks = thresholds.filter((c) => c.passes > 0).length;
  const totalChecks = thresholds.length;
  summary += `${indent}Checks Passed: ${passedChecks}/${totalChecks}\n`;

  return summary;
}
