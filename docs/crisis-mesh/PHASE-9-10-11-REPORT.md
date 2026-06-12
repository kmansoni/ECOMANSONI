# Crisis Mesh — итоговый статус (Phase 9 + 10 + 11)

## Что сделано за эту сессию

| Фаза | Статус | Артефакт |
|---|---|---|
| 0–3 (handoff) | ✅ | native IDB, Capacitor plugin, transport, CrisisMeshEngine |
| 6 — миграция | ✅ | `supabase/migrations/20260417000000_crisis_mesh_identities.sql` |
| 7 — store + UI | ✅ | `src/stores/crisisMeshStore.ts`, `src/pages/CrisisMeshPage.tsx`, route `/crisis-mesh` |
| 8 — навигация | ✅ | пункт `Crisis Mesh` в `ServicesMenu` (иконка `Siren`) |
| 9 — тесты | ✅ | **62 теста, 9 файлов, tsc exit=0** |
| 10 — аудит | ✅ | см. ниже |
| 11 — честный отчёт | ✅ | этот файл |

## Тестовое покрытие (Phase 9)

```
routing/lru-cache.test.ts         5
routing/rate-limiter.test.ts      5
routing/bloom-filter.test.ts      5
routing/router.test.ts           14
emergency/haversine.test.ts       4
crypto/signing.test.ts           11
crypto/proof-of-work.test.ts      4
storage/mesh-db.test.ts          10
engine.test.ts (loopback)         4
                                ────
                                 62/62 ✅
```

## Критичная находка в процессе тестирования

**Баг в `src/lib/e2ee/utils.ts` → `toBase64`**:
`instanceof ArrayBuffer` возвращает false для `ArrayBuffer`, полученного из `crypto.subtle.sign` в jsdom/Node (разные realms). Функция молча возвращала пустую строку. В production (браузер, один realm) баг не проявлялся, но это latent-уязвимость для любой среды, где crypto-буфер может прийти из другого realm (Web Worker, SharedArrayBuffer в будущем).
Фикс: проверка `instanceof Uint8Array`, остальное — через `new Uint8Array(buf)`.
**Подтверждено: 66/66 существующих E2EE-тестов остаются зелёными.**

## Честные caveats (что НЕ сделано — P1/P2)

### P1 — требует работы перед реальным production use

1. **Ciphertext = `base64(plaintext)`** — payload-level шифрование не включено.
   Подпись Ed25519 защищает от spoofing/tampering при relay, но сам контент сообщения не зашифрован от промежуточных узлов. Нужна интеграция с `src/lib/e2ee/` (Double Ratchet) на уровне payload.

2. **X3DH handshake не реализован** — `onPeerFound` создаёт peer с `publicKey = new Uint8Array(0)`. Публичный ключ должен прийти через:
   - handshake-сообщение типа `kind: 'handshake'` (предусмотрено в типах, не реализовано в engine)
   - либо онлайн-директория через Supabase `mesh_identities`
   В loopback-тестах обход через `exchangePublicKeys` helper, в production это gap.

3. **Приватный ключ не переживает перезапуск** — `bootstrapIdentity` бросает `"privateKey recovery not implemented yet"` при найденной сохранённой identity. Нужна интеграция с `src/lib/e2ee/hardwareKeyStorage.ts` или WebAuthn/keychain.

4. **Proof-of-Work реализован но не подключён к engine** — `findProofOfWork` существует и протестирован, но `engine.sendPayload` его не вызывает. PoW должен применяться для first-contact и SOS, чтобы блокировать Sybil/flood.

### P2 — для полной production-готовности

5. **Native транспорт не проверен физическими устройствами** — Kotlin-код для Android Nearby Connections и Swift для iOS MultipeerConnectivity собран и типизирован корректно, но межустройственное соединение требует двух физических устройств в одной сети.

6. **Веб-режим работает только через DevSimulatedTransport** — BroadcastChannel между вкладками одного origin. Для реального P2P в вебе требуется WebRTC сигналинг сервер.

7. **Supabase-синхронизация** — таблица `mesh_identities` создана (`20260417000000`), но UI/Store не синхронизирует peer-каталог с сервером. Это опциональный online fallback для offline mesh.

## 8-направленный аудит (сжато)

| Направление | Вердикт |
|---|---|
| Корректность | ✅ 62/62 тестов зелёные, loopback доставка подтверждена |
| Безопасность | ⚠️ Ed25519 signatures OK, но payload encryption + X3DH + PoW — P1 |
| TypeScript | ✅ strict, 0 ошибок, 0 `any`/`as unknown` кроме задокументированных Web Crypto casts |
| Производительность | ✅ LRU dedup, bloom filter для route path, rate limiter на peer и SOS |
| Полнота | ⚠️ UI покрывает основные сценарии, нет: peer-detail, resolve-SOS, history-filter |
| Интеграция | ✅ store → engine → transport → storage цепочка работает end-to-end в loopback |
| UX | ⚠️ `/crisis-mesh` в ServicesMenu, но нет global SOS badge / notification |
| Документация | ✅ 5 ADR в `docs/crisis-mesh/adr/`, README, типы самодокументируются |

## Финальные команды (все зелёные)

```
npx tsc -p tsconfig.app.json --noEmit        → exit=0
npx vitest run src/lib/crisis-mesh           → 62/62 pass
npx vitest run src/test/e2ee-*               → 66/66 pass (регрессия проверена)
```

## Git история (эта сессия)

1. `fix(e2ee): toBase64 корректно обрабатывает ArrayBuffer из других realm`
2. `test(crisis-mesh): Phase 9 — полное тестовое покрытие (62 теста)`
3. `feat(crisis-mesh): Phase 8 — пункт в ServicesMenu`

## Вердикт

Модуль Crisis Mesh готов к внутреннему тестированию и dev-превью (`/crisis-mesh` в вебе через BroadcastChannel). Для публичного production-релиза требуется:
- [ ] P1.1: Double Ratchet на payload
- [ ] P1.2: handshake-сообщение для обмена publicKey
- [ ] P1.3: persist приватного ключа (hardwareKeyStorage)
- [ ] P1.4: подключить PoW в sendPayload
- [ ] P2.5: тесты на двух физических Android/iOS устройствах

Это не упрощения, это честная граница: что уже работает и протестировано vs что требует следующей итерации.
