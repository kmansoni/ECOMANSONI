import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Supabase Edge Function: optimize-prompt
 *
 * POST /functions/v1/optimize-prompt
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body: { prompt: string, agent_type?: string }
 *
 * Требует авторизации — JWT верифицируется через Supabase Auth.
 * Вызывает Python ИИ-оркестратор для оптимизации запросов перед выполнением.
 */

interface OptimizeRequest {
  prompt: string;
  agent_type?: string;
}

interface OptimizeResponse {
  original: string;
  optimized: string;
  improvement_score: number;
  changes: string[];
  reasoning: string;
}

/** Разрешённый Origin: ограничиваем собственным доменом в продакшне. */
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  // ── Auth: проверяем JWT через Supabase Auth ──────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[OPTIMIZER] Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
  // ── End Auth ─────────────────────────────────────────────────────────────

  try {
    const body: OptimizeRequest = await req.json();
    const { prompt, agent_type = "general" } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // TODO: Заменить mock на реальный вызов Python Orchestrator через message bus.
    // Пока возвращаем шаблонный ответ (фича в разработке).
    const optimizedText = generateOptimizedPrompt(prompt, agent_type);
    const mockOptimization: OptimizeResponse = {
      original: prompt,
      optimized: optimizedText,
      // Реальный score будет вычисляться ML-моделью — временное значение
      improvement_score: optimizedText.length > prompt.length ? 0.72 : 0.1,
      changes: [
        "✓ Добавлены критерии оценки результатов",
        "✓ Расширен контекст задачи",
        "✓ Добавлены примеры успешных решений",
        "✓ Уточнены ограничения и требования",
      ],
      reasoning: `
Запрос был оптимизирован следующим образом:

❌ Выявленные пробелы:
  • Отсутствует контекст задачи
  • Не указаны ограничения
  • Не указаны критерии успеха

✓ Добавлены структурированные разделы по шаблону агента «${agent_type}»

📊 Оценка ясности запроса: предварительная (реальная модель в разработке)
      `.trim(),
    };

    console.log(
      `[OPTIMIZER] user=${user.id} agent=${agent_type} prompt_len=${prompt.length}`
    );

    return new Response(JSON.stringify(mockOptimization), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      status: 200,
    });
  } catch (error) {
    console.error("[OPTIMIZER] Error:", error);

    return new Response(
      JSON.stringify({
        error: "Optimization failed",
        // Не раскрываем внутренние детали клиенту в продакшне
        details: Deno.env.get("DENO_ENV") !== "production"
          ? (error instanceof Error ? error.message : "Unknown error")
          : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }
});

/**
 * Генерировать оптимизированный запрос на основе типа агента
 */
function generateOptimizedPrompt(prompt: string, agentType: string): string {
  const templates: Record<string, (p: string) => string> = {
    explorer: (p) => `
## ОСНОВНАЯ ЗАДАЧА
${p}

## КОНТЕКСТ И ОГРАНИЧЕНИЯ
- Ищи в открытых репозиториях и документации
- Приоритизируй официальные источники
- Объясни найденные паттерны

## КРИТЕРИИ УСПЕХА
- ✓ Найдено 3+ релевантных источников
- ✓ Каждый источник с прямыми ссылками
- ✓ Примеры кода где применимо

## ИНСТРУКЦИИ ПО ОТВЕТУ
1. Кратко резюмируй подход
2. Дай подробный обзор каждого источника
3. Приведи примеры использования
4. Указ рекомендации по применению
    `,

    architect: (p) => `
## ОСНОВНАЯ ЗАДАЧА
${p}

## КОНТЕКСТ И ОГРАНИЧЕНИЯ
- Архитектура должна быть масштабируемой
- Все API должны иметь .limit()
- RLS политики обязательны в Supabase
- TypeScript strict без any

## КРИТЕРИИ УСПЕХА
- ✓ Модели данных четко определены
- ✓ API контракт задокументирован
- ✓ UI состояния перечислены
- ✓ Edge cases описаны
- ✓ Лимиты и ограничения явно указаны

## ИНСТРУКЦИИ ПО ОТВЕТУ
1. Дай краткое резюме архитектуры
2. Определи модели данных и схемы
3. Опиши API контракт
4. Перечисли UI состояния и transitions
5. Укажи потенциальные риски
    `,

    coder: (p) => `
## ОСНОВНАЯ ЗАДАЧА
${p}

## КОНТЕКСТ И ОГРАНИЧЕНИЯ
- TypeScript strict, 0 ошибок tsc
- Максимум 400 строк на компонент
- Все async в try/catch
- No duplicated code (DRY)

## КРИТЕРИИ УСПЕХА
- ✓ Код проходит типизацию в strictMode
- ✓ Логика обработки ошибок полная
- ✓ Компоненты переиспользуемы
- ✓ Нет console.log в production

## ИНСТРУКЦИИ ПО ОТВЕТУ
1. Кратко объясни подход
2. Напиши production-ready код
3. Включи обработку ошибок
4. Добавь примеры использования
5. Укажи на потенциальные проблемы
    `,

    reviewer: (p) => `
## ОСНОВНАЯ ЗАДАЧА
${p}

## КОНТЕКСТ И ОГРАНИЧЕНИЯ
Проверь по 8 направлениям:
1. Безопасность (Security)
2. Корректность (Correctness)
3. UI компоненты
4. UX опыт
5. Архитектура
6. Performance
7. Тестирование
8. Документация

## КРИТЕРИИ УСПЕХА
- ✓ Каждое направление оценено 1-10
- ✓ Приведены конкретные примеры проблем
- ✓ Даны рекомендации по исправлению

## ИНСТРУКЦИИ ПО ОТВЕТУ
1. Дай общий вердикт (Pass/Fail/Improvement needed)
2. Детально разбери каждое направление
3. Приведи примеры с file:line references
4. Ранжируй проблемы по приоритету
5. Предложи план исправления
    `,

    default: (p) => `
## ОСНОВНАЯ ЗАДАЧА
${p}

## КОНТЕКСТ И ОГРАНИЧЕНИЯ
- Предоставь полное решение
- Включи примеры использования
- Объясни каждый шаг

## КРИТЕРИИ УСПЕХА
- ✓ Решение полное и работающее
- ✓ Примеры даны с результатами
- ✓ Следует лучшим практикам

## ИНСТРУКЦИИ ПО ОТВЕТУ
1. Резюмируй подход кратко
2. Дай подробное объяснение
3. Приведи примеры кода
4. Укажи на важные детали
    `,
  };

  const template = templates[agentType] || templates.default;
  return template(prompt);
}
