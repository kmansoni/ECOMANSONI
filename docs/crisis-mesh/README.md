# Crisis Mesh — mesh-мессенджер без инфраструктуры

**Статус:** В разработке (перенос из Flutter PoC в основной стек).
**Владелец:** Mansoni Core Team.

## Миссия

Mesh-мессенджер для кризисных ситуаций (землетрясения, наводнения, блэкауты,
протесты, военные действия), работающий **без интернета и сотовой связи** через
Bluetooth / Wi-Fi Direct / Multipeer Connectivity между соседними устройствами.

Референсы: Briar, Bridgefy, Berty, Meshtastic, Reticulum.

## Поверхность функций

| Функция | Описание |
|---|---|
| P2P discovery | BLE + Nearby Connections (Android) / Multipeer (iOS) |
| Mesh messaging | Epidemic routing с hop counter, TTL, dedup |
| E2EE | Переиспользует `src/lib/e2ee/` (Double Ratchet + X3DH) |
| Signing | Ed25519 identity + подпись каждого пакета |
| SOS signals | Приоритетный broadcast с координатами |
| Offline storage | IndexedDB + шифрование device-passkey |
| Online sync | При появлении сети — rehydrate через Supabase (опц.) |

## Архитектура — слои

```
UI (React + Zustand)
  ↓
Hooks (useCrisisMesh, useMeshPeers, useSOS)
  ↓
┌──────────┬──────────┬──────────┬──────────┐
│ Routing  │ Crypto   │ Storage  │ Sync     │
└──────────┴──────────┴──────────┴──────────┘
  ↓
Transport (Capacitor plugin: Nearby + Multipeer + Web fallback)
```

## Документы

- [ADR-001 — Transport layer](adr/ADR-001-transport-layer.md)
- [ADR-002 — Routing protocol](adr/ADR-002-routing-protocol.md)
- [ADR-003 — Crypto stack](adr/ADR-003-crypto-stack.md)
- [ADR-004 — Offline/online sync](adr/ADR-004-offline-online-sync.md)
- [ADR-005 — Battery model](adr/ADR-005-battery-model.md)
- [План реализации по фазам](../../archive/crisis-mesh-flutter-poc/ARCHIVED.md) — см. также полный план в истории чата

## Железные законы

1. **Нет fake success** — `sendPayload` возвращает `ok:true` только после реальной передачи
2. **Нет unsigned** — каждый пакет подписан Ed25519, отвергается на relay если подпись неверна
3. **Нет plaintext в БД** — IndexedDB шифруется AES-GCM с ключом от biometric/passkey
4. **RLS на всех новых таблицах** — mesh_identities, mesh_sos_signals
5. **Каждое изменение — tsc = 0** ошибок
