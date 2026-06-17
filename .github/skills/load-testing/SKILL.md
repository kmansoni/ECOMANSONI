---
name: "Load Testing"
description: "Performance testing under load. Use when: validating scalability, finding bottlenecks, or setting performance baselines."
---

# Load Testing

Performance testing to validate system under load.

## Tools

| Tool | Use Case | Pros |
|------|----------|------|
| k6 | API/UI load | Scriptable, CI/CD friendly |
| Artillery | API testing | YAML config |
| Playwright | UI load | Real browser |
| ab (Apache Bench) | Quick smoke test | Simple |

## k6 Script

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],      // <1% errors
  },
};

export default function () {
  const res = http.get('http://localhost:8080/api/messages');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

## Running

```bash
# Install k6
npm install -g k6

# Run test
k6 run load-test.js

# With environment
k6 run -e TARGET_URL=https://api.mansoni.com load-test.js
```

## Key Metrics

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| p95 latency | < 200ms | 200-500ms | > 500ms |
| Error rate | < 1% | 1-5% | > 5% |
| Throughput | > 100 RPS | 50-100 RPS | < 50 RPS |

## For Mansoni Chat API

```javascript
// Chat load test
export const options = {
  scenarios: {
    chat: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '5m', target: 50 },
      ],
    },
  },
};

export default function () {
  // Send message
  http.post('http://localhost:8080/api/messages', JSON.stringify({
    content: `Load test message ${__VU}`,
    channel_id: 'test-channel',
  }), { headers: { 'Content-Type': 'application/json' } });

  // Fetch messages
  http.get('http://localhost:8080/api/messages?channel=test-channel');
}
```

## Analyzing Results

```
     ✓ http_req_duration... avg=145ms p(95)=298ms
     ✓ http_req_failed... 0.5% (5/1000)
     ✓ iterations... 1000
```

Monitor for:
- Memory growth
- Connection pool exhaustion
- Error rate spikes
- Latency degradation