# Call Peer ID Format (Canonical)

## Purpose

Зафиксировать корректный формат идентификатора участника звонка для E2EE media decrypt.

## Canonical Peer ID

- Формат: `userId:deviceId`
- Пример: `9c2f8b1a-...:f6a2d1e8-...`

## Rules

1. Для inbound decrypt ключ должен проверяться по конкретному peer, а не по факту наличия любого ключа.
2. `producerId` не является каноническим peer key и не может быть единственным источником истины.
3. Запрещен fallback вида "если есть ровно один ключ, использовать его для любого пира".
4. Receiver transform должен привязываться только к peer, для которого существует decryption key.
5. Если ключа для текущего peer нет, consumer переводится в deferred/recovery flow.

## Required Payload Fields (Call/E2EE Path)

1. `peerId` в событиях media signaling (`CONSUMER_ADDED` path) должен передаваться в canonical формате `userId:deviceId`.
2. `senderIdentity.userId` и `senderIdentity.deviceId` в `KEY_PACKAGE` должны быть согласованы с `peerId`.
3. `targetDeviceId` обязателен для адресной доставки `KEY_PACKAGE`.

## Validation Checklist

1. `peerId` содержит `:` и обе части не пустые.
2. При `setupReceiverTransform` проверяется ключ именно для `peerId` (или валидного alias), а не `getDecryptionPeerIds().length > 0`.
3. При отсутствии ключа для конкретного peer логируется deferred/recovery, а не silent attach.

## Failure Signature

Если формат/привязка нарушены, типичный симптом:

- второй участник имеет black video + silence;
- в логах: `No decryption key for peer ... (resolved=...)`;
- при неверном fallback возможно ложное "transform attached", но без decrypt кадров.