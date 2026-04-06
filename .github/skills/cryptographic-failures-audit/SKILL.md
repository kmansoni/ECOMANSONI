---
name: cryptographic-failures-audit
description: "Аудит OWASP A02 Cryptographic Failures: слабые алгоритмы, незашифрованные данные, неправильное хранение ключей, отсутствие шифрования в transit и at rest. Use when: A02, crypto, шифрование, слабые алгоритмы, MD5, SHA1."
argument-hint: "[область: transit | at-rest | keys | algorithms | all]"
user-invocable: true
---

# Cryptographic Failures — OWASP A02:2025

Отсутствие или неправильное использование шифрования. Приводит к раскрытию чувствительных данных.

---

## Фаза 1: Инвентаризация sensitive данных

Что нужно защищать в нашем проекте:

| Данные | Тип | Где хранится | Метод защиты |
|---|---|---|---|
| Сообщения E2EE | Суперсекрет | Supabase DB | E2EE (app layer) |
| Токены авторизации | Секрет | Memory/Cookie | HTTPS + short TTL |
| Приватные ключи E2EE | Суперсекрет | IndexedDB | Зашифровано passphrase |
| Медиафайлы чата | Конфиденциально | Supabase Storage | Private bucket + signed URLs |
| Телефоны/Email | ПДн | Supabase Auth | TLS at rest |
| Местоположение | ПДн | Supabase DB | RLS |
| Pushnotification tokens | Секрет | DB | RLS |

---

## Фаза 2: Алгоритмы — Сканирование

```bash
# Устаревшие алгоритмы
grep -rn "MD5\|md5(" src/ supabase/ --include="*.ts"
grep -rn "SHA1\|sha1\|'sha1'" src/ supabase/ --include="*.ts"
grep -rn "DES\|3DES\|RC4\|Blowfish" src/ supabase/ --include="*.ts"
grep -rn "AES-ECB\|'ECB'" src/ supabase/ --include="*.ts"
grep -rn "RSA.*1024\|keySize.*1024" src/ supabase/ --include="*.ts"

# Опасные JavaScript функции
grep -rn "Math\.random()" src/lib/ src/hooks/ --include="*.ts"  # не для крипто!
grep -rn "btoa\|atob" src/ --include="*.ts"  # base64 ≠ шифрование!
```

### Рейтинг алгоритмов

```
✅ APPROVE (2024+):
  Symmetric: AES-256-GCM, XChaCha20-Poly1305, AES-256-CBC+HMAC
  Asymmetric: X25519/X448, P-256/P-384, RSA-4096 (для cert)
  Hash: SHA-256, SHA-384, SHA-512, SHA3-256, BLAKE2/3
  Signatures: Ed25519, ECDSA P-256, RSA-PSS (> 2048)
  KDF: Argon2id, bcrypt (work=12), scrypt, PBKDF2 (>= 600k iters)
  MAC: HMAC-SHA256, Poly1305

⚠️ DEPRECATED (использовать нельзя):
  MD5, SHA1, DES, 3DES, RC4, AES-ECB, RSA-PKCS1v1.5
  bcrypt < 10 rounds, PBKDF2 < 100k iters, Math.random() для ключей
```

---

## Фаза 3: Data in Transit

```bash
# HTTP вместо HTTPS?
grep -rn "http://" src/ --include="*.ts" --include="*.tsx" | grep -v "localhost\|127\.\|example\.com\|schema"
grep -rn "ws://" src/ --include="*.ts" | grep -v "localhost\|127\."

# Vite config — HTTPS в dev?
grep -rn "https\|ssl\|tls" vite.config.ts

# Supabase config — используется HTTPS?
grep -rn "VITE_SUPABASE_URL" src/ .env* | head -5
```

**Чеклист Transit:**
- [ ] Все endpoints HTTPS (включая WebSocket → WSS)
- [ ] HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [ ] TLS 1.2+ (TLS 1.0/1.1 отключены)
- [ ] Certificate pinning для mobile (Capacitor)

---

## Фаза 4: Data at Rest

```bash
# Незашифрованные sensitive данные в localStorage
grep -rn "localStorage\.setItem" src/ --include="*.ts" --include="*.tsx"
# Проверить: что именно сохраняется? нет ли sensitive данных?

# Нет ли plaintext private keys
grep -rn "privateKey.*localStorage\|private_key.*set\|localStorage.*private" src/

# Supabase RLS для sensitive таблицы
grep -rn "messages\|private_key\|user_keys" supabase/migrations/ --include="*.sql"
```

**Чеклист At Rest:**
- [ ] Нет private ключей в localStorage/sessionStorage в plaintext
- [ ] E2EE ключи: зашифрованы passphrase или в Keychain (mobile)
- [ ] Supabase Storage: пользовательские файлы в private bucket
- [ ] Signed URLs с expiry для доступа к файлам
- [ ] Database backups зашифрованы (Supabase обеспечивает)

---

## Фаза 5: Key Management

```bash
# Hardcoded keys?
grep -rn "const.*key\s*=\s*['\"][A-Za-z0-9+/=]{16,}" src/  # hardcoded base64 keys
grep -rn "sk_live_\|sk_test_\|AIza\|AKIA" src/  # Stripe, Google, AWS keys

# .env проверяем что не в git
git log --all --full-history -- "*.env" 2>/dev/null | head -5
```

**Чеклист Key Management:**
- [ ] Нет hardcoded API keys в коде
- [ ] .env файлы в .gitignore
- [ ] Production secrets только в Supabase Vault / GitHub Secrets
- [ ] Key rotation: процедура смены ключей документирована
- [ ] Encryption keys ≠ signing keys ≠ MAC keys (разные ключи для разных целей)

---

## Фаза 6: Random Number Generation

```bash
grep -rn "Math\.random()" src/lib/ src/hooks/ supabase/functions/ --include="*.ts"
```

| Контекст | Запрещено | Требуется |
|---|---|---|
| E2EE ключи/IV | Math.random() | crypto.getRandomValues() |
| Session tokens | Math.random() | crypto.getRandomValues() |
| OTP коды | Math.random() | crypto.getRandomValues() |
| UI: случайный цвет аватара | — | Math.random() допустим |
| Тест данные | — | Math.random() допустим |

---

## Фаза 7: bcrypt / Password Hashing

```bash
# Supabase Auth управляет хешированием — но для кастомной auth проверить
grep -rn "bcrypt\|argon2\|scrypt\|pbkdf2" src/ server/ services/ --include="*.ts" --include="*.js"
grep -rn "hash.*password\|password.*hash" src/ server/ services/ --include="*.ts"
```

**Чеклист:**
- [ ] Нет хранения паролей в plaintext или MD5/SHA
- [ ] Supabase Auth: встроенный bcrypt (настраивать не нужно)
- [ ] Если кастомная auth: Argon2id (min m=64MB, t=3, p=1)

---

## Итоговый отчёт

```markdown
# Cryptographic Failures Audit — {дата}

## Устаревшие алгоритмы
| Файл | Алгоритм | Использование | Severity |
|---|---|---|---|

## Unencrypted Sensitive Data
| Данные | Место | Риск |
|---|---|---|

## Key Management Issues
...

## Итог: [PASS / FAIL]
Критических: X, High: Y
```
