# Как создать свой SMS-провайдер с нуля

## Концепция

Создать **собственный сервис отправки SMS** который работает как SMS.ru, Twilio, но без зависимости от третьих лиц.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     YOUR SMS PROVIDER                                │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      YOUR SERVER                              │   │
│  │                                                                │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │   │
│  │   │   REST API   │───▶│  Core Engine │───▶│  Providers  │    │   │
│  │   │  (отправка)  │    │ (очереди,логи)│    │  (шлюзы)   │    │   │
│  │   └─────────────┘    └─────────────┘    └──────┬──────┘    │   │
│  │                                                   │           │   │
│  │   ┌─────────────┐    ┌─────────────┐            │           │   │
│  │   │  Dashboard  │    │  Database   │◀───────────┘           │   │
│  │   │  (статистика)│    │  (Postgres)│                        │   │
│  │   └─────────────┘    └─────────────┘                        │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                   │                                  │
│                    ┌──────────────┴──────────────┐                   │
│                    │        SMSC (Оператор)      │                   │
│                    │    МТС / Билайн / Мегафон   │                   │
│                    └─────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Варианты подключения к операторам

### Вариант 1: SMPP (профессиональный)

```
┌────────────┐         ┌────────────┐         ┌────────────┐
│   Ваш      │         │   SMPP     │         │   SMSC     │
│   сервер    │────────▶│   шлюз     │────────▶│  Оператора │
│             │   TCP   │            │  SMPP   │            │
└────────────┘         └────────────┘         └────────────┘
```

**Протокол:** SMPP v3.4/v5.0  
**Порт:** 2775 (обычно)  
**Требуется:** Договор с оператором

### Вариант 2: HTTP API (простой)

```
┌────────────┐         ┌────────────┐         ┌────────────┐
│   Ваш      │         │   HTTP     │         │   SMSC     │
│   сервер    │────────▶│   шлюз     │────────▶│  Оператора │
│             │  HTTPS  │            │  HTTP   │            │
└────────────┘         └────────────┘         └────────────┘
```

**Пример:** МТС API, Билайн API  
**Плюс:** Проще в настройке

### Вариант 3: GSM-модем

```
┌────────────┐         ┌────────────┐         ┌────────────┐
│   Ваш      │         │   AT-      │         │   SIM      │
│   сервер    │────────▶│   commands │────────▶│   карта    │
│             │  USB    │            │  GSM    │            │
└────────────┘         └────────────┘         └────────────┘
```

**Оборудование:** Huawei E1550/E173  
**Плюс:** Не нужен договор с оператором

---

## Структура SMS-провайдера

### 1. API (REST)

```typescript
// POST /api/v1/sms/send
{
  "from": "MyApp",           // Имя отправителя
  "to": "+79001234567",     // Номер получателя
  "text": "Hello!"           // Текст сообщения
}

// Response
{
  "id": "sms_abc123",
  "status": "queued",
  "price": 0.5,
  "currency": "RUB"
}
```

### 2. База данных

```sql
-- Таблица сообщений
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY,
  external_id VARCHAR(255),    -- ID от оператора
  sender_id VARCHAR(11),       -- Имя отправителя
  recipient VARCHAR(20),       -- Номер получателя
  text TEXT,                   -- Текст
  status VARCHAR(20),          -- queued, sent, delivered, failed
  error_code INT,
  price DECIMAL(10,2),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица отправителей
CREATE TABLE senders (
  id UUID PRIMARY KEY,
  name VARCHAR(11) UNIQUE,     -- Имя (до 11 символов)
  status VARCHAR(20),          -- active, pending, rejected
  operator VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица API ключей
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  key VARCHAR(64) UNIQUE,
  name VARCHAR(255),
  rate_limit INT DEFAULT 1000,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Очередь сообщений

```typescript
// Redis queue для надежной доставки
const smsQueue = {
  name: 'sms:queue',
  priority: ['high', 'normal', 'low'],
  
  // Приоритеты:
  // high - OTP, транзакции
  // normal - уведомления
  // low - маркетинг
};
```

---

## Пример кода: Core Engine

```typescript
// src/core/SmsService.ts

interface SmsMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  priority: 'high' | 'normal' | 'low';
}

interface SmsProvider {
  send(message: SmsMessage): Promise<SmsResult>;
}

class SmsService {
  private providers: Map<string, SmsProvider>;
  private queue: RedisQueue;
  private db: Database;
  
  async sendSMS(params: {
    to: string;
    text: string;
    from?: string;
    priority?: 'high' | 'normal' | 'low';
  }) {
    // 1. Валидация номера
    const normalizedPhone = this.normalizePhone(params.to);
    
    // 2. Проверка лимитов
    await this.checkRateLimit(normalizedPhone);
    
    // 3. Создание записи в БД
    const message = await this.db.sms_messages.create({
      from: params.from,
      to: normalizedPhone,
      text: params.text,
      status: 'queued'
    });
    
    // 4. Добавление в очередь
    await this.queue.enqueue('sms:send', {
      messageId: message.id,
      priority: params.priority || 'normal'
    });
    
    return { id: message.id, status: 'queued' };
  }
  
  async processQueue() {
    while (true) {
      const job = await this.queue.pop('sms:send');
      if (!job) break;
      
      const message = await this.db.sms_messages.find(job.messageId);
      
      // Выбор провайдера
      const provider = this.selectProvider(message);
      
      try {
        const result = await provider.send(message);
        
        await this.db.sms_messages.update(message.id, {
          status: 'sent',
          external_id: result.id
        });
      } catch (error) {
        await this.handleError(message, error);
      }
    }
  }
}
```

---

## Пример кода: Провайдер (шлюз)

```typescript
// src/providers/SMPPProvider.ts

import * as net from 'net';

class SMPPProvider implements SmsProvider {
  private host: string;
  private port: number;
  private systemId: string;
  private password: string;
  
  constructor(config: SMPPConfig) {
    this.host = config.host;
    this.port = config.port || 2775;
    this.systemId = config.systemId;
    this.password = config.password;
  }
  
  async send(message: SmsMessage): Promise<SmsResult> {
    const client = await this.connect();
    
    try {
      // Bind трансивер
      await this.bind(client);
      
      // Отправка SUBMIT_SM
      const pdu = this.buildSubmitSM(message);
      await this.sendPDU(client, pdu);
      
      // Получение ответа
      const response = await this.receivePDU(client);
      
      return {
        id: response.message_id,
        status: response.command_status === 0 ? 'sent' : 'failed'
      };
    } finally {
      await this.unbind(client);
      client.end();
    }
  }
  
  private buildSubmitSM(message: SmsMessage): Buffer {
    // Создание PDU для Submit Short Message
    const pdu = Buffer.alloc(100);
    // ... кодирование PDU согласно спецификации SMPP
    return pdu;
  }
}
```

---

## Оборудование и стоимость

### Вариант: SMPP (для бизнеса)

| Расход | Стоимость |
|--------|-----------|
| SMPP шлюз (сервер) | 50 000+ руб |
| Договор с оператором | от 100 000 руб/мес |
| Юридическое оформление | от 30 000 руб |

### Вариант: GSM-модемы (для старта)

| Расход | Стоимость |
|--------|-----------|
| Huawei E173 | 500-1500 руб |
| SIM с SMS | 300-500 руб/мес |
| Сервер (VPS) | 1000 руб/мес |
| **Итого** | **~2000 руб старт** |

---

## Roadmap создания

### Этап 1: База (1 неделя)
- [ ] Настроить сервер/VPS
- [ ] Установить PostgreSQL
- [ ] Установить Redis
- [ ] Создать API на Node.js

### Этап 2: Отправка (2 недели)
- [ ] Подключить GSM-модем
- [ ] Написать AT-команды
- [ ] Реализовать отправку SMS

### Этап 3: Управление (2 недели)
- [ ] Dashboard админа
- [ ] Логирование
- [ ] Мониторинг
- [ ] Rate limiting

### Этап 4: Масштабирование (3 недели)
- [ ] Пул модемов
- [ ] Очереди
- [ ] Fallback на резервных провайдеров

---

## Резюме

| Метод | Сложность | Стоимость | Скорость |
|-------|-----------|-----------|----------|
| GSM-модем | Низкая | ~2000 руб | 10-50/час |
| SMPP | Высокая | 100k+ руб/мес | 1000+/сек |
| HTTP API | Средняя | ~1 руб/SMS | Быстро |

**Для старта рекомендую GSM-модем** - недорого и просто.
