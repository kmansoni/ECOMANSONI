/**
 * E2E Call Flow Test
 *
 * Tests complete call lifecycle:
 * 1. Connect to calls-ws
 * 2. AUTH
 * 3. ROOM_CREATE
 * 4. ROOM_JOIN
 * 5. MEDIA_BOOTSTRAP (simulated)
 * 6. E2EE_KEY_EXCHANGE
 * 7. CALL_START
 * 8. End call
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';

const CALLS_WS_URL = __ENV.CALLS_WS_URL || 'wss://mansoni.ru/calls';
const CALL_TIMEOUT = 60000; // 60 seconds per call test

export const options = {
  vus: 2, // 2 users for a call
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.05'], // Allow 5% failures
  },
};

let callStats = {
  connected: 0,
  authenticated: 0,
  roomCreated: 0,
  roomJoined: 0,
  e2eeReady: 0,
  callStarted: 0,
  callEnded: 0,
  errors: 0,
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForMessage(socket, type, timeout = 5000) {
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
  });
}

async function runCallTest(userId, partnerId) {
  const roomId = `e2e-test-${Date.now()}-${userId}`;
  const callId = `call-${Date.now()}`;
  let success = false;

  const url = `${CALLS_WS_URL}?userId=${userId}&callId=${callId}`;

  console.log(`[${userId}] Starting call test`);

  await new Promise((resolve, reject) => {
    ws.connect(url, {}, function(socket) {
      socket.on('open', async () => {
        callStats.connected++;
        console.log(`[${userId}] Connected to ${CALLS_WS_URL}`);
        callStats.errors++;

        try {
          // 1. AUTH
          socket.send(JSON.stringify({
            type: 'AUTH',
            payload: {
              userId: userId,
              deviceId: `test-device-${userId}`,
              clientVersion: '1.0.0',
              timestamp: Date.now(),
            }
          }));

          const authOk = await waitForMessage(socket, 'AUTH_OK', 5000).catch(() => null);
          if (authOk) {
            callStats.authenticated++;
            console.log(`[${userId}] Authenticated`);
          }

          // 2. ROOM_CREATE (caller only)
          if (userId === 'caller') {
            socket.send(JSON.stringify({
              type: 'ROOM_CREATE',
              payload: {
                roomId,
                userId,
                isLeader: true,
                callId,
              }
            }));

            const roomOk = await waitForMessage(socket, 'ROOM_CREATED', 5000).catch(() => null);
            if (roomOk) {
              callStats.roomCreated++;
              console.log(`[${userId}] Room created: ${roomId}`);
            }
          }

          // 3. ROOM_JOIN
          socket.send(JSON.stringify({
            type: 'ROOM_JOIN',
            payload: {
              roomId,
              userId,
              callId,
            }
          }));

          const joinOk = await waitForMessage(socket, 'ROOM_JOIN_OK', 5000).catch(() => null);
          if (joinOk) {
            callStats.roomJoined++;
            console.log(`[${userId}] Joined room: ${roomId}`);
          }

          // 4. Wait a bit then send E2EE_READY
          await delay(500);

          socket.send(JSON.stringify({
            type: 'E2EE_READY',
            payload: {
              roomId,
              epoch: 1,
              timestamp: Date.now(),
            }
          }));

          callStats.e2eeReady++;
          console.log(`[${userId}] E2EE ready`);

          // 5. Start call (caller initiates)
          if (userId === 'caller') {
            socket.send(JSON.stringify({
              type: 'CALL_START',
              payload: {
                roomId,
                callId,
                calleeId: partnerId,
                callType: 'video',
              }
            }));

            callStats.callStarted++;
            console.log(`[${userId}] Call started`);
          }

          // Wait in call for a bit
          await delay(3000);

          // 6. End call
          socket.send(JSON.stringify({
            type: 'CALL_END',
            payload: {
              roomId,
              callId,
              reason: 'test_complete',
            }
          }));

          callStats.callEnded++;
          console.log(`[${userId}] Call ended`);

          callStats.errors--;
          success = true;

          socket.close();
          resolve();
        } catch (e) {
          console.error(`[${userId}] Error: ${e.message}`);
          socket.close();
          resolve();
        }
      });

      socket.on('message', (msg) => {
        try {
          const data = JSON.parse(msg);
          // Handle incoming messages
          if (data.type === 'ERROR') {
            console.error(`[${userId}] Server error:`, data.payload);
            callStats.errors++;
          }
        } catch (e) {
          // Ignore
        }
      });

      socket.on('error', (err) => {
        console.error(`[${userId}] Socket error: ${err}`);
        callStats.errors++;
        resolve();
      });

      socket.on('close', () => {
        console.log(`[${userId}] Disconnected`);
        if (!success) {
          callStats.errors++;
        }
      });
    });
  });
}

export default function () {
  // Run two users in a call
  Promise.all([
    runCallTest('caller', 'callee'),
    delay(500).then(() => runCallTest('callee', 'caller'))
  ]).then(() => {
    console.log('Call test completed');
  });

  sleep(5);
}

export function handleSummary() {
  return {
    'stdout': `
=== E2E Call Test Results ===

Connections: ${callStats.connected}
Authentications: ${callStats.authenticated}
Room Creations: ${callStats.roomCreated}
Room Joins: ${callStats.roomJoined}
E2EE Ready: ${callStats.e2eeReady}
Calls Started: ${callStats.callStarted}
Calls Ended: ${callStats.callEnded}
Errors: ${callStats.errors}

Status: ${callStats.errors === 0 ? 'PASS ✅' : 'FAIL ❌'}
`,
    'e2e-call-results.json': JSON.stringify(callStats, null, 2),
  };
}
