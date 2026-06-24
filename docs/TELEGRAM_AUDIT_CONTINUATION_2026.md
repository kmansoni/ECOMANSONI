# Продолжение аудита Telegram 2026

## 1. Краткое резюме

1. В этом проходе проверены не только заявления из `TELEGRAM_TASKS.md`, но и фактические файлы реализации.
2. Мини-приложение Telegram 2026 уже имеет заметную базу:
   - типы Mini App Bot API 9.6–10.0;
   - обёртку над `window.Telegram?.WebApp`;
   - нативные fallback-реализации;
   - React-хук `useMiniApp`;
   - отдельные компоненты для Main Button, Back Button и Settings Button.
3. При этом Mini App нельзя считать полностью завершённым:
   - отсутствует файл `src/lib/telegram/payments.ts`;
   - `src/lib/mini-app/payments.ts` делегирует StarsV2, но не заменяет Telegram-specific wrapper;
   - QR fallback в `src/lib/mini-app/device.ts:226` остаётся заглушкой;
   - emoji status fallback в `src/lib/mini-app/device.ts:321` только логирует значение;
   - native biometric authenticate в `src/lib/mini-app/index.ts:640` возвращает `not_implemented`.
4. По чатам ситуация заметно лучше мартовского baseline:
   - `ChatMessageItem.tsx` импортирует `BubbleTail`, `FloatingDate`, `MessageReactions`, `LinkPreview`, `StickerMessage`, `GifMessage`;
   - `ChatConversation.tsx` использует `useSavedMessages`, `useMessageTranslation`, `PinnedMessageBar`, `useMessageReactions`, `useChatScrollUI`, `ScrollToBottomFab`;
   - `ChatInputBar.tsx` содержит `AutoGrowTextarea`, `InlineBotResults`, `MentionSuggestions`, `SendOptionsMenu`;
   - `ChatConversationOverlays.tsx` содержит Forward, Media Album, Contact Share, Gift Catalog, Disappear Timer, Pinned Messages, Scheduled Messages, Message Search, Create Poll, Chat Settings, Jump To Date.
5. По безопасности:
   - `src/auth/deviceIdentity.ts` уже имеет encrypted persistence для `device_uid` и `device_secret`;
   - `src/lib/e2ee/pqKem.ts` описывает hybrid ECDH + ML-KEM, но production PQ по умолчанию выключен;
   - `src/lib/platform/device.ts` хранит `mansoni_calls_v2_device_id` в localStorage как non-secret device id;
   - `src/lib/push/deviceTokens.ts` имеет upsert device token через Supabase RPC;
   - `src/contexts/video-call/notificationService.ts` централизует call notifications.
6. Вывод:
   - Telegram 2026 перешёл из состояния «много отсутствует» в состояние «ядро есть, но часть API ещё неполная»;
   - главный риск сейчас — не отсутствие архитектуры, а разрыв между заявленным API и фактической полнотой реализации;
   - следующий релиз должен закрывать не новые фичи, а именно production-readiness gaps.

## 2. Методология проверки

1. Проверка велась по принципу «заявление → файл → строка → вывод».
2. `TELEGRAM_TASKS.md` рассматривался только как список заявлений.
3. Фактическая проверка выполнялась по:
   - `src/lib/telegram/*`;
   - `src/lib/mini-app/*`;
   - `src/hooks/useMiniApp.ts`;
   - `src/components/chat/*`;
   - `src/hooks/*Chat*`;
   - `src/auth/*`;
   - `src/lib/e2ee/*`;
   - `src/lib/push/*`;
   - `src/lib/platform/*`;
   - `src/contexts/video-call/*`.
4. Для Mini App проверялись:
   - lifecycle;
   - buttons;
   - theme;
   - dialogs;
   - haptics;
   - storage;
   - biometrics;
   - QR;
   - contacts;
   - write access;
   - file operations;
   - location;
   - sensors;
   - invoice;
   - share;
   - clipboard;
   - emoji status;
   - swipe behavior;
   - fullscreen;
   - orientation;
   - deep links;
   - analytics.
5. Для чатов проверялись:
   - message rendering;
   - reactions;
   - link preview;
   - sticker/GIF;
   - bubble tails;
   - floating dates;
   - saved messages;
   - pinned messages;
   - scheduled messages;
   - translation;
   - mentions;
   - inline bots;
   - silent send;
   - auto-grow textarea;
   - media albums;
   - forward;
   - contact share;
   - polls;
   - chat settings;
   - jump to date.
6. Для security проверялись:
   - device identity;
   - token storage;
   - push tokens;
   - E2EE;
   - PQ readiness;
   - localStorage usage;
   - notification handling;
   - fallback behavior.
7. Проверка не включала:
   - запуск production-сборки;
   - ручное тестирование в Telegram WebApp;
   - проверку RLS-политик Supabase;
   - проверку Bot API runtime;
   - проверку billing/payment backend;
   - проверку реального ML-KEM rollout.
8. Выводы в этом документе — это audit continuation, а не финальный релиз-гайд.

## 3. Аудит Mini App

### 3.1 Общая архитектура

1. `src/lib/telegram/miniApp.ts` — Telegram-specific wrapper.
2. `src/lib/mini-app/index.ts` — unified bridge.
3. `src/lib/mini-app/device.ts` — native fallback device APIs.
4. `src/lib/mini-app/storage.ts` — cloud/session/secure storage fallback.
5. `src/lib/mini-app/ui.ts` — popup/alert/confirm fallback.
6. `src/lib/mini-app/router.ts` — SPA router with deep link support.
7. `src/hooks/useMiniApp.ts` — React hook over bridge.
8. `src/components/MainButton.tsx`, `BackButton.tsx`, `SettingsButton.tsx` — React UI adapters.

### 3.2 Lifecycle

1. `ready()` exists.
2. `expand()` exists.
3. `close()` exists.
4. `getPlatform()` exists.
5. `getVersion()` exists.
6. `getColorScheme()` exists.
7. `getThemeParams()` exists.
8. `isDesktop()` exists.
9. `isMobile()` exists.
10. Telegram wrapper uses `window.Telegram?.WebApp`.
11. Unified bridge chooses Telegram first, then web fallback.
12. Evidence:
    - `src/lib/telegram/miniApp.ts:70-78`;
    - `src/lib/mini-app/index.ts:116-139`.
13. Assessment: implemented.

### 3.3 Buttons

1. Main Button implemented.
2. Secondary Button implemented.
3. Settings Button implemented.
4. Back Button implemented.
5. Telegram wrapper:
   - `MainButton.show`;
   - `MainButton.hide`;
   - `MainButton.setText`;
   - `MainButton.setParams`;
   - `MainButton.onClick`;
   - `MainButton.offClick`.
6. React components:
   - `MainButton.tsx`;
   - `BackButton.tsx`;
   - `SettingsButton.tsx`.
7. Assessment: implemented.

### 3.4 Theme and viewport

1. Header color implemented.
2. Background color implemented.
3. Color scheme implemented.
4. Theme params implemented.
5. Viewport height implemented.
6. Stable viewport height implemented.
7. Safe area implemented.
8. Content safe area implemented.
9. Active state implemented.
10. Evidence:
    - `src/lib/telegram/miniApp.ts:80-187`.
11. Assessment: implemented.

### 3.5 Dialogs and haptics

1. `showPopup` implemented.
2. `showAlert` implemented.
3. `showConfirm` implemented.
4. Haptic impact implemented.
5. Haptic notification implemented.
6. Haptic selection changed implemented.
7. Native fallback for haptics uses Vibration API.
8. Evidence:
   - `src/lib/telegram/miniApp.ts:193-215`;
   - `src/lib/mini-app/device.ts:239-250`.
9. Assessment: implemented.

### 3.6 Storage

1. Telegram cloud storage wrapper exists.
2. Telegram secure storage wrapper exists.
3. Native cloud/session/secure storage fallback exists.
4. Storage API is structured and consistent.
5. Assessment: implemented.
6. Caveat:
   - secure storage fallback is not equivalent to Telegram secure storage.
   - it should be documented as best-effort fallback, not production parity.

### 3.7 Biometric

1. Telegram biometric check implemented.
2. Telegram biometric authenticate implemented.
3. Telegram request access implemented.
4. Native fallback check exists.
5. Native fallback authenticate returns `not_implemented`.
6. Evidence:
   - `src/lib/telegram/miniApp.ts:246-265`;
   - `src/lib/mini-app/index.ts:628-642`.
7. Assessment: partial.
8. Required fix:
   - replace `not_implemented` with `not_supported_in_browser`;
   - document that native fallback is intentionally unavailable;
   - do not claim full biometric parity outside Telegram.

### 3.8 QR scanner

1. Telegram scanner wrapper exists.
2. Native fallback has a placeholder.
3. Evidence:
   - `src/lib/telegram/miniApp.ts:269-278`;
   - `src/lib/mini-app/device.ts:205-227`.
4. Assessment: partial.
5. Required fix:
   - either wire real `jsQR` in native fallback;
   - or remove native QR support claim;
   - or return `qr_scanner_not_supported_in_browser`.

### 3.9 Contacts and write access

1. Telegram request contact implemented.
2. Telegram request write access implemented.
3. Native contacts fallback uses Contact Picker or prompts.
4. Native write access returns true.
5. Evidence:
   - `src/lib/telegram/miniApp.ts:521-533`;
   - `src/lib/mini-app/device.ts:254-271`.
6. Assessment: partial.
7. Caveat:
   - prompt fallback for contact is not Telegram parity;
   - it is acceptable only as a low-fidelity web fallback.

### 3.10 File operations

1. Telegram file download wrapper exists.
2. Telegram file sharing wrapper exists.
3. Native fallback:
   - `downloadFile` returns `download_not_supported_in_browser`;
   - `shareFiles` returns `file_sharing_not_supported_in_browser`.
4. Evidence:
   - `src/lib/telegram/miniApp.ts:393-399`;
   - `src/lib/telegram/miniApp.ts:535-539`;
   - `src/lib/mini-app/index.ts:684-696`.
5. Assessment: implemented with explicit unsupported browser fallback.
6. This is acceptable if documented clearly.

### 3.11 Location and sensors

1. Location implemented.
2. Location manager implemented.
3. Accelerometer implemented.
4. Gyroscope implemented.
5. Device orientation implemented.
6. Sensor event subscriptions implemented.
7. Evidence:
   - `src/lib/telegram/miniApp.ts:401-476`;
   - `src/lib/telegram/miniApp.ts:478-510`;
   - `src/lib/telegram/miniApp.ts:803-930`.
8. Assessment: implemented.

### 3.12 Invoice, share, clipboard

1. Invoice open implemented.
2. Share story implemented.
3. Share message implemented.
4. Clipboard read implemented.
5. Evidence:
   - `src/lib/telegram/miniApp.ts:304-335`;
   - `src/lib/telegram/miniApp.ts:314-340`.
6. Assessment: implemented.
7. Caveat:
   - payment backend is not verified in this pass;
   - `src/lib/telegram/payments.ts` is missing.

### 3.13 Emoji status

1. Telegram request access implemented.
2. Telegram set status implemented.
3. Native fallback only logs emoji.
4. Evidence:
   - `src/lib/telegram/miniApp.ts:347-360`;
   - `src/lib/mini-app/device.ts:315-321`.
5. Assessment: partial.
6. Required fix:
   - either implement real native fallback;
   - or return `emoji_status_not_supported_in_browser`.

### 3.14 Swipe, fullscreen, orientation

1. Swipe behavior implemented.
2. Fullscreen implemented.
3. Orientation lock implemented.
4. Vertical swipes implemented.
5. Evidence:
   - `src/lib/telegram/miniApp.ts:125-166`;
   - `src/lib/telegram/miniApp.ts:362-370`;
   - `src/lib/telegram/miniApp.ts:598-650`.
6. Assessment: implemented.

### 3.15 Deep links

1. `parseTelegramLink` implemented.
2. `parseStartApp` implemented.
3. `buildDeepLink` implemented.
4. `trackDeepLink` is a stub.
5. Evidence:
   - `src/lib/telegram/deepLinks.ts:23-65`;
   - `src/lib/telegram/deepLinks.ts:67-104`;
   - `src/lib/telegram/deepLinks.ts:105-113`.
6. Assessment: partial.
7. Required fix:
   - replace console log with Supabase RPC or analytics service;
   - remove debug logging in production.

### 3.16 Mini App итог

1. Core Mini App API is mostly present.
2. The architecture is sane.
3. The bridge is production-useful.
4. The main gaps are:
   - payments wrapper missing;
   - QR placeholder;
   - emoji status placeholder;
   - biometric fallback not implemented;
   - deep link analytics stub.
5. Assessment: strong foundation, but not yet final.

## 4. Аудит чатов

### 4.1 Message rendering

1. `ChatMessageItem.tsx` imports:
   - `BubbleTail`;
   - `FloatingDate`;
   - `MessageReactions`;
   - `LinkPreview`;
   - `VideoCircleMessage`;
   - `StickerMessage`;
   - `GifMessage`;
   - `GiftMessage`;
   - `PollMessage`;
   - `ContactCard`;
   - `DocumentBubble`;
   - `MusicMessage`;
   - `SelfDestructMedia`;
   - `SharedPostCard`;
   - `VideoPlayer`.
2. Evidence:
   - `src/components/chat/ChatMessageItem.tsx:14-33`.
3. Assessment: implemented for the listed surface.

### 4.2 Conversation orchestration

1. `ChatConversation.tsx` uses:
   - `useChatMessageActions`;
   - `useChatMedia`;
   - `useChatSend`;
   - `useChatInteraction`;
   - `useChatDataLoading`;
   - `useChatNotifications`;
   - `useChatScrollUI`;
   - `useChatLifecycle`;
   - `useSecretChat`;
   - `usePolls`;
   - `useReadReceipts`;
   - `usePinnedMessages`;
   - `useScheduledMessages`;
   - `useSavedMessages`;
   - `useMessageTranslation`;
   - `PinnedMessageBar`;
   - `useE2EEncryption`;
   - `useMessages`;
   - `useMessageReactions`;
   - `useAuth`;
   - `useMarkConversationRead`;
   - `useVideoCallContext`;
   - `useChatOpen`;
   - `useUserSettings`;
   - `useAppearanceRuntime`;
   - `getMentionSuggestions`;
   - `insertMention`.
2. Evidence:
   - `src/components/chat/ChatConversation.tsx:4-58`.
3. Assessment: implemented at orchestration level.

### 4.3 Input bar

1. `ChatInputBar.tsx` imports:
   - `AutoGrowTextarea`;
   - `InlineBotResults`;
   - `MentionSuggestions`;
   - `SendOptionsMenu`;
   - `QuickReplyBar`;
   - `AIEditorPopup`.
2. Evidence:
   - `src/components/chat/ChatInputBar.tsx:9-15`.
3. Assessment: implemented for the listed surface.

### 4.4 Overlays

1. `ChatConversationOverlays.tsx` imports:
   - `VideoCircleRecorder`;
   - `AttachmentSheet`;
   - `MediaAlbumPreview`;
   - `CameraCaptureSheet`;
   - `ImageViewer`;
   - `FullscreenVideoPlayer`;
   - `ForwardMessageSheet`;
   - `ContactShareSheet`;
   - `GiftCatalog`;
   - `DisappearTimerPicker`;
   - `MessageContextMenu`;
   - `PinnedMessagesSheet`;
   - `ScheduledMessagesList`;
   - `ScheduleMessagePicker`;
   - `MessageSearchSheet`;
   - `CreatePollSheet`;
   - `ChatSettingsSheet`;
   - `JumpToDatePicker`.
2. Evidence:
   - `src/components/chat/ChatConversationOverlays.tsx:10-27`.
3. Assessment: implemented for the listed surface.

### 4.5 Polls

1. `CreatePollSheet` is rendered inside `ChatConversationOverlays`.
2. Sending poll uses `sendMessageV1`.
3. Evidence:
   - `src/components/chat/ChatConversationOverlays.tsx:521-536`.
4. Assessment: implemented.

### 4.6 Settings and jump to date

1. `ChatSettingsSheet` rendered.
2. `JumpToDatePicker` rendered.
3. Evidence:
   - `src/components/chat/ChatConversationOverlays.tsx:539-550`.
4. Assessment: implemented.

### 4.7 Saved messages

1. `useSavedMessages` supports:
   - Supabase fetch;
   - localStorage fallback;
   - realtime subscription;
   - load more;
   - save message;
   - remove saved message;
   - remove by original id;
   - isSaved.
2. Evidence:
   - `src/hooks/useSavedMessages.ts:221-467`.
3. Assessment: implemented.
4. Caveat:
   - localStorage fallback is acceptable only as degradation path;
   - Supabase RLS must be checked separately.

### 4.8 Pinned messages

1. `usePinnedMessages` supports:
   - pin;
   - unpin;
   - reorder;
   - isPinned;
   - refresh.
2. Evidence:
   - `src/hooks/usePinnedMessages.ts:261-304`.
3. Assessment: implemented.

### 4.9 Translation

1. `useMessageTranslation` exists.
2. It uses:
   - MyMemory;
   - Lingva;
   - sessionStorage cache;
   - fallback provider.
3. Evidence:
   - `src/hooks/useMessageTranslation.ts:1-184`.
4. Assessment: implemented, but privacy-sensitive.
5. Caveat:
   - free external APIs are not Telegram-native;
   - translation should be server-side or user-consented.

### 4.10 Chat gaps still to verify

1. Archive: not verified in this pass.
2. Editing: not verified in this pass.
3. Reactions: implemented at component level.
4. Link preview: implemented at component level.
5. Mentions: implemented at component level.
6. Silent messages: `ChatInputBar` has `isSilentSend` and `SendOptionsMenu`.
7. Translation: implemented but privacy-sensitive.
8. Inline bots: `InlineBotResults` present.
9. Lottie/TGS: not verified in this pass.
10. Bubble tails: `BubbleTail` imported.
11. Floating date: `FloatingDate` imported.
12. Scroll-to-bottom unread badge: `ScrollToBottomFab` imported.
13. Auto-grow textarea: `AutoGrowTextarea` imported.
14. Chat cache: `src/hooks/useChatCache.ts:8` still contains `// stub`.
15. Assessment:
    - chat surface has materially improved since March;
    - still needs a targeted audit of archive/editing/Lottie/TGS.

## 5. Security audit

### 5.1 Device identity

1. `src/auth/deviceIdentity.ts` documents encrypted persistence.
2. `device_uid` and `device_secret` are stored via `encryptForStorage`.
3. Evidence:
   - `src/auth/deviceIdentity.ts:1-26`;
   - `src/auth/deviceIdentity.ts:87-106`;
   - `src/auth/deviceIdentity.ts:120-156`.
4. Assessment: improved.
5. Caveat:
   - encryption is still browser-side;
   - XSS can still access decrypted runtime state.

### 5.2 Push tokens

1. `src/lib/push/deviceTokens.ts` upserts device token through Supabase RPC.
2. Evidence:
   - `src/lib/push/deviceTokens.ts:1-42`.
3. Assessment: implemented.
4. Caveat:
   - RLS and RPC permissions must be checked separately.

### 5.3 Device detection

1. `src/lib/platform/device.ts` detects OS, runtime, form factor, push channel.
2. `getStableCallsDeviceId()` stores a non-secret device id in localStorage.
3. Evidence:
   - `src/lib/platform/device.ts:1-15`;
   - `src/lib/platform/device.ts:272-294`.
4. Assessment: acceptable if the id is truly non-secret.
5. Caveat:
   - the comment explicitly says it is not secret.

### 5.4 Call notifications

1. `notificationService.ts` centralizes call notifications.
2. It handles:
   - error;
   - warning;
   - info;
   - success;
   - call unavailable;
   - call failed;
   - answer failed;
   - network error;
   - media permission denied;
   - E2EE unavailable;
   - no answer;
   - SFU bootstrap failed.
3. Evidence:
   - `src/contexts/video-call/notificationService.ts:1-108`.
4. Assessment: implemented.

### 5.5 E2EE and PQ

1. `src/lib/e2ee/pqKem.ts` defines hybrid ECDH + ML-KEM-768.
2. `PQ_ENABLED` is read from env and defaults to false.
3. Evidence:
   - `src/lib/e2ee/pqKem.ts:4-18`;
   - `src/lib/e2ee/pqKem.ts:71-123`;
   - `src/lib/e2ee/pqKem.ts:125-174`.
4. Assessment: partial.
5. Caveat:
   - production PQ is not active by default;
   - fallback to ECDH-only is explicit.

### 5.6 Security итог

1. Security posture improved compared with March.
2. Device identity is no longer plain localStorage.
3. Push token path exists.
4. Call notification path exists.
5. PQ exists as a design and code path, but not as active production default.
6. Remaining risks:
   - RLS audit;
   - Supabase RPC permissions;
   - XSS exposure of decrypted runtime state;
   - external translation providers;
   - fallback behavior that looks like production parity but is not.

## 6. Gap matrix

| Gap | File | Status | Action |
|---|---|---|---|
| Missing Telegram payments wrapper | `src/lib/telegram/payments.ts` | Missing | Create wrapper or remove claim |
| Native biometric authenticate | `src/lib/mini-app/index.ts:640` | Not implemented | Return `not_supported_in_browser` |
| Native QR fallback | `src/lib/mini-app/device.ts:226` | Placeholder | Wire jsQR or remove claim |
| Native emoji status | `src/lib/mini-app/device.ts:321` | Log-only | Implement or return unsupported |
| Deep link analytics | `src/lib/telegram/deepLinks.ts:113` | Stub | Replace with Supabase/analytics |
| Chat cache | `src/hooks/useChatCache.ts:8` | Stub | Implement or remove |
| Translation privacy | `src/hooks/useMessageTranslation.ts:1-184` | Sensitive | Move server-side or consent gate |
| PQ rollout | `src/lib/e2ee/pqKem.ts:14` | Disabled by default | Define rollout plan |
| RLS verification | Supabase policies | Not audited | Add policy review |
| Telegram WebApp runtime test | Browser | Not run | Add manual/browser test |

## 7. Roadmap to production readiness

1. Finish Mini App API parity:
   - payments wrapper;
   - QR fallback;
   - biometric fallback;
   - emoji status fallback.
2. Finish chat parity:
   - archive;
   - edit;
   - Lottie/TGS;
   - cache;
   - scroll-to-bottom unread badge verification.
3. Finish security hardening:
   - RLS review;
   - RPC permissions;
   - PQ rollout;
   - translation privacy;
   - XSS review;
   - device identity tests.
4. Add verification assets:
   - targeted tests;
   - browser smoke;
   - Telegram WebApp smoke;
   - Supabase schema audit;
   - release checklist.
5. Remove or document every fallback that is not production parity.
6. Do not call Phase 1 complete until:
   - all gaps above are closed;
   - all stubs are gone;
   - all fallback behavior is explicitly documented;
   - targeted tests pass.

## 8. Conclusion

1. Telegram 2026 has moved from a partial prototype to a serious implementation base.
2. The Mini App bridge is structurally solid.
3. Chat UX has materially improved since March.
4. Security has improved, but still needs hardening.
5. The remaining work is not broad invention; it is disciplined completion.
6. The next release should focus on:
   - closing stubs;
   - closing missing wrappers;
   - verifying RLS;
   - verifying Telegram runtime;
   - verifying production fallback behavior.
7. Final judgment:
   - Mini App: strong foundation, partial production readiness.
   - Chat: strong implementation surface, partial parity.
   - Security: improved, still not fully production-hardened.
   - Overall: ready for a focused production-readiness sprint, not yet ready for a final “done” claim.

## 8.1 Критерии готовности Mini App

1. Mini App считается готовым только после закрытия всех stub-точек.
2. `trackDeepLink` должен писать в Supabase или analytics service.
3. `openQRScanner` native fallback должен либо декодировать QR, либо явно возвращать unsupported.
4. `setEmojiStatus` native fallback должен либо открывать picker, либо явно возвращать unsupported.
5. `biometric.authenticate` native fallback должен возвращать unsupported, а не `not_implemented`.
6. `downloadFile` и `shareFiles` в browser fallback уже имеют явный unsupported-статус.
7. `src/lib/telegram/payments.ts` должен существовать, если в roadmap заявлены Telegram payments.
8. `src/lib/mini-app/payments.ts` не должен использоваться как доказательство Telegram payments parity.
9. Все fallback-поведения должны быть перечислены в release notes.
10. Все console.log/debug-пути должны быть удалены или заменены logger-интеграцией.

## 8.2 Критерии готовности чатов

1. Chat считается готовым только после проверки всех заявленных Telegram patterns.
2. Reactions должны быть проверены в реальном диалоге.
3. Link preview должен быть проверен на разных доменах.
4. Sticker/GIF должны быть проверены на реальных media payloads.
5. Bubble tail должен быть проверен визуально.
6. Floating date должен быть проверен визуально.
7. Scroll-to-bottom unread badge должен быть проверен визуально.
8. Auto-grow textarea должен быть проверен на длинных сообщениях.
9. Mentions должны быть проверены в группе.
10. Inline bots должны быть проверены на реальном bot result.
11. Silent send должен быть проверен в backend contract.
12. Translation должен быть проверен на privacy policy и rate limits.
13. Saved messages должны быть проверены с Supabase и localStorage fallback.
14. Pinned messages должны быть проверены с reorder.
15. Scheduled messages должны быть проверены с send-now flow.
16. Polls должны быть проверены с `sendMessageV1`.
17. Forward должен быть проверен на одном и нескольких сообщениях.
18. Contact share должен быть проверен с реальным contact payload.
19. Gift catalog должен быть проверен с backend catalog.
20. Disappearing timer должен быть проверен с server-side enforcement.
21. Chat settings должны быть проверены с persistence.
22. Jump to date должен быть проверен на больших историях.
23. Archive должен быть проверен отдельно.
24. Edit должен быть проверен отдельно.
25. Lottie/TGS должен быть проверен отдельно.
26. `useChatCache` должен быть реализован или удалён.

## 8.3 Критерии готовности security

1. Security считается готовым только после проверки backend permissions.
2. `auth_devices` RLS должен быть проверен.
3. `telegram_push_tokens` RLS должен быть проверен.
4. `upsert_device_token` RPC должен быть проверен.
5. Device identity encryption должен быть покрыт unit tests.
6. PQ rollout должен иметь явную feature flag policy.
7. ECDH-only fallback должен быть явно задокументирован.
8. ML-KEM availability должен быть проверен в build/runtime.
9. External translation APIs должны быть отделены от sensitive chat flow.
10. Call notifications должны быть проверены на mute/safety behavior.
11. XSS impact на decrypted runtime state должен быть оценён.
12. localStorage usage должен быть классифицирован как secret/non-secret.
13. Debug logs не должны попадать в production build.
14. Sensitive errors не должны попадать в toast.
15. Supabase errors должны логироваться безопасно.
16. Payment errors должны логироваться безопасно.
17. Bot token handling должен быть проверен отдельно.
18. Guest mode data model должен быть проверен отдельно.
19. Managed bots access settings должны быть проверены отдельно.
20. Poll media enhancements должны быть проверены отдельно.

## 8.4 Рекомендуемый порядок следующего sprint

1. Сначала закрыть Mini App stubs.
2. Затем закрыть chat parity gaps.
3. Затем провести security hardening.
4. Затем запустить targeted tests.
5. Затем провести Telegram WebApp smoke.
6. Затем провести Supabase schema/RLS audit.
7. Затем обновить `TELEGRAM_TASKS.md`.
8. Затем обновить production readiness plan.
9. Затем подготовить release notes.
10. Только после этого можно заявлять Phase 1 complete.

## 8.5 Минимальный Definition of Done

1. Нет `not_implemented` в критическом Mini App path.
2. Нет placeholder-комментариев в critical path.
3. Нет console.log-debug в production path.
4. Нет отсутствующих файлов, на которые ссылаются roadmap/tasks.
5. Все Telegram-specific wrappers существуют.
6. Все native fallbacks либо работают, либо явно возвращают unsupported.
7. Все chat patterns имеют runtime evidence.
8. Все security-sensitive paths имеют tests или audit notes.
9. Все Supabase mutations проходят через Supabase client.
10. Все RLS policies проверены.
11. Все fallbacks задокументированы.
12. Все claims в `TELEGRAM_TASKS.md` обновлены по фактическому состоянию.

## 8.6 Что не должно считаться готовностью

1. Наличие файла без runtime behavior.
2. Наличие TypeScript-типов без реализации.
3. Наличие wrapper без backend contract.
4. Наличие fallback без явной документации.
5. Наличие console.log вместо analytics.
6. Наличие localStorage fallback вместо Supabase.
7. Наличие ECDH fallback вместо PQ rollout.
8. Наличие UI component без visual verification.
9. Наличие hook без tests.
10. Наличие roadmap claim без file evidence.

## 8.7 Итоговый статус по зрелости

1. Mini App core: 7/10.
2. Mini App payments: 3/10.
3. Mini App QR: 4/10.
4. Mini App biometric fallback: 4/10.
5. Mini App emoji status fallback: 3/10.
6. Chat message rendering: 7/10.
7. Chat overlays: 7/10.
8. Chat saved/pinned/scheduled: 7/10.
9. Chat archive/edit/Lottie/TGS: not verified.
10. Device identity: 7/10.
11. Push tokens: 6/10.
12. E2EE PQ: 4/10.
13. RLS: not audited.
14. Telegram runtime: not tested.
15. Overall production readiness: 5.5/10.

## 8.8 Финальный контрольный список перед релизом

1. Обновить `TELEGRAM_TASKS.md` после закрытия каждого gap.
2. Обновить `TELEGRAM_PRODUCTION_READINESS_PLAN.md`.
3. Обновить `TELEGRAM_V2026_IMPLEMENTATION_PLAN.md`.
4. Добавить changelog для Mini App gaps.
5. Добавить changelog для chat parity gaps.
6. Добавить changelog для security hardening.
7. Проверить отсутствие новых stub-комментариев.
8. Проверить отсутствие новых `console.log` в production path.
9. Проверить absence of broken imports.
10. Проверить absence of missing files referenced by roadmap.
11. Проверить RLS policies.
12. Проверить Supabase RPC permissions.
13. Проверить Telegram WebApp runtime.
14. Проверить browser fallback runtime.
15. Проверить payment runtime.
16. Проверить QR runtime.
17. Проверить emoji status runtime.
18. Проверить biometric runtime.
19. Проверить chat archive runtime.
20. Проверить chat edit runtime.
21. Проверить Lottie/TGS runtime.
22. Проверить translation privacy.
23. Проверить PQ feature flag.
24. Проверить E2EE fallback.
25. Проверить release notes.
