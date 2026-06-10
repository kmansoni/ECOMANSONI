/**
 * k6 Chaos Test: Network Partition Simulation
 */

import ws from 'k6/ws';
import { sleep } from 'k6';

const CALLS_WS_URL = __ENV.CALLS_WS_URL || 'wss://mansoni.ru/calls';

export const options = {
  vus: 30,
  duration: '2m',
  thresholds: {
    reconnection_success: ['rate>0.90'],
    session_preservation: ['rate>0.85'],
  },
};

const metrics = {
  initial_connect_success: 0,
  initial_connect_fail: 0,
  partition_detected: 0,
  reconnection_success: 0,
  reconnection_fail: 0,
  session_preserved: 0,
  session_lost: 0,
};

export default function () {
  const userId = `network-chaos-${__VU}-${__ITER}`;
  const roomId = `network-room-${userId}-${Date.now()}`;
  const url = `${CALLS_WS_URL}?token=${encodeURIComponent(`test-${userId}`)}`;

  let sessionId = null;
  let roomJoined = false;

  ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      metrics.initial_connect_success++;

      socket.send(JSON.stringify({
        type: 'AUTH',
        payload: { deviceId: `device-${userId}`, userId }
      }));

      socket.send(JSON.stringify({
        type: 'ROOM_CREATE',
        payload: { roomId, userId, isLeader: true }
      }));

      socket.on('message', (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data.type === 'ROOM_JOIN_OK') {
            sessionId = data.payload?.sessionId;
            roomJoined = true;
          }
        } catch (e) {}
      });
    });

    socket.on('error', () => metrics.initial_connect_fail++);

    sleep(5 + Math.random() * 5);

    if (roomJoined) {
      metrics.partition_detected++;
      socket.close(1000, 'simulated-partition');

      sleep(2 + Math.random() * 3);

      ws.connect(url, {}, function (reconnectedSocket) {
        reconnectedSocket.on('open', () => {
          metrics.reconnection_success++;

          reconnectedSocket.send(JSON.stringify({
            type: 'AUTH',
            payload: { deviceId: `device-${userId}`, userId }
          }));

          reconnectedSocket.send(JSON.stringify({
            type: 'ROOM_JOIN',
            payload: { roomId, userId, sessionId }
          }));

          reconnectedSocket.on('message', (msg) => {
            try {
              const data = JSON.parse(msg);
              if (data.type === 'ROOM_JOIN_OK') {
                metrics.session_preserved++;
              } else if (data.type === 'ERROR') {
                metrics.session_lost++;
              }
            } catch (e) {}
          });

          reconnectedSocket.on('error', () => metrics.reconnection_fail++);
          sleep(3);
          reconnectedSocket.close();
        });

        reconnectedSocket.on('error', () => metrics.reconnection_fail++);
      });
    } else {
      socket.close();
    }
  });
}

export function handleSummary() {
  const reconnections = metrics.reconnection_success + metrics.reconnection_fail;
  return {
    'stdout': `Network Partition Test: Reconnections ${metrics.reconnection_success}/${reconnections}, Session preserved ${metrics.session_preserved}/${metrics.session_preserved + metrics.session_lost}`,
    'network-chaos-results.json': JSON.stringify({ metrics }, null, 2),
  };
}
