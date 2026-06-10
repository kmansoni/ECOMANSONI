# Load and Chaos Testing for Calls WebSocket Server

This directory contains load tests and chaos experiments for the calls-ws WebSocket server.

## Prerequisites

```bash
# Install k6 for load testing
npm install -g k6

# Or use Docker
docker pull grafana/k6:latest
```

## Load Tests

### Basic Connection Load Test

```bash
k6 run k6/connections.js
```

Tests:
- Simultaneous WebSocket connections
- Connection rate (connections per second)
- Message throughput

### Signaling Load Test

```bash
k6 run k6/signaling.js
```

Tests:
- Room creation/join/leave
- Call invitation flow
- E2EE handshake under load

### E2EE Handshake Load Test

```bash
k6 run k6/e2ee-handshake.js
```

Tests:
- Key exchange performance
- Session establishment latency
- Concurrent key exchanges

## Chaos Experiments

### Redis Failure

```bash
k6 run k6/chaos/redis-failure.js
```

Simulates:
- Redis connection loss
- Recovery behavior
- Stale data handling

### Network Partition

```bash
k6 run k6/chaos/network-partition.js
```

Simulates:
- Connection drops
- Reconnection behavior
- Message loss

### SFU Kill

```bash
k6 run k6/chaos/sfu-kill.js
```

Simulates:
- SFU process crash mid-call
- Media session recovery
- Call continuity

## Running All Tests

```bash
npm run test:calls:load
npm run test:calls:chaos
```

## Metrics to Monitor

- Connection success rate
- Message latency (p50, p95, p99)
- Error rate by type
- Memory usage
- CPU usage
- Redis connection pool usage
- Active rooms count
