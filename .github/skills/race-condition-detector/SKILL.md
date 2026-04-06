---
name: race-condition-detector
description: "Обнаружение и устранение race conditions: TOCTOU, параллельные мутации, конкурентное обновление состояния, optimistic concurrency. Use when: race condition, TOCTOU, конкурентность, параллельные запросы, одновременное обновление."
argument-hint: "[модуль или операция для проверки]"
---

# Race Condition Detector — Обнаружение гонок состояния

---

## Паттерны TOCTOU (Time-of-Check-Time-of-Use)

```typescript
// ❌ TOCTOU: баланс проверяется, но может измениться до списания
async function deductCreditsUnsafe(userId: string, amount: number) {
  const { data: profile } = await supabase
    .from('profiles').select('credits').eq('id', userId).single();

  // ОПАСНО: другой запрос может изменить credits между этими двумя операциями
  if (profile.credits < amount) throw new Error('Insufficient credits');

  await supabase.from('profiles')
    .update({ credits: profile.credits - amount })
    .eq('id', userId);
}

// ✅ Атомарная операция в одном UPDATE с проверкой
async function deductCreditsAtomic(userId: string, amount: number) {
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error || !data) throw new Error('Insufficient credits or DB error');
}
```

---

## Grep паттерны — поиск в коде

```bash
# Поиск TOCTOU паттернов: select + check + update без транзакции
grep -rn "\.select.*\.eq.*single\(\)" src/hooks/ | head -20
# После каждого — проверить: нет ли update ниже на ту же строку?

# useState с async — классическая гонка
grep -rn "setState.*await\|await.*setState" src/ --include="*.tsx"

# Параллельные вызовы без синхронизации
grep -rn "Promise\.all\|Promise\.allSettled" src/ --include="*.ts"
```

---

## React state races

```typescript
// ❌ Race: запросы могут вернуться не по порядку
function useSearch(query: string) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    searchAPI(query).then(data => setResults(data)); // Старый запрос может перезаписать новый!
  }, [query]);
}

// ✅ AbortController + cleanup
function useSearch(query: string) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    searchAPI(query, { signal: controller.signal })
      .then(data => { if (!cancelled) setResults(data); })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);
}
```

---

## Optimistic Concurrency (версионирование)

```sql
-- Добавить version column для optimistic concurrency
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Обновление с проверкой версии (предотвращает потерянные обновления)
UPDATE profiles
SET display_name = $1, version = version + 1
WHERE id = $2 AND version = $3;
-- Проверить affected rows: если 0 — конфликт, нужен retry
```

```typescript
async function updateProfileWithOptimisticLock(
  userId: string,
  data: Partial<Profile>,
  currentVersion: number
) {
  const { count } = await supabase
    .from('profiles')
    .update({ ...data, version: currentVersion + 1 })
    .eq('id', userId)
    .eq('version', currentVersion)  // Optimistic lock!
    .select('id', { count: 'exact' });

  if (count === 0) throw new Error('Conflict: profile was modified by another session');
}
```

---

## Конкурентные Supabase subscriptions

```typescript
// ❌ Race: два useEffect подписываются параллельно
// ✅ Один subscription источник истины (Zustand store или Context)
const useMessagesStore = create((set) => ({
  channels: new Map<string, RealtimeChannel>(),

  subscribe: (channelId: string) => {
    const { channels } = get();
    if (channels.has(channelId)) return; // Уже подписан — пропустить!

    const channel = supabase.channel(channelId).subscribe();
    set(state => ({ channels: new Map(state.channels).set(channelId, channel) }));
  },
}));
```

---

## Чеклист

- [ ] Нет TOCTOU: select + check + update заменить на атомарный UPDATE / RPC
- [ ] useEffect с async — AbortController и флаг cancelled
- [ ] Параллельные mutations через Promise.all — проверить на race
- [ ] Optimistic concurrency для критичных shared данных
- [ ] Supabase subscriptions дедуплицированы (нет дублей)
- [ ] Zustand set() принимает функцию (не spread объект) для атомарности
