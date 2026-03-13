# Twilio Verify - полное руководство по аутентификации

## Что такое Twilio Verify?

Twilio Verify - это готовый сервис для отправки OTP-кодов (одноразовых паролей) через:
- SMS
- Voice (звонок)
- Email
- WhatsApp

---

## Как работает Twilio Verify

### Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Ваш       │────▶│   Twilio     │────▶│   Клиент        │
│   сервер    │     │   Verify API │     │   (SMS/Email)   │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                   │
       │            ┌──────▼──────┐
       │            │  Верификация│
       │            │  кода       │
       │            └──────┬──────┘
       │                   │
       ◀──────────────────┘
```

---

## API Twilio Verify

### 1. Отправка кода (Start Verification)

```bash
POST https://verify.twilio.com/v2/Services/{Service SID}/Verifications
```

**Параметры:**
- `To` - номер телефона или email
- `Channel` - sms, voice, email, whatsapp

**Ответ:**
```json
{
  "status": "pending",
  "to": "+79001234567",
  "channel": "sms",
  "service_sid": "VA...",
  "verify_code_sid": "VE...",
  "date_created": "2024-01-01T00:00:00Z"
}
```

### 2. Проверка кода (Check Verification)

```bash
POST https://verify.twilio.com/v2/Services/{Service SID}/VerificationCheck
```

**Параметры:**
- `To` - номер телефона
- `Code` - код, введенный пользователем

**Ответ (успех):**
```json
{
  "status": "approved",
  "to": "+79001234567",
  "service_sid": "VA...",
  "valid": true
}
```

**Ответ (ошибка):**
```json
{
  "status": "pending",
  "to": "+79001234567",
  "valid": false,
  "error_code": 20404
}
```

---

## Интеграция с проектом

### Текущая архитектура проекта

```
supabase/functions/
├── send-sms-otp/       # Отправка SMS через SMS.ru
└── verify-sms-otp/     # Проверка кода из БД
```

### Новая архитектура с Twilio Verify

```
supabase/functions/
├── send-otp/           # Twilio Verify - отправка
└── verify-otp/         # Twilio Verify - проверка
```

### Преимущества Twilio Verify

| Аспект | Сейчас | С Twilio Verify |
|--------|--------|-----------------|
| Генерация кода | Своя (в проекте) | Twilio |
| Хранение кода | DB (phone_otps) | Не нужно |
| Валидация | Своя (timing-safe) | Twilio |
| Rate limiting | Своё | Встроено |
| Retry логика | Своя | Встроено |

---

## Стоимость Twilio Verify

### Цены (Россия)

| Канал | Цена за верификацию |
|-------|---------------------|
| SMS | $0.04 - 0.08 |
| Voice (звонок) | $0.04 - 0.08 |
| Email | $0.02 - 0.05 |

### Примерная стоимость в месяц

| SMS в месяц | Стоимость |
|-------------|-----------|
| 1 000 | $40-80 (3600-7200 ₽) |
| 10 000 | $400-800 (36 000-72 000 ₽) |

---

## Безопасность

### Защита от атак

Twilio Verify включает:
- ✅ Rate limiting (автоматически)
- ✅ Блокировка при частых попытках
- ✅ Smart routing (лучший маршрут)
- ✅ Фрод детекция

### Что нужно от вас

1. **Service SID** - идентификатор сервиса
2. **Auth Token** - токен авторизации
3. **Номер отправителя** - для SMS (нужно зарегистрировать)

---

## Регистрация

### Шаги

1. Зарегистрироваться на twilio.com
2. Создать проект
3. Перейти в Console → Verify
4. Создать Service (например, "MyApp")
5. Получить Service SID
6. Настроить код страны (Россия +7)

---

## Пример кода (Deno/Supabase)

```typescript
// supabase/functions/send-verify-otp/index.ts

const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

async function sendVerification(phone: string) {
  const url = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `To=${encodeURIComponent(phone)}&Channel=sms`
  });
  
  return response.json();
}

async function checkVerification(phone: string, code: string) {
  const url = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `To=${encodeURIComponent(phone)}&Code=${code}`
  });
  
  return response.json();
}
```

---

## Итог

Twilio Verify предоставляет **полный цикл** аутентификации:
- Генерация и отправка кода
- Валидация
- Rate limiting
- Фрод защита

**Минусы:**
- Стоит дороже, чем просто SMS
- Зависимость от Twilio

**Плюсы:**
- Простота интеграции
- Высокая надежность
- Не нужно хранить коды в БД
- Встроенная безопасность
