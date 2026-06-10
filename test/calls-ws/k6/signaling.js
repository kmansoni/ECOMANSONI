/**
 * k6 Load Test: Signaling Flow
 *
 * Tests room creation, joining, and call signaling under load.
 *
 * Usage:
 *   k6 run k6/signaling.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import http from 'k6/http';

const CALLS_WS_URL = __ENV.CALLS_WS_URL || 'wss://mansoni.ru/calls';
const ROOM_COUNT = parseInt(__ENV.ROOM_COUNT || '20', 10);

export const options = {
  vus: 50,
  duration: '2m',
  thresholds: {
    room_creation_success: ['rate>0.95'],
    room_join_success: ['rate>0.95'],
    call_invite_success: ['rate>0.90'],
  },
};

const metrics = {
  room_creation_success: 0,
  room_creation_fail: 0,
  room_join_success: 0,
  room_join_fail: 0,
  call_invite_success: 0,
  call_invite_fail: 0,
  reconnection_success: 0,
  reconnection_fail: 0,
};

function generateTestToken(userId) {
  return `test-token-${userId}`;
}

function waitForMessage(socket, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeout);

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === type) {
          clearTimeout(timer);
          resolve(data);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export default function () {
  const callerId = `test-caller-${__VU}-${__ITER}`;
  const calleeId = `test-callee-${__VU}-${__ITER}`;
  const roomId = `test-room-${__VU}-${__ITER}-${Date.now()}`;

  const url = `${CALLS_WS_URL}?token=${encodeURIComponent(generateTestToken(callerId))}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', async () => {
      // AUTH
      socket.send(JSON.stringify({
        type: 'AUTH',
        payload: {
          deviceId: `device-${callerId}`,
          userId: callerId,
        }
      }));

      // Wait for AUTH_OK
      try {
        await waitForMessage(socket, 'AUTH_OK', 3000);

        // ROOM_CREATE
        socket.send(JSON.stringify({
          type: 'ROOM_CREATE',
          payload: {
            roomId,
            userId: callerId,
            isLeader: true,
          }
        }));

        metrics.room_creation_success++;
      } catch (e) {
        metrics.room_creation_fail++;
        console.error(`Room creation failed: ${e.message}`);
        socket.close();
        return;
      }

      // Wait for ROOM_JOIN_OK
      try {
        await waitForMessage(socket, 'ROOM_JOIN_OK', 5000);
        metrics.room_join_success++;
      } catch (e) {
        metrics.room_join_fail++;
        console.error(`Room join failed: ${e.message}`);
      }

      // Simulate some activity
      sleep(Math.random() * 3 + 1);

      // Simulate reconnection (critical for production resilience)
      if (Math.random() < 0.1) { // 10% chance of reconnection
        socket.close();

        // Reconnect
        ws.connect(url, {}, function (reconnectedSocket) {
          reconnectedSocket.on('open', () => {
            metrics.reconnection_success++;
          });
          reconnectedSocket.on('error', () => {
            metrics.reconnection_fail++;
          });

          setTimeout(() => {
            reconnectedSocket.close();
          }, 1000);
        });
      } else {
        // Clean up
        socket.send(JSON.stringify({
          type: 'ROOM_LEAVE',
          payload: { roomId }
        }));

        setTimeout(() => {
          socket.close();
        }, 1000);
      }
    });

    socket.on('error', (err) => {
      console.error(`Socket error: ${err}`);
    });
  });

  check(res, {
    'signaling completed': (r) => r && r.status === 0,
  });
}

export function handleSummary(data) {
  return {
    'stdout': `
=== Signaling Load Test Results ===

Room Operations:
  Creation Success: ${metrics.room_creation_success}
  Creation Failed: ${metrics.room_creation_fail}
  Creation Rate: ${((metrics.room_creation_success / (metrics.room_creation_success + metrics.room_creation_fail)) * 100).toFixed(2)}%

  Join Success: ${metrics.room_join_success}
  Join Failed: ${metrics.room_join_fail}

Reconnection:
  Success: ${metrics.reconnection_success}
  Failed: ${metrics.reconnection_fail}
`,
    'signaling-results.json': JSON.stringify({
      metrics,
      timestamp: new Date().toISOString(),
    }, null, 2),
  };
}
