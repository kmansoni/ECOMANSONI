# Test Implementation Guide

## Quick Start

### Setting Up Test Environment

```bash
# Install core dependencies
npm install

# Install AI Security Testing Framework
bash scripts/setup-ai-testing.sh

# Initialize test databases
npm run test:db:init

# Run all tests
npm test

# Run AI-enhanced security tests
npm run security:scan
npm run security:promptfoo
npm run test:ai-generate
```

### Domain-Specific Setup (Enhanced)

```bash
# Messenger tests with AI security scanning
npm run security:scan && npm test -- messenger

# Instagram tests with promptfoo validation  
npx promptfoo run --config tests/ai-features/instagram-llm.yaml
npm test -- instagram

# Navigator tests in Firecracker MicroVM
npm run test:microvm -- navigator

# Shop tests with AR validation
npm test -- shop --ar-validation

# Taxi tests with location simulation
gps-simulator test/taxi-routes/ && npm test -- taxi

# Insurance tests with compliance checking
npm test -- insurance --compliance-check

# Calls/SFU tests with media analysis
npm test -- calls --media-quality
```

### AI Security Integration

```bash
# Full security pipeline
npm run test:ai-full

# Individual components
npm run security:scan          # Agentic Security vulnerability scan
npm run security:promptfoo     # LLM feature validation  
npm run test:ai-generate       # AI-generated test creation
npm run test:microvm           # Firecracker isolated execution
```
# Run specific domain tests
npm run test:messenger
npm run test:instagram
npm run test:navigator
npm run test:shop
npm run test:taxi
npm run test:insurance
npm run test:calls

# Run E2E tests
npm run test:e2e

# Run with coverage
npm run test:coverage
```

## Domain-Specific Setup

### Messenger Testing
```bash
# Unit tests for messaging
npm test -- messenger

# E2E chat scenarios
cypress run --spec cypress/e2e/messenger

# WebSocket stress tests
k6 run load/messenger-chat.js

# Encryption tests
npm test -- messenger-encryption.spec.ts
```

### Instagram Testing
```bash
# Feed algorithm tests
npm test -- instagram-feed

# Media processing tests
npm test -- instagram-media

# Story feature tests
npm test -- instagram-stories

# Reels tests
npm test -- instagram-reels
```

### Navigator Testing
```bash
# Map rendering tests
npm test -- navigator-map

# Routing algorithm tests
npm test -- navigator-routing

# Voice guidance tests
npm test -- navigator-voice

# GPS simulation tests
gps-simulator test/routes/
```

### Shop Testing
```bash
# Cart functionality tests
npm test -- shop-cart

# Checkout flow tests
npm test -- shop-checkout

# Payment processing tests
npm test -- shop-payment

# AR feature tests
npm test -- shop-ar
```

### Taxi Testing
```bash
# Booking flow tests
npm test -- taxi-booking

# Driver matching tests
npm test -- taxi-matching

# Payment tests
npm test -- taxi-payment

# Location tracking tests
gps-simulator test/taxi-routes/
```

### Insurance Testing
```bash
# Policy management tests
npm test -- insurance-policy

# Claims processing tests
npm test -- insurance-claims

# Pricing calculation tests
npm test -- insurance-pricing

# Underwriting tests
npm test -- insurance-underwriting
```

### Calls/SFU Testing
```bash
# WebRTC connection tests
npm test -- calls-webrtc

# SFU capacity tests
npm test -- calls-sfu

# Media quality tests
npm test -- calls-media

# Encryption tests
npm test -- calls-encryption

# Load tests
k6 run load/calls-group.js
```

## Test Data Management

### Seeding Test Data
```bash
# Seed all domains
npm run db:seed:all

# Seed specific domain
npm run db:seed:messenger
npm run db:seed:instagram
npm run db:seed:navigator
npm run db:seed:shop
npm run db:seed:taxi
npm run db:seed:insurance
npm run db:seed:calls
```

### Generating Test Data
```typescript
// Generate messenger test data
npm run generate:messenger-data -- --count 1000

// Generate Instagram test data
npm run generate:instagram-data -- --users 100 --posts 1000

// Generate Navigator test data
npm run generate:navigator-data -- --routes 50

// Generate Shop test data
npm run generate:shop-data -- --products 500

// Generate Taxi test data
npm run generate:taxi-data -- --drivers 50

// Generate Insurance test data
npm run generate:insurance-data -- --policies 1000

// Generate Calls test data
npm run generate:calls-data -- --sessions 100
```

## CI/CD Integration

### Local Development Workflow
```bash
# Run tests before commit
npm run test:changed

# Run full test suite
npm run test:full

# Generate coverage report
npm run coverage:html

# Upload coverage
npm run coverage:upload
```

### Pre-commit Checks
```bash
# Lint and type check
npm run lint
npm run type-check

# Run unit tests
npm run test:unit

# Run component tests
npm run test:component

# Validate test coverage
npm run test:coverage-check
```

### GitHub Actions Workflow
```yaml
name: Test Pipeline

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        domain: [messenger, instagram, navigator, shop, taxi, insurance, calls]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ${{ matrix.domain }} tests
        run: npm test -- ${{ matrix.domain }}
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: coverage/${{ matrix.domain }}/coverage-final.json
```

## Test Execution Patterns

### Running Specific Tests
```bash
# Test specific file
npm test -- chat.spec.ts

# Test specific describe block
npm test -- --testNamePattern="Chat Encryption"

# Test specific domain
npm test -- messenger --testPathPattern="encryption"

# Run tests in watch mode
npm test -- messenger --watch
```

### Debugging Tests
```bash
# Run tests with verbose output
npm test -- messenger --verbose

# Run tests with debug logging
npm test -- messenger --debug

# Run tests with browser devtools
npm test -- messenger --inspect
```

### Performance Testing
```bash
# Run load tests
k6 run load/messenger-chat.js
k6 run load/instagram-feed.js
k6 run load/navigator-routing.js

# Run stress tests
artillery run tests/stress/messenger.yaml
artillery run tests/stress/instagram.yaml

# Run soak tests
npm run test:soak -- messenger
```

## Test Result Analysis

### Coverage Reports
```bash
# Generate HTML coverage report
npm run coverage:html

# Generate JSON coverage report
npm run coverage:json

# View coverage summary
npm run coverage:summary
```

### Test Metrics
```bash
# View test execution time
npm run test:timing

# View flaky tests
npm run test:flaky

# View test reliability
npm run test:reliability
```

## Troubleshooting

### Common Issues

#### Tests failing due to timing
```typescript
// Increase timeout
jest.setTimeout(30000);

// Or use waitFor helper
await waitFor(() => condition, 10000);
```

#### Database connection issues
```typescript
// Ensure test database is running
npm run db:test:start

// Reset test database
npm run db:test:reset
```

#### Mock not working
```typescript
// Clear all mocks
jest.clearAllMocks();

// Reset modules
jest.resetModules();
```

## Best Practices

### Test Structure
```typescript
describe('Feature Name', () => {
  beforeEach(async () => {
    // Setup test data
    testData = await seedTestData();
  });

  afterEach(async () => {
    // Cleanup
    await cleanupTestData();
  });

  test('should do something', async () => {
    // Test implementation
    const result = await performAction();
    expect(result).toBe(expected);
  });

  test('should handle edge case', async () => {
    // Edge case test
  });
});
```

### Test Naming
```typescript
// Good
test('encrypts message with X3DH', ...)
test('validates chat schema v11', ...)
test('calculates optimal route with traffic', ...)

// Bad
test('encryption', ...) // too vague
test('test 1', ...) // meaningless
test('check', ...) // unclear
```

### Test Data
```typescript
// Use factories
const user = await userFactory.build();
const chat = await chatFactory.build({ participants: [user] });

// Not hardcoded values
const user = { id: '123', name: 'John' }; // ❌
```

## Maintenance

### Updating Test Data
```bash
# Regenerate test data
npm run generate:all-data

# Update test snapshots
npm test -- -u

# Update visual regression baselines
npm run test:visual-update
```

### Monitoring Test Health
```bash
# Check test reliability
npm run test:reliability -- --days 7

# View flaky tests
npm run test:flaky -- --threshold 0.1

# Monitor test duration
npm run test:duration -- --trend
```
