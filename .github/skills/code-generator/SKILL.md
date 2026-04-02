---
name: code-generator
description: "Генерация типовых компонентов и модулей из шаблонов. Scaffolding: page + components + hooks + store + types + migration + Edge Function. Use when: создать модуль, scaffold, шаблон компонента, шаблон хука, шаблон store, шаблон миграции, шаблон Edge Function, barrel файл, новая страница, новый модуль."
argument-hint: "[тип шаблона: module | component | hook | store | migration | edge-function | page]"
user-invocable: true
---

# Code Generator — Генерация кода из шаблонов

Автоматическая генерация типовых компонентов, модулей, хуков, stores, миграций и Edge Functions по проверенным шаблонам проекта. Каждый шаблон включает ВСЕ обязательные состояния, паттерны и стандарты.

## Принцип

> Не пиши boilerplate — генерируй. Каждый новый файл создаётся по шаблону, уже содержащему: TypeScript strict types, все UI-состояния, error handling, правильные imports, RLS-политики. Нулевое время на scaffolding.

---

## 1. Шаблон: Полный модуль платформы

Создаёт полную структуру нового модуля домена:

```
src/
  pages/{Module}Page.tsx              — Главная страница модуля
  components/{module}/
    {Module}Header.tsx                — Заголовок модуля
    {Module}List.tsx                  — Список основных сущностей
    {Module}Card.tsx                  — Карточка сущности
    {Module}Detail.tsx                — Детальный просмотр
    {Module}Create.tsx                — Создание новой сущности
    {Module}Filters.tsx               — Фильтры
    {Module}Skeleton.tsx              — Skeleton для загрузки
    {Module}EmptyState.tsx            — Пустое состояние
    index.ts                          — Barrel export
  hooks/
    use{Module}.ts                    — Основной хук данных (TanStack Query)
    use{Module}Mutations.ts           — Мутации (create, update, delete)
    use{Module}Filters.ts             — Состояние фильтров
    use{Module}Realtime.ts            — Realtime подписка (если нужна)
  stores/
    {module}-store.ts                 — Zustand store (UI state)
  lib/
    {module}/
      types.ts                        — TypeScript интерфейсы
      constants.ts                    — Константы модуля
      utils.ts                        — Утилиты
supabase/
  migrations/
    YYYYMMDDHHMMSS_create_{module}_tables.sql  — Таблицы + RLS + индексы
  functions/
    {module}-api/index.ts             — Edge Function (если нужна)
```

### Генерация модуля: чеклист

```
1. ☐ Определить доменную сущность (Order, Policy, Property, Ride, Product...)
2. ☐ Определить поля таблицы + типы + constraints
3. ☐ Определить RLS-политики (кто читает, кто пишет)
4. ☐ Создать SQL миграцию
5. ☐ Создать TypeScript types (из миграции)
6. ☐ Создать хук данных (useQuery + select)
7. ☐ Создать хук мутаций (useMutation + optimistic update)
8. ☐ Создать Zustand store (UI state: filters, selection, modal state)
9. ☐ Создать компонент списка (с виртуализацией если >50 элементов)
10. ☐ Создать компонент карточки (с доменным accent color)
11. ☐ Создать skeleton, empty state, error state
12. ☐ Создать страницу-обёртку
13. ☐ Добавить в router
14. ☐ Barrel exports
```

---

## 2. Шаблон: React компонент

```typescript
// Файл: src/components/{module}/{ComponentName}.tsx

import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface {ComponentName}Props {
  /** Описание prop */
  id: string;
  /** Optional callback */
  onAction?: (id: string) => void;
  /** CSS классы */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_ITEMS = 50;

// =============================================================================
// Component
// =============================================================================

export function {ComponentName}({ id, onAction, className }: {ComponentName}Props) {
  // --- Hooks ---
  // ... useQuery, useState, etc.

  // --- Derived state ---
  // const processedData = useMemo(() => ..., [data]);

  // --- Handlers ---
  // const handleClick = useCallback(() => ..., []);

  // --- Loading ---
  if (isLoading) return <{ComponentName}Skeleton />;

  // --- Error ---
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive opacity-60" />
        <p className="text-sm text-muted-foreground">Не удалось загрузить данные</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Повторить
        </Button>
      </div>
    );
  }

  // --- Empty ---
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center text-muted-foreground">
        {/* <Icon className="h-12 w-12 opacity-50" /> */}
        <p>Нет данных</p>
      </div>
    );
  }

  // --- Success ---
  return (
    <div className={cn("relative", className)}>
      {/* main content */}
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function {ComponentName}Skeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

### Варианты шаблона компонента

| Тип | Особенности |
|-----|-------------|
| **List** | useVirtualizer, infinite scroll, pull-to-refresh |
| **Card** | aspect-ratio image, domain accent, actions footer |
| **Form** | react-hook-form, zod validation, field errors |
| **Modal** | ResponsiveModal (Sheet на mobile, Dialog на desktop) |
| **Detail** | header + scrollable content + sticky footer |
| **Settings section** | label + description + control (switch/select/input) |

---

## 3. Шаблон: Edge Function (Deno)

```typescript
// Файл: supabase/functions/{function-name}/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  field1: string;
  field2?: number;
}

interface ResponseBody {
  success: boolean;
  data?: unknown;
  error?: string;
}

// =============================================================================
// Validation
// =============================================================================

function validateRequest(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.field1 !== "string" || b.field1.length === 0 || b.field1.length > 1000) return false;
  if (b.field2 !== undefined && (typeof b.field2 !== "number" || b.field2 < 0)) return false;
  return true;
}

// =============================================================================
// Handler
// =============================================================================

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase client (as user)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse & validate body
    const body = await req.json();
    if (!validateRequest(body)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Business logic ---
    // const { data, error } = await supabase.from('table').select('*').limit(100);
    // if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, data: null } satisfies ResponseBody),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[{function-name}]", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## 4. Шаблон: Zustand Store

```typescript
// Файл: src/stores/{module}-store.ts

import { create } from "zustand";
import { persist } from "zustand/middleware";

// =============================================================================
// Types
// =============================================================================

interface {Module}Filters {
  search: string;
  category: string | null;
  sortBy: "newest" | "popular" | "price_asc" | "price_desc";
}

interface {Module}State {
  // UI state
  filters: {Module}Filters;
  selectedId: string | null;
  isCreateOpen: boolean;

  // Actions
  setFilter: <K extends keyof {Module}Filters>(key: K, value: {Module}Filters[K]) => void;
  resetFilters: () => void;
  setSelected: (id: string | null) => void;
  toggleCreate: () => void;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_FILTERS: {Module}Filters = {
  search: "",
  category: null,
  sortBy: "newest",
};

// =============================================================================
// Store
// =============================================================================

export const use{Module}Store = create<{Module}State>()(
  persist(
    (set) => ({
      filters: { ...DEFAULT_FILTERS },
      selectedId: null,
      isCreateOpen: false,

      setFilter: (key, value) =>
        set((s) => ({ filters: { ...s.filters, [key]: value } })),

      resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

      setSelected: (id) => set({ selectedId: id }),

      toggleCreate: () => set((s) => ({ isCreateOpen: !s.isCreateOpen })),
    }),
    {
      name: "{module}-store",
      // Persit только фильтры (не UI state)
      partialize: (s) => ({ filters: s.filters }),
    }
  )
);

// =============================================================================
// Selectors (для предотвращения лишних ре-рендеров)
// =============================================================================

export const use{Module}Filters = () => use{Module}Store((s) => s.filters);
export const use{Module}Selected = () => use{Module}Store((s) => s.selectedId);
```

---

## 5. Шаблон: SQL миграция

```sql
-- Файл: supabase/migrations/YYYYMMDDHHMMSS_create_{module}_tables.sql

-- =============================================================================
-- Table: {entities}
-- =============================================================================

CREATE TABLE IF NOT EXISTS {entities} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Бизнес-поля
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description text CHECK (char_length(description) <= 5000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
  price numeric(12,2) CHECK (price >= 0),
  
  -- Метаданные
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_{entities}_user_id ON {entities}(user_id);
CREATE INDEX IF NOT EXISTS idx_{entities}_status ON {entities}(status) WHERE status != 'deleted';
CREATE INDEX IF NOT EXISTS idx_{entities}_created_at ON {entities}(created_at DESC);

-- Полнотекстовый поиск (если нужен)
-- ALTER TABLE {entities} ADD COLUMN IF NOT EXISTS search_vector tsvector
--   GENERATED ALWAYS AS (
--     setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
--     setweight(to_tsvector('russian', coalesce(description, '')), 'B')
--   ) STORED;
-- CREATE INDEX IF NOT EXISTS idx_{entities}_search ON {entities} USING GIN(search_vector);

-- =============================================================================
-- Triggers
-- =============================================================================

-- updated_at auto-update
CREATE OR REPLACE FUNCTION update_{entities}_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_{entities}_updated_at
  BEFORE UPDATE ON {entities}
  FOR EACH ROW EXECUTE FUNCTION update_{entities}_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE {entities} ENABLE ROW LEVEL SECURITY;

-- Чтение: владелец видит свои
CREATE POLICY "{entities}_select_own" ON {entities}
  FOR SELECT USING (user_id = auth.uid());

-- Публичные (если нужно): видят все с status = 'active'
-- CREATE POLICY "{entities}_select_public" ON {entities}
--   FOR SELECT USING (status = 'active');

-- Создание: auth.uid() = user_id
CREATE POLICY "{entities}_insert_own" ON {entities}
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Обновление: только владелец
CREATE POLICY "{entities}_update_own" ON {entities}
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Удаление: только владелец (soft delete рекомендуется)
CREATE POLICY "{entities}_delete_own" ON {entities}
  FOR DELETE USING (user_id = auth.uid());
```

---

## 6. Шаблон: TanStack Query хук

```typescript
// Файл: src/hooks/use{Module}.ts

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import type { {Entity} } from "@/lib/{module}/types";

// =============================================================================
// Query Keys
// =============================================================================

export const {module}Keys = {
  all: ["{module}"] as const,
  lists: () => [...{module}Keys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...{module}Keys.lists(), filters] as const,
  details: () => [...{module}Keys.all, "detail"] as const,
  detail: (id: string) => [...{module}Keys.details(), id] as const,
};

// =============================================================================
// List hook (с пагинацией)
// =============================================================================

const PAGE_SIZE = 20;

export function use{Module}List(filters: { search?: string; status?: string }) {
  return useInfiniteQuery({
    queryKey: {module}Keys.list(filters),
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("{entities}")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (filters.search) {
        query = query.textSearch("search_vector", filters.search);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as {Entity}[], count, nextOffset: pageParam + PAGE_SIZE };
    },
    getNextPageParam: (last) =>
      last.count && last.nextOffset < last.count ? last.nextOffset : undefined,
    initialPageParam: 0,
  });
}

// =============================================================================
// Detail hook
// =============================================================================

export function use{Module}Detail(id: string | null) {
  return useQuery({
    queryKey: {module}Keys.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("{entities}")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as {Entity};
    },
    enabled: !!id,
  });
}

// =============================================================================
// Mutations
// =============================================================================

export function use{Module}Create() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<{Entity}, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("{entities}")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as {Entity};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: {module}Keys.lists() });
      toast.success("Создано");
    },
    onError: (err) => {
      toast.error("Ошибка создания: " + (err as Error).message);
    },
  });
}

export function use{Module}Update() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<{Entity}> & { id: string }) => {
      const { data, error } = await supabase
        .from("{entities}")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as {Entity};
    },
    // Optimistic update
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: {module}Keys.detail(updated.id) });
      const previous = queryClient.getQueryData({module}Keys.detail(updated.id));
      queryClient.setQueryData({module}Keys.detail(updated.id), (old: {Entity} | undefined) =>
        old ? { ...old, ...updated } : old
      );
      return { previous };
    },
    onError: (_err, updated, context) => {
      if (context?.previous) {
        queryClient.setQueryData({module}Keys.detail(updated.id), context.previous);
      }
      toast.error("Ошибка обновления");
    },
    onSettled: (_data, _err, updated) => {
      queryClient.invalidateQueries({ queryKey: {module}Keys.detail(updated.id) });
      queryClient.invalidateQueries({ queryKey: {module}Keys.lists() });
    },
  });
}

export function use{Module}Delete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete
      const { error } = await supabase
        .from("{entities}")
        .update({ status: "deleted" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: {module}Keys.lists() });
      toast.success("Удалено");
    },
    onError: () => {
      toast.error("Ошибка удаления");
    },
  });
}
```

---

## 7. Шаблон: Realtime subscription хук

```typescript
// Файл: src/hooks/use{Module}Realtime.ts

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { {module}Keys } from "./use{Module}";
import type { {Entity} } from "@/lib/{module}/types";

export function use{Module}Realtime(entityId?: string) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!entityId) return;

    const channel = supabase
      .channel(`{module}:${entityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "{entities}",
          filter: `id=eq.${entityId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            queryClient.setQueryData(
              {module}Keys.detail(entityId),
              payload.new as {Entity}
            );
          }
          if (payload.eventType === "DELETE") {
            queryClient.invalidateQueries({ queryKey: {module}Keys.detail(entityId) });
          }
          // Инвалидировать список
          queryClient.invalidateQueries({ queryKey: {module}Keys.lists() });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [entityId, queryClient]);
}
```

---

## 8. Шаблон: Barrel index.ts

```typescript
// Файл: src/components/{module}/index.ts

export { {Module}List } from "./{Module}List";
export { {Module}Card } from "./{Module}Card";
export { {Module}Detail } from "./{Module}Detail";
export { {Module}Create } from "./{Module}Create";
export { {Module}Filters } from "./{Module}Filters";
export { {Module}Skeleton } from "./{Module}Skeleton";
export { {Module}EmptyState } from "./{Module}EmptyState";
```

---

## 9. Scaffolding по доменам

| Домен | Сущности | Специфичные компоненты |
|-------|----------|----------------------|
| **Мессенджер** | channels, messages, reactions | MessageBubble, ChatInput, TypingIndicator, MediaPreview |
| **Соцсеть/Feed** | posts, comments, likes | PostCard, CommentThread, ImageGrid, StoryViewer |
| **Знакомства** | profiles, matches, swipes | SwipeCard, MatchPopup, ProfileGallery, FilterSheet |
| **Такси** | rides, drivers, routes | MapView, RideStatus, DriverCard, PriceEstimate |
| **Маркетплейс** | products, orders, reviews | ProductGrid, CartSheet, OrderTimeline, ReviewForm |
| **CRM** | contacts, deals, activities | KanbanBoard, ContactCard, DealPipeline, ActivityLog |
| **Стриминг** | streams, chat_messages, donations | VideoPlayer, LiveChat, DonationAlert, StreamOverlay |
| **Страхование** | policies, claims, quotes | PolicyCard, ClaimForm, QuoteCalculator, CoverageMatrix |
| **Недвижимость** | properties, favorites, viewings | PropertyGallery, MapSearch, MortgageCalc, ViewingSchedule |

---

## 10. Workflow генерации

### Фаза 1: Сбор требований
1. Определить домен и основную сущность
2. Определить поля (из задачи или миграции)
3. Определить кто имеет доступ (RLS)
4. Определить есть ли realtime

### Фаза 2: Генерация backend
1. SQL миграция (таблица + индексы + триггеры + RLS)
2. TypeScript types
3. Edge Function (если нужна серверная логика)

### Фаза 3: Генерация frontend
1. Zustand store (UI state)
2. TanStack Query хуки (CRUD + pagination)
3. Realtime хук (если нужен)
4. Компоненты (список + карточка + детали + создание)
5. Skeleton + Empty + Error states
6. Страница-обёртка
7. Barrel exports

### Фаза 4: Интеграция
1. Добавить route в router
2. Добавить в навигацию (если корневой модуль)
3. Обновить types

---

## Маршрутизация в оркестраторе

**Триггеры**: создать модуль, scaffold, сгенерировать, шаблон, boilerplate, новая страница, новый модуль, создать компонент, создать хук, создать store, создать миграцию, создать Edge Function, barrel, index.ts, CRUD, scaffolding

**Агенты**:
- `codesmith` — основной исполнитель генерации
- `architect` — при проектировании нового модуля (до генерации)
