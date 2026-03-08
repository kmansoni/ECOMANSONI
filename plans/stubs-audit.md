# Аудит заглушек и mock-данных в production-коде

**Дата:** 2026-03-08

## Категория A — Mock-данные вместо реального API (P0)

| # | Файл:строка | Заглушка | Что должна делать |
|---|-------------|----------|-------------------|
| A1 | `src/components/profile/AccountSwitcher.tsx:20` | `mockAccounts` | Читать реальные аккаунты из `MultiAccountContext` |
| A2 | `src/components/insurance/agent/AgentCommissions.tsx:20` | `mockCommissions` | Запрос к `agent_commissions` через Supabase |
| A3 | `src/components/insurance/agent/AgentClients.tsx:21` | `mockClients` | Запрос к `agent_clients` |
| A4 | `src/pages/insurance/InsuranceAgentPage.tsx:26` | `mockPolicies` | Запрос к `agent_policies` |

## Категория B — TODO-обработчики: console.log вместо логики (P0)

| # | Файл:строка | Заглушка | Что должна делать |
|---|-------------|----------|-------------------|
| B1 | `src/pages/CRMDashboard.tsx:108` | `handleAddClient = console.log` | Открывать `CreateClientSheet` с формой |
| B2 | `src/pages/CRMDashboard.tsx:113` | `handleAddDeal = console.log` | Открывать `CreateDealSheet` |
| B3 | `src/pages/CRMDashboard.tsx:118` | `handleAddTask = console.log` | Открывать `CreateTaskSheet` |
| B4 | `src/pages/ReelsPage.tsx:402` | `handleFollowPress = noop` | Вызывать API follow/unfollow |
| B5 | `src/components/profile/AccountSwitcher.tsx:56` | `handleAddAccount = console.log` | Навигация на `/auth?action=add_account` |
| B6 | `src/components/CommandPalette.tsx:66` | `console.log("Action:", action)` | `navigate(action.path)` |

## Категория C — Noop обработчики в JSX (P1)

| # | Файл:строка | Заглушка | Что должна делать |
|---|-------------|----------|-------------------|
| C1 | `src/components/chat/ChatConversation.tsx:1686` | `onReply={() => {}}` | Установить `replyTarget` |
| C2 | `src/components/chat/ChatConversation.tsx:1977` | `onPickerClose={() => {}}` | Закрыть picker реакций |
| C3 | `src/components/chat/ChatConversation.tsx:1978` | `onReactionChange={() => {}}` | Вызвать `addReaction()` |
| C4 | `src/components/chat/ChannelConversation.tsx:2037` | `onPickerClose={() => {}}` | Аналогично C2 |
| C5 | `src/components/chat/ChannelConversation.tsx:2038` | `onReactionChange={() => {}}` | Аналогично C3 |

## Категория D — Незавершённая криптография (P0: безопасность)

| # | Файл:строка | Заглушка | Что должна делать |
|---|-------------|----------|-------------------|
| D1 | `src/contexts/VideoCallContext.tsx:398` | `sig: makeRandomB64(64) // TODO Phase C` | ECDSA подпись identity-ключом |
| D2 | `src/pages/insurance/InsuranceSuccessPage.tsx:15` | `// mock download` | Реальная генерация PDF |
| D3 | `src/pages/insurance/InsuranceSuccessPage.tsx:63` | `{/* QR-код (mock) */}` | Генерация QR через canvas/библиотеку |

## Категория E — placeholder.local email (P1)

| # | Файл:строка | Описание |
|---|-------------|----------|
| E1 | `src/hooks/useAuth.tsx:42` | `user${digits}@placeholder.local` — fallback |
| E2 | `src/pages/AuthPage.tsx:92,188` | То же для auth/guest |
| E3 | `src/contexts/MultiAccountContext.tsx:765,790,818,868` | Multi-account fallback |

## Категория F — supabase as any (P2)

| # | Файл:строка | Описание |
|---|-------------|----------|
| F1 | `src/pages/live/LiveBroadcastRoom.tsx:64` | `supabase as any` — нужна регенерация типов |
| F2 | `src/hooks/useTOTP.ts:65` | `(supabase as any).from("user_totp_secrets")` |

## Приоритизация

**P0 — блокируют релиз:** D1, A1-A4, B1-B6  
**P1 — функциональная деградация:** C1-C5, D2-D3, E1-E3  
**P2 — технический долг:** F1-F2

## Рекомендуемые subtasks для Orchestrator

1. **E2EE и Security** — D1 + план из `plans/e2ee-key-storage-fix.md`
2. **Insurance Agent** — A2, A3, A4, D2, D3
3. **Chat Reactions/Reply** — C1-C5
4. **CRM Dashboard** — B1-B3
5. **AccountSwitcher + CommandPalette + Reels Follow** — A1, B4, B5, B6
6. **Auth emails + Supabase types** — E1-E3, F1-F2
