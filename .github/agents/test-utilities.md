# Test Utilities and Shared Infrastructure

## Common Test Utilities

### 1. Test Data Factories
```typescript
// factories/index.ts
import { Factory } from 'rosie';
import faker from 'faker';

// User factory
export const userFactory = Factory.define('user')
  .attr('id', () => faker.datatype.uuid())
  .attr('email', () => faker.internet.email())
  .attr('phone', () => faker.phone.phoneNumber())
  .attr('profile', () => profileFactory.build())
  .attr('createdAt', () => faker.date.past())
  .attr('updatedAt', () => faker.date.recent());

// Profile factory
export const profileFactory = Factory.define('profile')
  .attr('firstName', () => faker.name.firstName())
  .attr('lastName', () => faker.name.lastName())
  .attr('avatar', () => faker.internet.avatar())
  .attr('bio', () => faker.lorem.paragraph());

// Message factory
export const messageFactory = Factory.define('message')
  .attr('id', () => faker.datatype.uuid())
  .attr('content', () => faker.lorem.sentence())
  .attr('type', () => faker.helpers.arrayElement(['text', 'image', 'video']))
  .attr('senderId', () => faker.datatype.uuid())
  .attr('chatId', () => faker.datatype.uuid())
  .attr('timestamp', () => faker.date.recent())
  .attr('encrypted', true)
  .attr('status', 'delivered');

// Chat factory
export const chatFactory = Factory.define('chat')
  .attr('id', () => faker.datatype.uuid())
  .attr('type', () => faker.helpers.arrayElement(['dm', 'group', 'channel']))
  .attr('name', () => faker.lorem.words(3))
  .attr('participants', () => userFactory.buildList(2))
  .attr('messages', () => messageFactory.buildList(20))
  .attr('createdAt', () => faker.date.past())
  .attr('updatedAt', () => faker.date.recent());

// Product factory
export const productFactory = Factory.define('product')
  .attr('id', () => faker.datatype.uuid())
  .attr('name', () => faker.commerce.productName())
  .attr('description', () => faker.commerce.productDescription())
  .attr('price', () => faker.commerce.price())
  .attr('images', () => [faker.image.imageUrl(), faker.image.imageUrl()])
  .attr('category', () => faker.commerce.department())
  .attr('stock', () => faker.datatype.number({ min: 0, max: 100 }));

// Location factory
export const locationFactory = Factory.define('location')
  .attr('id', () => faker.datatype.uuid())
  .attr('lat', () => faker.location.latitude())
  .attr('lng', () => faker.location.longitude())
  .attr('address', () => faker.location.streetAddress())
  .attr('city', () => faker.location.city())
  .attr('country', () => faker.location.country());
```

### 2. Mock Services
```typescript
// mocks/supabase-mock.ts
export const createSupabaseMock = () => ({
  from: jest.fn(() => ({
    select: jest.fn(() => Promise.resolve({ data: [], error: null })),
    insert: jest.fn(() => Promise.resolve({ data: [], error: null })),
    update: jest.fn(() => Promise.resolve({ data: [], error: null })),
    delete: jest.fn(() => Promise.resolve({ data: [], error: null })),
    eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
  })),
  auth: {
    signIn: jest.fn(),
    signOut: jest.fn(),
    getUser: jest.fn(),
  },
  realtime: {
    channel: jest.fn(() => ({
      on: jest.fn(),
      subscribe: jest.fn(),
    })),
  },
});

// mocks/websocket-mock.ts
export const createWebSocketMock = () => ({
  send: jest.fn(),
  on: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
});

// mocks/geolocation-mock.ts
export const createGeolocationMock = (accuracy = 3) => ({
  getCurrentPosition: jest.fn((success) =>
    success({
      coords: {
        latitude: 55.7558,
        longitude: 37.6176,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
  ),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
});
```

### 3. Test Helpers
```typescript
// helpers/time-helpers.ts
export const advanceTime = (ms: number) => {
  jest.advanceTimersByTime(ms);
};

export const waitFor = (condition: () => boolean, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout'));
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
};

// helpers/network-helpers.ts
export const simulateNetworkConditions = (conditions: {
  latency?: number;
  download?: number;
  upload?: number;
  offline?: boolean;
}) => {
  // Chrome DevTools Protocol simulation
  return page.emulateNetworkConditions(conditions);
};

// helpers/media-helpers.ts
export const createMockFile = (name: string, size: number, type: string) => {
  const buffer = Buffer.alloc(size);
  return new File([buffer], name, { type });
};
```

## Test Configuration

### Jest Configuration
```typescript
// jest.config.ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/test/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Cypress Configuration
```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on, config) {
      on('task', {
        seedDatabase: require('./cypress/tasks/seed'),
      });
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,ts,jsx,tsx}',
    supportFile: 'cypress/support/e2e.ts',
  },
});
```

## Visual Regression Testing
```typescript
// cypress/support/visual-regression.ts
import { addMatchImageSnapshotPlugin } from '@simonsmith/cypress-image-snapshot/plugin';

export const configureVisualRegression = () => {
  addMatchImageSnapshotPlugin();
  
  Cypress.Commands.add('matchImageSnapshot', {
    prevSubject: true,
  }, (subject, name, options = {}) => {
    cy.wrap(subject).matchImageSnapshot(name, {
      failureThreshold: 0.01,
      failureThresholdType: 'percent',
      ...options,
    });
  });
};
```

## Test Coverage Reports

### Coverage Collection
```bash
# Generate coverage report
npm run test:coverage

# View coverage report
npm run coverage:report

# Upload to Codecov
npx codecov --token=$CODECOV_TOKEN
```

### Coverage Enforcement
```yaml
# .github/workflows/coverage.yml
name: Coverage Check
on: [pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          fail_ci_if_error: true
          coverage-summary: true
```

## Performance Testing Setup

### k6 Load Tests
```javascript
// load/messenger-chat.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.post('http://localhost:3000/api/messages', JSON.stringify({
    chatId: 'test-chat',
    content: 'Test message',
  }));
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'delivery time < 100ms': (r) => r.timings.duration < 100,
  });
  
  sleep(1);
}
```

### Artillery Tests
```yaml
# tests/sfu-capacity.yaml
config:
  target: "wss://sfu.example.com"
  phases:
    - duration: 60
      arrivalRate: 10
  ws:
    rejectUnauthorized: false

scenarios:
  - engine: "ws"
    flow:
      - send: '{"type":"join","room":"test"}'
      - think: 5
      - send: '{"type":"media","data":"..."}'
      - loop:
          - think: 1
          - send: '{"type":"ping"}'
        while:
          - "true"
```