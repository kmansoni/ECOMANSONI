/**
 * k6 Load Test: WebSocket Connections
 *
 * Tests the calls-ws server under connection load.
 *
 * Usage:
 *   k6 run k6/connections.js
 *   k6 run k6/connections.js --vus 100 --duration 30s
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import http from 'k6/http';

const CALLS_WS_URL = __ENV.CALLS_WS_URL || 'wss://mansoni.ru/calls';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '50', 10);
const RAMP_UP_DURATION = '30s';
const SUSTAIN_DURATION = '60s';
const RAMP_DOWN_DURATION = '20s';

export const options = {
  scenarios: {
    connections: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: RAMP_UP_DURATION, target: TARGET_VUS },
        { duration: SUSTAIN_DURATION, target: TARGET_VUS },
        { duration: RAMP_DOWN_DURATION, target: 0 },
      ],
    },
  },
  thresholds: {
    // HTTP request errors should be < 1%
    http_req_failed: ['rate<0.01'],
  },
};

const metrics = {
  connect_success: 0,
  connect_fail: 0,
  messages_sent: 0,
  messages_received: 0,
  errors: 0,
};

function generateAuthToken(userId) {
  // In production, this would call your auth service
  return `test-token-${userId}-${Date.now()}`;
}

export default function () {
  const userId = `load-test-${__VU}-${__ITER}`;
  const url = `${CALLS_WS_URL}?token=${encodeURIComponent(generateAuthToken(userId))}`;

  metrics.connect_success++;
  const startTime = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      metrics.messages_sent++;
      socket.send(JSON.stringify({
        type: 'HELLO',
        payload: {
          deviceId: `device-${userId}`,
          clientVersion: '1.0.0',
          sessionStart: Date.now(),
        }
      }));
    });

    socket.on('message', (msg) => {
      metrics.messages_received++;
      const latency = Date.now() - startTime;

      // Log slow messages
      if (latency > 500) {
        console.log(`Slow message: ${latency}ms`);
      }
    });

    socket.on('error', (err) => {
      metrics.errors++;
      console.error(`WebSocket error: ${err}`);
    });

    socket.on('close', () => {
      check(socket, {
        'connection closed gracefully': () => true,
      });
    });

    // Stay connected for a bit
    sleep(Math.random() * 5 + 2);

    // Close gracefully
    socket.close();
  });

  check(res, {
    'connection successful': (r) => r && r.status === 0,
    'no error': (r) => !r || r.status === 0,
  }) || metrics.connect_fail++;
}

export function handleSummary(data) {
  const successRate = metrics.connect_success /
    (metrics.connect_success + metrics.connect_fail);

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify({
      metrics,
      successRate,
      timestamp: new Date().toISOString(),
    }, null, 2),
  };
}

function textSummary(data, opts) {
  const indent = opts.indent || '';
  let output = '\n';

  output += `${indent}=== Calls WS Load Test Results ===\n\n`;
  output += `${indent}Connections:\n`;
  output += `${indent}  Success: ${metrics.connect_success}\n`;
  output += `${indent}  Failed: ${metrics.connect_fail}\n`;
  output += `${indent}  Success Rate: ${(successRate * 100).toFixed(2)}%\n\n`;
  output += `${indent}Messages:\n`;
  output += `${indent}  Sent: ${metrics.messages_sent}\n`;
  output += `${indent}  Received: ${metrics.messages_received}\n\n`;
  output += `${indent}Errors:\n`;
  output += `${indent}  Total: ${metrics.errors}\n`;
  output += `${indent}  Error Rate: ${((metrics.errors / metrics.connect_success) * 100).toFixed(2)}%\n`;

  return output;
}
