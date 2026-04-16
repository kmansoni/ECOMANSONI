---
name: webapp-testing
description: >-
  Тестирование веб-приложений через Playwright: автоматизация UI, скриншоты, console logs.
  Use when: тестировать UI, Playwright скрипт, проверить веб-приложение, UI автоматизация.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/webapp-testing
---

# Web Application Testing

Тестирование локальных веб-приложений через Playwright скрипты.

## Дерево решений

```
Задача → Статический HTML?
    ├── Да → Прочитать HTML, найти селекторы → Playwright скрипт
    └── Нет (dynamic webapp) → Сервер запущен?
        ├── Нет → Запустить dev server + Playwright
        └── Да → Reconnaissance-then-action:
            1. Navigate + wait for networkidle
            2. Screenshot или DOM inspection
            3. Найти селекторы из rendered state
            4. Выполнить действия
```

## Reconnaissance-Then-Action паттерн

1. **Inspect rendered DOM**:
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   ```

2. **Определить селекторы** из результатов inspection

3. **Выполнить действия** с найденными селекторами

## Критичное правило

❌ НЕ инспектировать DOM ДО `networkidle` на dynamic apps
✅ СНАЧАЛА `page.wait_for_load_state('networkidle')`, ПОТОМ инспекция

## Примеры

### Запуск с существующим сервером

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:8080')
    page.wait_for_load_state('networkidle')
    
    # Скриншот
    page.screenshot(path='/tmp/app-state.png', full_page=True)
    
    # Действия
    page.locator('button:has-text("Войти")').click()
    page.wait_for_selector('[data-testid="dashboard"]')
    
    browser.close()
```

### Smoke test для нашего проекта

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:8080')
    page.wait_for_load_state('networkidle')
    
    # Mobile viewport обязателен
    page.screenshot(path='pw-screenshots/mobile-home.png')
    
    # Проверить console errors
    errors = []
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    
    assert len(errors) == 0, f"Console errors: {errors}"
    browser.close()
```

## Best Practices

- `sync_playwright()` для синхронных скриптов
- Всегда закрывать browser
- Descriptive селекторы: `text=`, `role=`, CSS, IDs
- Appropriate waits: `wait_for_selector()`, `wait_for_load_state()`
- Mobile viewport (375px) обязателен для нашего проекта
- Console errors = blocker
- Скриншоты при assertion failures → `pw-screenshots/`
