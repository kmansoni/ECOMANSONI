import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

type SeedBody = {
  bots?: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // Protect seeding endpoint.
    const expectedToken = requireEnv("SEED_TEST_CHATS_TOKEN");
    const providedToken = req.headers.get("x-seed-token") ?? "";
    if (!providedToken || providedToken !== expectedToken) {
      return json(403, { error: "Forbidden" });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_PUBLIC_KEY") || Deno.env.get("SUPABASE_ANON");
    if (!anonKey) {
      return json(500, { error: "SUPABASE_ANON_KEY is not configured on functions runtime" });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing Authorization bearer token" });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { error: userErr?.message || "Unauthorized" });
    }

    const ownerUserId = userData.user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json().catch(() => ({}))) as SeedBody;
    const botCount = Math.max(1, Math.min(5, Number(body?.bots ?? 3)));

    // Create bot users
    const bots: Array<{ user_id: string; email: string; display_name: string }> = [];
    for (let i = 1; i <= botCount; i++) {
      const email = `bot${i}.${ownerUserId.slice(0, 8)}@example.dev`;
      const displayName = `Бот #${i}`;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: crypto.randomUUID() + "Aa1!",
        email_confirm: true,
        user_metadata: { full_name: displayName },
      });

      if (createErr) {
        // If user exists, try to find by email
        const { data: users, error: listErr } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) throw createErr;
        const existing = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!existing) throw createErr;
        bots.push({ user_id: existing.id, email, display_name: displayName });
      } else if (created?.user) {
        bots.push({ user_id: created.user.id, email, display_name: displayName });
      }
    }

    // Ensure profiles for bots
    await admin.from("profiles").upsert(
      bots.map((b) => ({
        user_id: b.user_id,
        display_name: b.display_name,
        avatar_url: null,
      })),
      { onConflict: "user_id" },
    );

    // Channels
    const { data: channels, error: channelErr } = await admin
      .from("channels")
      .insert([
        {
          name: "Новости Mansoni (боты)",
          description: "Тестовый канал, сообщения пишут боты",
          owner_id: ownerUserId,
          is_public: true,
        },
        {
          name: "Общий чат (тест)",
          description: "Канал для проверки списка, подписки и сообщений",
          owner_id: ownerUserId,
          is_public: true,
        },
      ])
      .select("id");

    if (channelErr) throw channelErr;
    const channelIds = (channels || []).map((c: any) => String(c.id));

    // Channel members: owner + bots
    if (channelIds.length) {
      await admin.from("channel_members").insert(
        channelIds.flatMap((channelId) => [
          { channel_id: channelId, user_id: ownerUserId, role: "owner" },
          ...bots.map((b) => ({ channel_id: channelId, user_id: b.user_id, role: "member" })),
        ]),
        { returning: "minimal" },
      );

      const now = Date.now();
      await admin.from("channel_messages").insert(
        channelIds.flatMap((channelId, idx) => [
          {
            channel_id: channelId,
            sender_id: bots[idx % bots.length].user_id,
            content: "Привет! Я бот. Это тестовое сообщение в канале 🤖",
            created_at: new Date(now - (idx + 1) * 120_000).toISOString(),
          },
          {
            channel_id: channelId,
            sender_id: ownerUserId,
            content: "Ок, проверяю канал ✅",
            created_at: new Date(now - (idx + 1) * 90_000).toISOString(),
          },
          {
            channel_id: channelId,
            sender_id: bots[(idx + 1) % bots.length].user_id,
            content: "Если видишь это — всё работает.",
            created_at: new Date(now - (idx + 1) * 60_000).toISOString(),
          },
        ]),
      );
    }

    // Group
    const { data: group, error: groupErr } = await admin
      .from("group_chats")
      .insert({
        name: "Тестовая группа (боты)",
        description: "Групповой чат для проверки сообщений от ботов",
        owner_id: ownerUserId,
      })
      .select("id")
      .single();

    if (groupErr) throw groupErr;
    const groupId = String(group.id);

    await admin.from("group_chat_members").insert(
      [
        { group_id: groupId, user_id: ownerUserId, role: "owner" },
        ...bots.map((b) => ({ group_id: groupId, user_id: b.user_id, role: "member" })),
      ],
      { returning: "minimal" },
    );

    const now = Date.now();
    await admin.from("group_chat_messages").insert(
      [
        {
          group_id: groupId,
          sender_id: bots[0].user_id,
          content: "Добро пожаловать в тестовую группу! 🤖",
          created_at: new Date(now - 140_000).toISOString(),
        },
        {
          group_id: groupId,
          sender_id: ownerUserId,
          content: "Проверяю групповой чат ✅",
          created_at: new Date(now - 110_000).toISOString(),
        },
        {
          group_id: groupId,
          sender_id: bots[1 % bots.length].user_id,
          content: "Я тоже здесь. Проверка уведомлений и сортировки.",
          created_at: new Date(now - 80_000).toISOString(),
        },
      ],
    );

    // DMs: one conversation per bot
    const dmConversationIds: string[] = [];
    for (const bot of bots) {
      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .insert({})
        .select("id")
        .single();
      if (convErr) throw convErr;
      const convId = String(conv.id);
      dmConversationIds.push(convId);

      await admin.from("conversation_participants").insert(
        [
          { conversation_id: convId, user_id: ownerUserId },
          { conversation_id: convId, user_id: bot.user_id },
        ],
        { returning: "minimal" },
      );

      await admin.from("messages").insert([
        {
          conversation_id: convId,
          sender_id: bot.user_id,
          content: "Привет! Я тестовый бот. Чем помочь?",
          is_read: false,
        },
        {
          conversation_id: convId,
          sender_id: ownerUserId,
          content: "Проверяю диалог с ботом ✅",
          is_read: true,
        },
        {
          conversation_id: convId,
          sender_id: bot.user_id,
          content: "Отлично. Диалог отображается в списке чатов.",
          is_read: false,
        },
      ]);

      // bump updated_at
      await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    }

    return json(200, {
      ok: true,
      bots_created: bots.length,
      channels_created: channelIds.length,
      group_created: groupId,
      dms_created: dmConversationIds.length,
    });
  } catch (e) {
    console.error("seed-test-chats error:", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
