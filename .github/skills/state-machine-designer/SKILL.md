---
name: state-machine-designer
description: "Проектирование конечных автоматов (FSM): состояния, переходы, guards, side effects для сообщений, звонков, заказов. Use when: message states, call states, order states, FSM, конечный автомат, состояния и переходы."
argument-hint: "[домен: message | call | order | media | all]"
---

# State Machine Designer — Конечные автоматы

Конечные автоматы (FSM) предотвращают невалидные переходы состояний и делают бизнес-логику явной и тестируемой.

---

## Состояния сообщения

```typescript
// src/lib/state-machines/message.ts
type MessageState =
  | 'composing'    // Пишется пользователем
  | 'pending'      // Отправляется (optimistic)
  | 'sent'         // Доставлено на сервер
  | 'delivered'    // Доставлено получателю (device)
  | 'read'         // Прочитано
  | 'failed'       // Ошибка отправки
  | 'deleted';     // Удалено

type MessageEvent =
  | 'SEND'
  | 'SERVER_ACK'
  | 'DEVICE_DELIVERED'
  | 'READ_RECEIPT'
  | 'SEND_ERROR'
  | 'RETRY'
  | 'DELETE';

const messageTransitions: Record<MessageState, Partial<Record<MessageEvent, MessageState>>> = {
  composing:  { SEND: 'pending' },
  pending:    { SERVER_ACK: 'sent', SEND_ERROR: 'failed' },
  sent:       { DEVICE_DELIVERED: 'delivered', DELETE: 'deleted' },
  delivered:  { READ_RECEIPT: 'read', DELETE: 'deleted' },
  read:       { DELETE: 'deleted' },
  failed:     { RETRY: 'pending', DELETE: 'deleted' },
  deleted:    {}, // Терминальное состояние
};

function transition(state: MessageState, event: MessageEvent): MessageState {
  const next = messageTransitions[state]?.[event];
  if (!next) throw new Error(`Invalid transition: ${state} + ${event}`);
  return next;
}
```

---

## Состояния звонка

```typescript
type CallState =
  | 'idle'
  | 'outgoing'      // Исходящий, ждём ответа
  | 'incoming'      // Входящий, ждём принятия
  | 'connecting'    // WebRTC negotiation
  | 'connected'     // Активный звонок
  | 'on_hold'       // Удержание
  | 'reconnecting'  // Переподключение
  | 'ended';        // Завершён

const callTransitions: Record<CallState, string[]> = {
  idle:         ['outgoing', 'incoming'],
  outgoing:     ['connecting', 'ended'],  // accepted → connecting, rejected/cancelled → ended
  incoming:     ['connecting', 'ended'],  // accepted → connecting, declined → ended
  connecting:   ['connected', 'ended'],
  connected:    ['on_hold', 'reconnecting', 'ended'],
  on_hold:      ['connected', 'ended'],
  reconnecting: ['connected', 'ended'],
  ended:        [], // Терминальное
};
```

---

## Lightweight FSM класс

```typescript
class StateMachine<S extends string, E extends string> {
  constructor(
    private state: S,
    private readonly transitions: Record<S, Partial<Record<E, S>>>,
    private readonly effects?: Partial<Record<`${S}:${E}`, () => void>>
  ) {}

  send(event: E): S {
    const next = this.transitions[this.state]?.[event];
    if (!next) {
      console.warn(`Invalid: ${this.state} + ${event} — ignored`);
      return this.state;
    }
    // Запустить side effect если есть
    this.effects?.[`${this.state}:${event}`]?.();
    this.state = next;
    return next;
  }

  getState(): S { return this.state; }
  can(event: E): boolean { return !!this.transitions[this.state]?.[event]; }
}

// Использование
const call = new StateMachine<CallState, CallEvent>(
  'idle',
  callTransitions,
  {
    'outgoing:ACCEPT': () => startWebRTC(),
    'connected:HANGUP': () => teardownWebRTC(),
  }
);
```

---

## FSM в PostgreSQL

```sql
-- Защита переходов на уровне БД
CREATE OR REPLACE FUNCTION validate_message_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Разрешённые переходы
  IF (OLD.status = 'pending' AND NEW.status NOT IN ('sent', 'failed')) OR
     (OLD.status = 'sent' AND NEW.status NOT IN ('delivered', 'deleted')) OR
     (OLD.status = 'delivered' AND NEW.status NOT IN ('read', 'deleted')) OR
     (OLD.status = 'deleted') THEN
    RAISE EXCEPTION 'Invalid state transition: % → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_state_machine
  BEFORE UPDATE OF status ON messages
  FOR EACH ROW EXECUTE FUNCTION validate_message_state_transition();
```

---

## Чеклист

- [ ] Все состояния перечислены (включая терминальные)
- [ ] Переходы явны — нет неявных изменений состояния
- [ ] Невалидные переходы вызывают ошибку (fail-loud)
- [ ] PostgreSQL trigger защищает переходы на уровне БД
- [ ] Логирование переходов для отладки
- [ ] Тесты для каждого допустимого перехода
