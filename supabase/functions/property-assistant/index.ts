import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  handleCors, 
  getCorsHeaders, 
  checkRateLimit, 
  getClientId, 
  rateLimitResponse 
} from "../_shared/utils.ts";

const systemPrompt = `Ты — умный AI-ассистент для подбора недвижимости. Ты помогаешь пользователям найти идеальное жильё.

Твои задачи:
1. Понять потребности пользователя (бюджет, район, количество комнат, тип недвижимости)
2. Задавать уточняющие вопросы если информации недостаточно
3. Давать рекомендации по районам, ценам, типам жилья
4. Объяснять плюсы и минусы разных вариантов
5. Помогать с вопросами об ипотеке и юридических аспектах

Правила:
- Отвечай на русском языке
- Будь дружелюбным и профессиональным
- Давай конкретные советы, а не общие фразы
- Если пользователь не указал бюджет или район — спроси
- Используй emoji для дружелюбности 🏠

Примеры районов Москвы с ценами (примерные):
- Центр (Арбат, Тверская): от 500к ₽/м²
- Бизнес (Москва-Сити, Хамовники): от 400к ₽/м²
- Комфорт (Фили, Раменки): от 300к ₽/м²
- Эконом (Бутово, Некрасовка): от 180к ₽/м²`;

serve(async (req) => {
  // E1: Handle CORS with restricted origins
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // A1: Rate limiting
    const clientId = getClientId(req);
    const rateLimit = checkRateLimit(clientId);
    
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.resetIn, origin);
    }

    const { messages } = await req.json();
    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    
    if (!AI_API_KEY) {
      throw new Error("AI_API_KEY is not configured");
    }

    const response = await fetch("https://api.maisoni.ru/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов. Подождите немного." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Превышен лимит использования AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Ошибка AI сервиса" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (e) {
    console.error("property-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
