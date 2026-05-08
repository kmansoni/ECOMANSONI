# Skill: Time Handling & Timezones

**Domain:** Timezones, DST, leap seconds, clock skew, message scheduling  
**Files:** `src/lib/time/`, `src/lib/chat/timeUtils.ts`  
**When to apply:** Time display, scheduling, DST transitions, timestamp arithmetic

---

## Knowledge

### Timezone Fundamentals
- **UTC** ( Coordinated Universal Time) — canonical storage format
- **IANA TZ database** (Olson): `America/New_York`, `Europe/Moscow`
- **Offset**: UTC+3, UTC-5 (not fixed, varies by DST)
- **IANA vs Abbreviation**: `America/New_York` vs EST/EDT (ambiguous)

### DST (Daylight Saving Time)
- **Spring forward**: lose 1 hour (gap, 02:00 → 03:00)
- **Fall back**: repeat 1 hour (overlap, 02:00–03:00 appears twice)
- **Southern hemisphere**: opposite months (Oct–Mar)
- **No DST**: Iceland, most of Asia, Africa

### Leap Seconds
- **23:59:60 → 00:00:00**: occasional (last: 2016-12-31)
- **Smearing**: some systems spread over 1s (Google, AWS)
- **NTP discipline**: leap indicator bit

### Clock Skew
- **NTP sync**: typical ±100ms, can drift 1s/min without sync
- **Device clock incorrect**: user manually set time
- **Monotonic clock**: `performance.now()` (not affected by NTP jumps)

### Best Practices
- **Store UTC**: all server timestamps in UTC
- **Send timezone**: convert to user's tz on client
- **Display local**: `Intl.DateTimeFormat` (native TZ db)
- **Avoid epoch ms overflow**: 32-bit signed overflow 2038-01-19
- **Use libraries**: `date-fns-tz`, `luxon`, `dayjs` (with timezone plugin)

### Scheduling Across DST
- "Every day at 9:00 AM" → UTC varies
- Recalculate trigger time per timezone's DST rules
- Use **cron with timezone** (`cron` package supports tz param)

### Unix Timestamp Pitfalls
- **32-bit overflow** (Year 2038): `time_t` signed 32-bit max = 2,147,483,647
- **JavaScript**: `Date.now()` safe until ±100,000,000 days (use BigInt for future)
- **Negative timestamps**: 1970-01-01 allowed (pre-1970 dates)

---

## Quality Gates

1. **All timestamps stored in UTC** (DB + logs)
2. **No "Today"/"Yesterday" off-by-one-hour bugs** near DST
3. **Leap second handling**: not crash
4. **2038 readiness**: use 64-bit integers in DB
5. **Clock skew tolerance**: server authoritative for deadlines

---

## When to Apply

- Timestamp display (message bubbles)
- Message scheduling (send later)
- "Last seen" logic
- Notification delivery time
- Timezone-aware reports
- Archive deletion TTL
- Any arithmetic involving dates (duration, age)
