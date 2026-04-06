---
name: email-deliverability
description: "Email deliverability: SPF, DKIM, DMARC настройка, Resend/Postmark best practices, bounce handling, unsubscribe, спам-фильтры. Use when: доставляемость email, SPF, DKIM, DMARC, bounce, unsubscribe, Resend, email не приходит."
argument-hint: "[тип: setup | templates | bounce | audit | all]"
---

# Email Deliverability — Доставляемость email

---

## DNS Записи (обязательные)

```dns
# SPF — разрешённые отправители
TXT @ "v=spf1 include:resend.com ~all"
# ~all = softfail (лучше чем ?all, хуже чем -all)
# Только ОДИН SPF record на домен!

# DKIM — цифровая подпись (взять из Resend Dashboard)
CNAME resend._domainkey "resend._domainkey.resend.com"

# DMARC — политика обработки
TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100"
# p=none → p=quarantine → p=reject (постепенно ужесточать)
```

---

## Resend интеграция (email-router)

```typescript
// services/email-router/src/sendEmail.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}) {
  const { data, error } = await resend.emails.send({
    from: 'Your AI Companion <no-reply@yourdomain.com>',
    to: params.to,
    subject: params.subject,
    html: params.html,
    reply_to: params.replyTo,
    tags: params.tags,
    // Важные заголовки
    headers: {
      'List-Unsubscribe': `<https://yourdomain.com/unsubscribe?email=${params.to}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}
```

---

## Bounce и Complaint обработка

```typescript
// Webhook от Resend для bounce/complaint событий
// services/email-router/src/webhooks.ts
export async function handleResendWebhook(event: ResendWebhookEvent) {
  switch (event.type) {
    case 'email.bounced':
      // Жёсткий bounce — заблокировать email навсегда
      if (event.data.bounce?.type === 'hard') {
        await markEmailAsInvalid(event.data.to[0]);
      }
      break;

    case 'email.complained':
      // Spam complaint — отписать пользователя от всех рассылок
      await unsubscribeEmail(event.data.to[0]);
      break;

    case 'email.delivery_delayed':
      // Мягкая задержка — повторить позже
      await scheduleRetry(event.data);
      break;
  }
}

// Проверять перед отправкой
async function canSendToEmail(email: string): Promise<boolean> {
  const { data } = await supabase
    .from('email_suppressions')
    .select('reason')
    .eq('email', email.toLowerCase())
    .single();
  return !data; // false если в списке подавлений
}
```

---

## HTML шаблон с правилами deliverability

```html
<!-- Минимальный шаблон без спам-признаков -->
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <!-- Контент -->
  <div style="background: white; border-radius: 8px; padding: 24px;">
    <p>{{content}}</p>
  </div>
  <!-- Обязательный unsubscribe footer -->
  <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 16px;">
    Вы получили это письмо потому что зарегистрировались на сервисе.<br>
    <a href="{{unsubscribeUrl}}" style="color: #6b7280;">Отписаться от рассылки</a>
  </p>
</body>
</html>
```

---

## Checklist deliverability

| Признак | Хорошо | Плохо |
|---|---|---|
| SPF | include:resend.com | Отсутствует |
| DKIM | Настроен через Resend | Отсутствует |
| DMARC | p=quarantine | p=none без мониторинга |
| Unsubscribe | List-Unsubscribe header + ссылка | Нет ссылки отписки |
| Bounce | Обрабатывается webhook | Игнорируется |

- [ ] SPF, DKIM, DMARC записи настроены
- [ ] Unsubscribe header и ссылка в каждом письме
- [ ] Webhook обработчик для bounce/complaint событий
- [ ] Таблица `email_suppressions` для отписанных/bounce
- [ ] Проверка suppression перед каждой отправкой
