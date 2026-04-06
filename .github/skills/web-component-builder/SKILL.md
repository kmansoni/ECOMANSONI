---
name: web-component-builder
description: "Web Components: Custom Elements, Shadow DOM, HTML Templates. Use when: веб компонент, custom element, shadow DOM, LitElement, standalone widget, iframe isolation, embedded widget."
---

# Web Component Builder — Web Components

---

## Когда Web Components в React-проекте

```
Когда уместно:
✅ Виджет для встраивания в сторонние сайты (чат-виджет, кнопка поддержки)
✅ Изолированный компонент с собственными стилями (Shadow DOM)
✅ Интеграция со сторонними библиотеками (не React)
✅ Shareable компоненты без зависимостей

Когда НЕ нужно внутри нашего React-приложения:
❌ Обычные компоненты — используй React
❌ Когда нужен React Context / Zustand внутри
❌ SSR (Shadow DOM плохо поддерживается)
```

---

## Минимальный Custom Element

```typescript
// public/widget/chat-widget.js
class ChatWidget extends HTMLElement {
  private shadow: ShadowRoot;
  private channelId: string = '';

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['channel-id', 'theme'];
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    if (name === 'channel-id') this.channelId = value;
    this.render();
  }

  connectedCallback() {
    this.render();
    this.loadStyles();
  }

  disconnectedCallback() {
    // Cleanup: listeners, timers, subscriptions
  }

  private async loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/widget/chat-widget.css';
    this.shadow.appendChild(link);
  }

  private render() {
    // Обновить shadow DOM
    const container = this.shadow.querySelector('.container') ?? document.createElement('div');
    container.className = 'container';
    container.innerHTML = `
      <div class="chat-window" data-channel="${this.channelId}">
        <slot></slot>
      </div>
    `;
    if (!this.shadow.querySelector('.container')) {
      this.shadow.appendChild(container);
    }
  }
}

// Регистрация
customElements.define('chat-widget', ChatWidget);
```

---

## Использование встроенного виджета

```html
<!-- На сторонних сайтах -->
<script src="https://yourdomain.com/widget/chat-widget.js" defer></script>

<chat-widget
  channel-id="support-123"
  theme="dark"
>
  <p slot="placeholder">Загрузка чата...</p>
</chat-widget>
```

---

## Обёртка React → Web Component

```typescript
// Экспортировать React компонент как Web Component
// Используется для встраивания в не-React окружение
import { createRoot } from 'react-dom/client';
import { MessageBubble } from '../components/chat/MessageBubble';

class MessageBubbleElement extends HTMLElement {
  private root: ReturnType<typeof createRoot> | null = null;

  connectedCallback() {
    const props = {
      content: this.getAttribute('content') ?? '',
      variant: (this.getAttribute('variant') ?? 'received') as 'sent' | 'received',
    };
    this.root = createRoot(this);
    this.root.render(<MessageBubble {...props} />);
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }
}

customElements.define('message-bubble', MessageBubbleElement);
```

---

## Slots и наследование стилей

```html
<!-- Shadow DOM изолирует стили (не наследует Tailwind!) -->
<!-- Нужно либо: инлайн стили, либо подключить CSS -->

<!-- Named slots для гибкости -->
<chat-widget>
  <span slot="title">Поддержка</span>    <!-- → <slot name="title"> -->
  <div slot="footer">...</div>
</chat-widget>

<!-- CSS Custom Properties проникают через Shadow DOM -->
<style>
  chat-widget {
    --widget-primary: #6366f1;
    --widget-bg: #ffffff;
  }
</style>
```

---

## Чеклист

- [ ] `connectedCallback` — инициализация
- [ ] `disconnectedCallback` — cleanup (EventListeners, timers!)
- [ ] `observedAttributes` + `attributeChangedCallback` для реактивности
- [ ] Shadow DOM для изоляции стилей (или не Shadow для наследования)
- [ ] CSS Custom Properties для кастомизации извне
- [ ] `customElements.define` вызывается один раз
- [ ] Если React внутри — `createRoot` + `unmount` в disconnectedCallback
