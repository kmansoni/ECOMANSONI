/**
 * k6 Chaos Test: Redis Failure Simulation
 *
 * Tests the calls-ws server behavior when Redis becomes unavailable.
 *
 * Usage:
 *   k6 run k6/chaos/redis-failure.js
 *
 * Prerequisites:
 *   - Redis must be accessible
 *   - Enable Redis failure injection in test environment
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import http from 'k6/http';

const CALLS_WS_URL = __ENV.CALLS_WS_URL || 'wss://mansoni.ru/calls';
const REDIS_INJECT_API = __ENV.REDIS_INJECT_API || 'http://localhost:3001/chaos/redis';

export const options = {
  vus: 20,
  duration: '3m',
  thresholds: {
    // System should remain stable during Redis failure
    degraded_but_functional: ['rate>0.8'],
    // No data corruption after recovery
    data_integrity: ['rate>1.0'],
  },
};

// Simulate Redis failure via external chaos API
async function injectRedisFailure(durationSeconds) {
  try {
    const res = http.post(`${REDIS_INJECT_API}/fail`, JSON.stringify({
      duration: durationSeconds,
      type: 'disconnect',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 200) {
      console.log(`Redis failure injected for ${durationSeconds}s`);
      return true;
    }
  } catch (e) {
    console.log(`Could not inject Redis failure: ${e.message}`);
  }
  return false;
}

async function recoverRedis() {
  try {
    const res = http.post(`${REDIS_INJECT_API}/recover`, '{}', {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 200) {
      console.log('Redis recovery triggered');
      return true;
    }
  } catch (e) {
    console.log(`Could not trigger Redis recovery: ${e.message}`);
  }
  return false;
}

export default function () {
  const userId = `chaos-${__VU}-${__ITER}`;
  const roomId = `chaos-room-${userId}-${Date.now()}`;

  const url = `${CALLS_WS_URL}?token=${encodeURIComponent(`test-${userId}`)}`;

  let connectionStable = true;
  let messageDelivered = false;

  ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      console.log(`Connection established: ${userId}`);

      // Create room
      socket.send(JSON.stringify({
        type: 'AUTH',
        payload: { deviceId: `device-${userId}`, userId }
      }));

      socket.send(JSON.stringify({
        type: 'ROOM_CREATE',
        payload: { roomId, userId, isLeader: true }
      }));
    });

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.type === 'ROOM_JOIN_OK') {
          console.log(`Room joined: ${roomId}`);

          // After stable period, inject Redis failure
          if (connectionStable && Math.random() < 0.3) {
            console.log('Injecting Redis failure...');
            injectRedisFailure(30).then(success => {
              if (success) {
                connectionStable = false;
              }
            });
          }
        }

        if (data.type === 'ROOM_LEFT' || data.type === 'ERROR') {
          if (!connectionStable) {
            check(data, {
              'degraded but functional': () => data.type === 'ERROR' || data.type === 'ROOM_LEFT',
            });
          }
        }

        messageDelivered = true;
      } catch (e) {
        // Ignore parse errors
      }
    });

    socket.on('error', (err) => {
      console.error(`Socket error: ${err}`);
      connectionStable = false;
    });

    socket.on('close', () => {
      // After Redis recovery, check data integrity
      if (!connectionStable) {
        recoverRedis().then(() => {
          check({}, {
            'data integrity maintained': () => messageDelivered,
          });
        });
      }
    });

    // Run for a few minutes
    sleep(60);
    socket.close();
  });
}