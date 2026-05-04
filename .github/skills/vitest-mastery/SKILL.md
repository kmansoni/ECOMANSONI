---
name: vitest-mastery
description: |
  Vitest testing mastery: unit tests, mocks, spies, timers, fixtures, coverage. 
  Use when: vitest, unit testing, test setup, mocking, test patterns.
license: Apache 2.0
---

# Vitest Mastery — Правильные unit тесты

Vitest testing для TypeScript/React. Быстрый, совместим с Vite.

## Когда использовать

- Unit тесты для hooks и components
- Mocking Supabase и async функций
- Timer-based тесты (debounce, polling)
- Coverage targets 80%+

## Basic Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '~': resolve(__dirname, './src')
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
});
```

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});
```

## Mocking Patterns

```typescript
// Mocking Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null })
};

vi.mock('~/lib/supabase', () => ({
  supabase: mockSupabase
}));

// Mocking timers
vi.useFakeTimers();
act(() => {
  vi.advanceTimersByTime(1000);
});
vi.useRealTimers();
```

## Testing Hooks

```typescript
// src/hooks/__tests__/useMessages.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useMessages } from '../useMessages';

describe('useMessages', () => {
  it('should fetch messages on mount', async () => {
    const mockMessages = [{ id: 1, text: 'Hello' }];
    mockSupabase.select.mockResolvedValueOnce({ data: mockMessages, error: null });
    
    const { result } = renderHook(() => useMessages('channel-1'));
    
    expect(result.current.isLoading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.messages).toEqual(mockMessages);
      expect(result.current.isLoading).toBe(false);
    });
  });
  
  it('should handle errors', async () => {
    mockSupabase.select.mockResolvedValueOnce({ 
      data: null, 
      error: new Error('Network error') 
    });
    
    const { result } = renderHook(() => useMessages('channel-1'));
    
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});
```

## Snapshot Testing

```typescript
// Component snapshot
import { render } from '@testing-library/react';
import { UserCard } from '../UserCard';

it('renders correctly', () => {
  const { container } = render(<UserCard user={{ name: 'Test', id: '1' }} />);
  expect(container).toMatchSnapshot();
});

// Update snapshots: vitest -u
```

## Spy/Mock Assertions

```typescript
const mockFn = vi.fn();

// Call tracking
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(3);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');

// Mock implementation
mockFn.mockReturnValue(42);
mockFn.mockResolvedValue({ data: 'value' });
mockFn.mockImplementation((x) => x * 2);

// Clear/reset
mockFn.mockClear(); // Clear calls but keep implementation
mockFn.mockReset(); // Clear calls and implementation
```

## Fixtures

```typescript
// src/test/fixtures.ts
export const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com'
};

export const mockMessage = {
  id: 'msg-1',
  text: 'Hello world',
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z'
};

// Usage in test
import { mockUser, mockMessage } from '~/test/fixtures';
```

## Coverage Exclusion

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/main.tsx',
        'src/test/**',
        '**/*.d.ts',
        '**/*.config.*',
        'src/vite-env.d.ts'
      ]
    }
  }
});
```

## Common Patterns

```typescript
// Async effect testing
it('should refetch on interval', async () => {
  vi.useFakeTimers();
  
  renderHook(() => usePolling());
  vi.advanceTimersByTime(5000);
  
  expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + interval
  
  vi.useRealTimers();
});

// Cleanup
afterEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});
```

## CLI

```bash
# Run tests
vitest

# Run specific test
vitest src/hooks/__tests__/useAuth.test.ts

# Coverage
vitest run --coverage

# Watch mode
vitest --watch

# UI mode
vitest --ui
```

## Checklist

- [ ] vitest.config.ts с jsdom environment
- [ ] setupFiles для jest-dom
- [ ] Mocking Supabase/MCP с vi.mock
- [ ] Timer mocking для debounce/polling
- [ ] Coverage thresholds 80%+
- [ ] Fixtures для тестовых данных
- [ ] afterEach cleanup с mockClear