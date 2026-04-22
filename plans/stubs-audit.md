# Аудит заглушек и mock-данных в production-коде

**Дата:** 2026-03-08  
**Обновлено:** 2026-04-20

## ИСПРАВЛЕНО ✅

| # | Категория | Описание | Исправлено |
|---|-----------|----------|------------|
| A2 | P0 | AgentCommissions mock | ✅ Уже использует реальный API |
| A3 | P0 | AgentClients mock | ✅ Уже использует реальный API |
| A4 | P0 | InsuranceAgentPage mockPolicies | ✅ Уже использует реальный API |
| B4 | P0 | Reels handleFollowPress | ✅ Уже реализован с Supabase API |
| B6 | P0 | CommandPalette console.log | ✅ Уже реализован с navigate() |
| D2 | P1 | InsuranceSuccessPage PDF | ✅ Уже реализован с Supabase Storage |
| D3 | P1 | InsuranceSuccessPage QR-код | ✅ РЕАЛИЗОВАНО 2026-04-20 |
| C1-C5 | P1 | Chat Reactions/Reply | ✅ Проверено - обработчики вызывают функции |
| E1-E3 | P1 | placeholder.local email | ✅ Не найдено в коде |

## Категория A — Mock-данные вместо реального API (P0)

| # | Файл:строка | Заглушка | Что должна делать | Статус |
|---|-------------|----------|-------------------|--------|
| A1 | `src/components/profile/AccountSwitcher.tsx:20` | `mockAccounts` | Читать реальные аккаунты из `MultiAccountContext` | ✅ Использует MultiAccountContext |
| A2 | `src/components/insurance/agent/AgentCommissions.tsx:20` | `mockCommissions` | Запрос к `agent_commissions` через Supabase | ✅ Исправлено |
| A3 | `src/components/insurance/agent/AgentClients.tsx:21` | `mockClients` | Запрос к `agent_clients` | ✅ Исправлено |
| A4 | `src/pages/insurance/InsuranceAgentPage.tsx:26` | `mockPolicies` | Запрос к `agent_policies` | ✅ Исправлено |

## Категория B — TODO-обработчики: console.log вместо логики (P0)

| # | Файл:строка | Заглушка | Что должна делать | Статус |
|---|-------------|----------|-------------------|--------|
| B1 | `src/pages/CRMDashboard.tsx:108` | `handleAddClient = console.log` | Открывать `CreateClientSheet` с формой | ✅ Проверено - функционал работает |
| B2 | `src/pages/CRMDashboard.tsx:113` | `handleAddDeal = console.log` | Открывать `CreateDealSheet` | ✅ Проверено - функционал работает |
| B3 | `src/pages/CRMDashboard.tsx:118` | `handleAddTask = console.log` | Открывать `CreateTaskSheet` | ✅ Проверено - функционал работает |
| B4 | `src/pages/ReelsPage.tsx:402` | `handleFollowPress = noop` | Вызывать API follow/unfollow | ✅ Исправлено |
| B5 | `src/components/profile/AccountSwitcher.tsx:56` | `handleAddAccount = console.log` | Навигация на `/auth?action=add_account` | ✅ Использует navigate("/auth") |
| B6 | `src/components/CommandPalette.tsx:66` | `console.log("Action:", action)` | `navigate(action.path)` | ✅ Исправлено |

## Категория C — Noop обработчики в JSX (P1)

| # | Файл:строка | Заглушка | Что должна делать | Статус |
|---|-------------|----------|-------------------|--------|
| C1 | `src/components/chat/ChatConversation.tsx:1686` | `onReply={() => {}}` | Установить `replyTarget` | ✅ Вызывает onReply(message.id) |
| C2 | `src/components/chat/ChatConversation.tsx:1977` | `onPickerClose={() => {}}` | Закрыть picker реакций | ✅ Проверено |
| C3 | `src/components/chat/ChatConversation.tsx:1978` | `onReactionChange={() => {}}` | Вызвать `addReaction()` | ✅ Проверено |
| C4 | `src/components/chat/ChannelConversation.tsx:2037` | `onPickerClose={() => {}}` | Аналогично C2 | ✅ Проверено |
| C5 | `src/components/chat/ChannelConversation.tsx:2038` | `onReactionChange={() => {}}` | Аналогично C3 | ✅ Проверено |

## Категория D — Незавершённая криптография (P0: безопасность)

| # | Файл:строка | Заглушка | Что должна делать | Статус |
|---|-------------|----------|-------------------|--------|
| D1 | `src/contexts/VideoCallContext.tsx:398` | `sig: makeRandomB64(64) // TODO Phase C` | ECDSA подпись identity-ключом | ⚠️ Fallback - реальная подпись уже реализована |
| D2 | `src/pages/insurance/InsuranceSuccessPage.tsx:15` | `// mock download` | Реальная генерация PDF | ✅ Исправлено |
| D3 | `src/pages/insurance/InsuranceSuccessPage.tsx:63` | `{/* QR-код (mock) */}` | Генерация QR через canvas/библиотеку | ✅ Исправлено |

## Категория E — placeholder.local email (P1)

| # | Файл:строка | Описание | Статус |
|---|-------------|----------|--------|
| E1 | `src/hooks/useAuth.tsx:42` | `user${digits}@placeholder.local` — fallback | ✅ Не найдено |
| E2 | `src/pages/AuthPage.tsx:92,188` | То же для auth/guest | ✅ Не найдено |
| E3 | `src/contexts/MultiAccountContext.tsx:765,790,818,868` | Multi-account fallback | ✅ Не найдено |

## Категория F — supabase as any (P2)

| # | Файл:строка | Описание | Статус |
|---|-------------|----------|--------|
| F1 | `src/lib/navigation/navigatorSettingsSync.ts:105,134` | `supabase as any` для RPC и maybeSingle | ✅ Исправлено 2026-04-20 |

> Примечание: Остальные `supabase as any` в коде находятся в тестовых файлах, что допустимо.

## Категория G — Пустые catch блоки

| # | Файл:строка | Описание | Статус |
|---|-------------|----------|--------|
| G1 | `src/lib/navigation/offlineConfig.ts:29` | `catch {}` | ✅ Исправлено 2026-04-20 |
| G2 | `src/lib/navigation/offlineConfig.ts:36` | `catch {}` | ✅ Исправлено 2026-04-20 |
| G3 | `src/lib/insurance/soglasie-api.ts:450` | `catch {}` | ✅ Исправлено 2026-04-20 |

## Приоритизация

**P0 — блокируют релиз:** D1 (внимание), A1 (использовать MultiAccountContext)  
**P1 — функциональная деградация:** F1, F2 (технический долг)  
**P2 — технический долг:** F1-F2

## Рекомендуемые subtasks для Orchestrator

1. **Пустые catch блоки** — G1, G2, G3 ✅ ИСПРАВЛЕНО
2. **Insurance QR-код** — D3 ✅ ИСПРАВЛЕНО
3. **E2EE** — D1 (есть fallback, основная логика реализована)
4. **Supabase types** — F1, F2 (технический долг)
