import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  handleCors, 
  getCorsHeaders, 
  checkRateLimit, 
  getClientId, 
  rateLimitResponse 
} from "../_shared/utils.ts";

const systemPrompt = `Ты — эксперт по страхованию. Помогаешь пользователям выбрать подходящую страховку и отвечаешь на вопросы.

Твои задачи:
1. Понять потребности пользователя (какой тип страхования нужен)
2. Объяснить разницу между видами страхования
3. Дать рекомендации по выбору компании и тарифа
4. Ответить на вопросы про выплаты, условия, документы

Виды страхования:
- ОСАГО: обязательное для всех автовладельцев. Цена от 5000-15000 ₽/год
- КАСКО: добровольное для авто, покрывает угон и ущерб. Цена 3-10% от стоимости авто
- ДМС: добровольное медицинское. Цена от 30000-100000 ₽/год
- Страхование квартиры: от 2000-10000 ₽/год
- Туристическая страховка: от 1000 ₽/поездка
- Страхование жизни: от 5000 ₽/мес

Правила:
- Отвечай на русском
- Давай конкретные цифры и примеры
- Будь дружелюбным 🛡️
- Если не знаешь точную цену — дай диапазон
- Спрашивай детали для точного расчёта`;

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

    const response = await fetch("https://api.mansoni.ru/v1/chat/completions", {
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
        return new Response(JSON.stringify({ error: "Слишком много запросов." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Превышен лимит AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", response.status);
      return new Response(JSON.stringify({ error: "Ошибка AI" }), {
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
    console.error("insurance-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
