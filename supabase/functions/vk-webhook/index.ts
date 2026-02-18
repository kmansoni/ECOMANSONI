import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

type VkCallbackType = "confirmation" | "message_new";

type VkCallbackPayload = {
  type: VkCallbackType | string;
  group_id?: number;
  secret?: string;
  object?: {
    message?: {
      id?: number;
      date?: number;
      peer_id?: number;
      from_id?: number;
      text?: string;
      out?: number;
      attachments?: unknown[];
    };
  };
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function generateAiReply(userText: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return "AI не настроен. Попробуйте позже.";
  }

  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
  const systemPrompt = Deno.env.get("VK_AI_SYSTEM_PROMPT") ??
    "Ты AI-ассистент Mansoni. Отвечай на русском, четко и по делу.";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("OpenAI error:", response.status, text);
    return "Не получилось сгенерировать ответ. Попробуйте позже.";
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  return content || "Ок.";
}

async function vkSendMessage(peerId: number, message: string): Promise<void> {
  const token = requireEnv("VK_GROUP_TOKEN");

  const params = new URLSearchParams({
    v: "5.131",
    access_token: token,
    peer_id: String(peerId),
    random_id: String(Date.now()),
    message,
  });

  const url = `https://api.vk.com/method/messages.send?${params.toString()}`;
  const response = await fetch(url, { method: "POST" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("VK send failed:", response.status, data);
    throw new Error("VK send failed");
  }

  if (data?.error) {
    console.error("VK send error:", data.error);
    throw new Error("VK send error");
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let payload: VkCallbackPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const expectedSecret = requireEnv("VK_CALLBACK_SECRET");
  const expectedGroupId = Deno.env.get("VK_GROUP_ID");

  if (!payload.secret || payload.secret !== expectedSecret) {
    return json(403, { error: "Forbidden" });
  }

  if (expectedGroupId && payload.group_id && String(payload.group_id) !== String(expectedGroupId)) {
    return json(403, { error: "Forbidden" });
  }

  if (payload.type === "confirmation") {
    const token = requireEnv("VK_CONFIRMATION_TOKEN");
    return new Response(token, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (payload.type === "message_new") {
    const message = payload.object?.message;
    if (!message) {
      return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    // Skip outgoing messages to avoid loops
    if (message.out === 1) {
      return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    const peerId = message.peer_id ?? message.from_id;
    if (!peerId) {
      return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    const userText = (message.text ?? "").trim();
    const reply = userText.length > 0
      ? await generateAiReply(userText)
      : "Напишите сообщение текстом — я отвечу 🙂";

    try {
      await vkSendMessage(peerId, reply);
    } catch (e) {
      console.error("vk-webhook send error:", e);
      // Still return ok so VK doesn't spam retries
    }

    return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
});
