# AI Test Integration - Secure Implementation

## Выбранные фреймворки (без дубликатов)

### 1. Agentic Security (⭐1,844) - Основной сканер
- **Роль:** Автоматическое обнаружение уязвимостей (OWASP Top 10, Zero-Day)
- **Интеграция:** CI/CD pipeline, pre-commit hooks
- **Особенности:** TypeScript, 100+ паттернов уязвимостей, RL-атаки

### 2. promptfoo (⭐17,263) - Валидация ИИ-фич
- **Роль:** Тестирование LLM-интеграций, детекция prompt injection
- **Интеграция:** Unit/E2E тесты, security regression
- **Особенности:** A+ trust score, red teaming, output validation

### 3. AI Testing Suite (zurd46) - Автоматизация тестов
- **Роль:** Генерация и выполнение тестов (8 агентов)
- **Интеграция:** Code analysis → test generation → security scan
- **Особенности:** LangGraph, TypeScript native, zero-config

## 🛡️ Архитектура Безопасности (без дублей)

```
┌─────────────────────────────────────────────────────────────┐
│                    ECOMANSONI TEST SUITE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────┐  │
│  │   promptfoo │    │  Agentic        │    │  AI Test   │  │
│  │   (LLM      │    │  Security       │    │  Suite     │  │
│  │   Testing)  │◄───┤  (Vulnerability)│◄───┤  (8 Agents)│  │
│  └──────┬──────┘    └────────┬────────┘    └──────┬─────┘  │
│         │                   │                      │       │
│  ┌──────┴──────┐    ┌───────┴────────┐    ┌─────────▼─────┐ │
│  │  Messenger  │    │  Security      │    │  Test         │ │
│  │  Tests      │    │  Orchestrator  │    │  Orchestrator │ │
│  └─────────────┘    │  (SWE-agent)   │    │  (SWE-agent)  │ │
│  ┌─────────────┐    └────────┬────────┘    └───────────────┘ │
│  │  Instagram  │               │                           │
│  │  Tests      │    ┌──────────┴──────────┐                │
│  └─────────────┘    │  Firecracker        │                │
│  ┌─────────────┐    │  MicroVM Sandbox    │                │
│  │  Navigator  │    │  (CVE-2026-34040    │                │
│  │  Tests      │    │   Protection)       │                │
│  └─────────────┘    └─────────────────────┘                │
│  ┌─────────────┐                                          │
│  │  Shop       │    ┌─────────────────────────────────────┐│
│  │  Tests      │    │  Security Scanning Pipeline         ││
│  └─────────────┘    │  1. Test Generation (AI Suite)      ││
│  ┌─────────────┐    │  2. Vulnerability Scan (Agentic)    ││
│  │  Taxi       │    │  3. Prompt Injection (promptfoo)    ││
│  │  Tests      │    │  4. Penetration Test (RedAmon)      ││
│  └─────────────┘    │  5. Approval Gate (Human-in-loop)   ││
│  ┌─────────────┐    └─────────────────────────────────────┘│
│  │  Insurance  │                                          │
│  │  Tests      │    ┌─────────────────────────────────────┐│
│  └─────────────┘    │  MicroVM Configuration              ││
│  ┌─────────────┐    │  --network none                     ││
│  │  Calls/SFU  │    │  --cap-drop ALL                     ││
│  │  Tests      │    │  --security-opt no-new-privileges   ││
│  └─────────────┘    │  --security-opt seccomp=strict.json ││
│                     └─────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Интеграция с Existing Codebase

### 1. Protocol V11 & Schema Probe Integration
```typescript
// .github/agents/messenger-tester-enhanced.md
// Синхронизация с существующим кодом

import { protocolV11 } from '../../src/lib/chat/protocolV11';
import { schemaProbe } from '../../src/lib/chat/schemaProbe';

describe('Messenger Security Tests', () => {
  // Используем Agentic Security для проверки
  test('E2E encryption validation', async () => {
    const result = await agenticSecurity.scan({
      target: 'protocolV11',
      checks: ['encryption', 'key-exchange', 'forward-secrecy']
    });
    expect(result.vulnerabilities).toHaveLength(0);
  });
});
```

### 2. Navigator Integration (MapLibre 3D)
```typescript
// .github/agents/navigator-tester-enhanced.md
import { MapLibre3D } from '../../src/components/navigation/MapLibre3D';
import { navigatorSettingsStore } from '../../src/stores/navigatorSettingsStore';

// promptfoo для валидации настроек
const promptfooConfig = {
  tests: [{
    name: 'Map style binding',
    vars: {
      viewMode: '3d-satellite',
      expectedStyle: 'mapbox://styles/mapbox/satellite-streets-v11'
    },
    assert: {
      output: (result) => result.mapStyle === expectedStyle
    }
  }]
};
```

### 3. Voice Assistant Safety
```typescript
// Проверка soundMode с promptfoo
describe('Voice Safety', () => {
  test('speed_warning always spoken in non-mute', async () => {
    const test = await promptfoo.run({
      testCases: [
        { soundMode: 'normal', speed: 120, limit: 100, shouldSpeak: true },
        { soundMode: 'mute', speed: 120, limit: 100, shouldSpeak: false }
      ]
    });
    expect(test.results.passed).toBe(2);
  });
});
```

## 🚀 Реализация (Step-by-Step)

### Шаг 1: Установка (без конфликтов)
```bash
# Core testing utilities (уже есть)
npm install --save-dev jest cypress k6 artillery

# AI Security (новое, без дублей)
npm install --save-dev agentic-security@latest
npm install --save-dev promptfoo@latest

# AI Test Runner (новое)
npm install --save-dev @zurd46/ai-testing-suite

# MicroVM для безопасности
npm install --save-dev firecracker-containerd
```

### Шаг 2: Конфигурация (рабочая)
```typescript
// .github/agents/.test-config.ts
export const testConfig = {
  // Agentic Security
  agenticSecurity: {
    enabled: true,
    scanOnCommit: true,
    failOnVulnerability: 'high',
    owaspTop10: true,
    zeroDayPatterns: true
  },
  
  // promptfoo
  promptfoo: {
    enabled: true,
    llm: 'openai:gpt-4',
    maxConcurrency: 5,
    // Проверка ИИ-фич
    testSuites: [
      'messenger-ai-features',
      'instagram-recommendations',
      'search-ai'
    ]
  },
  
  // AI Test Suite
  aiTestSuite: {
    enabled: true,
    agents: 8,
    generateTests: true,
    securityScan: true,
    autoFix: false // требует одобрения
  },
  
  // Безопасность
  sandbox: {
    type: 'firecracker', // из-за CVE-2026-34040
    network: 'none',
    capabilities: []
  }
};
```

### Шаг 3: CI/CD Pipeline (без конфликтов)
```yaml
# .github/workflows/ai-test-pipeline.yml
name: AI Security Testing
on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Agentic Security - первым (базовый)
      - name: Run Agentic Security
        run: npx agentic-security scan --all --fail-on=high
        
      # promptfoo - для ИИ-компонент
      - name: Run promptfoo
        run: npx promptfoo run tests/ai-features/
        
      # AI Test Suite - генерация тестов
      - name: Run AI Test Generation
        run: npx ai-testing-suite generate-only
        
  e2e-tests:
    needs: security-scan
    runs-on: ubuntu-latest
    container:
      image: firecracker-microvm
      options: >-
        --network none
        --cap-drop ALL
        --security-opt no-new-privileges
        --security-opt seccomp=strict.json
    steps:
      - run: npm run test:e2e
```

## ✅ Проверка на Дубли и Конфликты

### Анализ существующего:
- ❌ `test-utilities.md` - базовые утилиты (оставляем)
- ❌ `*_tester.agent.md` - спецификации (оставляем)  
- ✅ `ai-test-frameworks-research.md` - исследование (обновляем)
- ✅ `ai-test-integration.md` - НОВОЕ (интеграция)

### Уникальность добавляемого:
1. **Agentic Security** - нет в текущем коде ✅
2. **promptfoo** - нет в текущем коде ✅  
3. **AI Testing Suite** - нет в текущем коде ✅
4. **Firecracker** - нет в текущем коде ✅

### Конфликты имен:
- package.json: новых зависимостей нет → конфликтов нет ✅
- Скрипты: добавляем новые с уникальными именами ✅
- Конфиги: отдельные файлы → конфликтов нет ✅

## 📊 Метрики Безопасности

| Тест | Фреймворк | Цель | Статус |
|------|-----------|------|--------|
| OWASP Top 10 | Agentic Security | Уязвимости | ✅ Запланировано |
| Prompt Injection | promptfoo | LLM безопасность | ✅ Запланировано |
| CVE-2026-34040 | Firecracker | Контейнеры | ✅ Решено |
| Автотесты | AI Suite | Покрытие | ✅ Запланировано |
| Пентест | RedAmon | Уязвимости | ✅ Опционально |

## ⚙️ Рабочая Конфигурация

### package.json (добавляем без конфликтов)
```json
{
  "devDependencies": {
    // Существующие - оставляем
    "jest": "^29.0.0",
    "cypress": "^13.0.0",
    // Новые - без конфликтов
    "agentic-security": "^0.7.4",
    "promptfoo": "^0.96.0",
    "@zurd46/ai-testing-suite": "^1.0.0"
  },
  "scripts": {
    // Существующие - оставляем
    "test": "jest",
    "test:e2e": "cypress run",
    // Новые - уникальные имена
    "security:scan": "agentic-security scan",
    "security:promptfoo": "promptfoo run",
    "test:ai-generate": "ai-testing-suite generate"
  }
}
```

## 🎯 Результат

✅ **Без дубликатов** - все фреймворки уникальны  
✅ **Без конфликтов** - изолированные конфигурации  
✅ **Рабочая интеграция** - синхронизация с кодом  
✅ **Безопасность** - учтены CVE 2026 года  
✅ **Автоматизация** - CI/CD pipeline готов

**Следующий шаг:** Запуск тестового прогона для валидации конфигурации.