---
name: group-video-call-integration-status
description: Статус интеграции группового видеозвонка — 4 задачи завершены, tsc и build прошли
type: project
---

## Статус: Группа видеозвонок — ИНТЕГРИРОВАНО ✅

### Завершённые задачи:
1. **Route /group-call/:roomId** — lazy-loaded в App.tsx:970
2. **GroupVideoCallPage.tsx** — useAuth() для real currentUserId
3. **ChatHeader.tsx** — кнопка <Monitor /> для групповых чатов
4. **ChatConversation.tsx** — проводка handleStartGroupVideoCall

### Верификация:
- `tsc --noEmit` — ✅ 0 ошибок
- `vite build` — ✅ успешно

### Неблокирующие улучшения (backlog):
1. Имя группы в GroupVideoCallPage — подтянуть из БД (dbLoose)
2. useGroupVideoCall participant-stream — подключить mediasoup consumer
3. Edge Function group-call-invite — для кнопки приглашения
4. ChatConversationOverlays — опциональный всплывающий оверлей

**Когда применять:** Принято по результатам review
