# Frontend Platform Baseline

Generated: 2026-02-24T09:47:20.914Z

## Summary
- PASS: 4
- FAIL: 5

## Check Results
- FP-UI-004 | FAIL | UI public API boundary present (packages/ui + exports) | packages/ui missing
- FP-UI-001A | FAIL | No new legacy imports (baseline visibility) | 67 legacy imports found
  Samples: src/components/admin/AdminShell.tsx:3, src/components/auth/RegistrationModal.tsx:3, src/components/chat/ChannelConversation.tsx:32, src/components/chat/ChatConversation.tsx:5, src/components/chat/CreateChatSheet.tsx:5, src/components/chat/GroupConversation.tsx:8, src/components/chat/ImageViewer.tsx:3, src/components/chat/IncomingVideoCallSheet.tsx:2, src/components/chat/VideoPlayer.tsx:3, src/components/editor/MediaEditorModal.tsx:3, src/components/editor/SimpleMediaEditor.tsx:3, src/components/feed/CommentsSheet.tsx:3, src/components/feed/CreatePost.tsx:1, src/components/feed/CreatePostSheet.tsx:3, src/components/feed/PostCard.tsx:2, src/components/feed/PostEditorFlow.tsx:3, src/components/feed/PostOptionsSheet.tsx:2, src/components/feed/ShareSheet.tsx:4, src/components/feed/StoryEditorFlow.tsx:3, src/components/FloatingSearchButton.tsx:2
- FP-UI-002 | FAIL | No raw colors outside tokens | 92 raw color occurrences
  Samples: src/App.css:15, src/App.css:18, src/App.css:41, src/components/chat/ChatConversation.tsx:932, src/components/chat/ChatConversation.tsx:965, src/components/chat/ChatConversation.tsx:967, src/components/chat/ChatConversation.tsx:970, src/components/chat/ChatConversation.tsx:976, src/components/chat/ChatConversation.tsx:995, src/components/chat/ChatConversation.tsx:1006, src/components/chat/ChatConversation.tsx:1023, src/components/chat/ChatConversation.tsx:1155, src/components/chat/ChatConversation.tsx:1175, src/components/chat/ChatConversation.tsx:1214, src/components/chat/ChatConversation.tsx:1251, src/components/chat/ChatConversation.tsx:1282, src/components/chat/ChatConversation.tsx:1322, src/components/chat/ChatConversation.tsx:1359, src/components/chat/ChatConversation.tsx:1402, src/components/chat/ChatConversation.tsx:1470
- FP-SEC-703A | FAIL | No direct Web Storage outside runtime wrapper | 71 direct storage references
  Samples: src/components/auth/ProtectedRoute.tsx:10, src/components/chat/ChannelConversation.tsx:131, src/components/chat/ChannelConversation.tsx:158, src/components/chat/ChannelConversation.tsx:246, src/components/chat/ChannelConversation.tsx:418, src/components/chat/ChatConversation.tsx:175, src/components/chat/ChatConversation.tsx:268, src/components/reels/CreateReelSheet.tsx:152, src/components/reels/CreateReelSheet.tsx:211, src/components/reels/CreateReelSheet.tsx:219, src/hooks/usePosts.tsx:33, src/hooks/usePosts.tsx:36, src/hooks/useReels.tsx:208, src/hooks/useReels.tsx:211, src/hooks/useReels.tsx:663, src/hooks/useReels.tsx:666, src/hooks/useReels.tsx:695, src/hooks/useReels.tsx:698, src/hooks/useReels.tsx:726, src/hooks/useReels.tsx:729
- FP-ARCH-503A | FAIL | Transport usage only in DAL/runtime | 12 direct transport usages
  Samples: server/calls-ws/index.mjs:161, server/calls-ws/index.mjs:235, services/notification-router/src/providers/fcm.ts:46, services/notification-router/src/providers/fcm.ts:67, src/calls-v2/wsClient.ts:31, src/components/feed/StoryEditorFlow.tsx:114, src/components/feed/StoryEditorFlow.tsx:150, src/components/insurance/InsuranceAssistant.tsx:48, src/components/realestate/PropertyAssistant.tsx:47, src/hooks/useAuth.tsx:53, src/lib/network/fetchWithTimeout.ts:33, src/pages/AuthPage.tsx:35
- FP-GOV-8001B | PASS | Branch protection contract exists | present
- FP-MIG-901 | PASS | Stage control SSOT exists | present
- FP-MIG-9102 | PASS | Flows SSOT exists | present
- ROUTEMAP-001 | PASS | Route-map SSOT exists | present

## Gap Priority
- P0: create canonical UI/tokens/runtime/contracts packages and boundary gates.
- P1: migrate legacy button imports and direct transport/storage usage.
- P2: enable staged required checks (S0 -> S1 -> S2).