type ReadinessInputBase = {
  supabase: any;
  userId: string | null | undefined;
};

type DmReadinessInput = ReadinessInputBase & {
  conversationId: string | null | undefined;
  expectV11?: boolean;
};

type ChannelReadinessInput = ReadinessInputBase & {
  channelId: string | null | undefined;
};

type GroupReadinessInput = ReadinessInputBase & {
  groupId: string | null | undefined;
};

type QueryResult = { data: any; error: any };

async function withTimeout<T>(promise: Promise<T>, ms = 3500): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("READINESS_TIMEOUT")), ms);
    promise
      .then((v) => {
        window.clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(id);
        reject(e);
      });
  });
}

function mapDbError(table: string, error: any): string {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const full = `${msg} ${details}`.toLowerCase();

  if (code === "42P01") return `В БД отсутствует таблица ${table}. Миграции применены не полностью.`;
  if (code === "42501" || full.includes("row-level security") || full.includes("permission denied")) {
    return `RLS/права блокируют доступ к ${table}. Проверьте политики для текущего пользователя.`;
  }
  if (full.includes("jwt") || full.includes("auth")) {
    return "Сессия авторизации недействительна или отсутствует.";
  }
  if (code === "PGRST301" || full.includes("not found")) {
    return `API-эндпоинт для ${table} недоступен.`;
  }
  return `Ошибка БД при доступе к ${table}${code ? ` (${code})` : ""}.`;
}

function mapRpcError(functionName: string, error: any): string {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const full = `${msg} ${details}`.toLowerCase();

  if (code === "42883" || full.includes("does not exist") || full.includes("schema cache")) {
    return `На сервере отсутствует RPC ${functionName}. Примените миграции чата.`;
  }
  if (code === "42501" || full.includes("permission denied") || full.includes("row-level security")) {
    return `Нет прав на выполнение RPC ${functionName}. Проверьте GRANT EXECUTE.`;
  }
  if (full.includes("jwt") || full.includes("auth")) {
    return "Сессия авторизации недействительна или отсутствует.";
  }
  return `Ошибка RPC ${functionName}${code ? ` (${code})` : ""}.`;
}

function isSafeRpcValidationError(error: any): boolean {
  const code = String(error?.code || "");
  return code === "22023";
}

export async function diagnoseDmSendReadiness(input: DmReadinessInput): Promise<string | null> {
  const { supabase, userId, conversationId, expectV11 } = input;
  if (!userId) return "Пользователь не авторизован.";
  if (!conversationId) return "Диалог не выбран.";

  try {
    const partRes = await withTimeout<QueryResult>(
      supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle()
    );

    if (partRes?.error) return mapDbError("conversation_participants", partRes.error);
    if (!partRes?.data) return "Пользователь не состоит в этом диалоге.";

    const probe = await withTimeout<QueryResult>(
      supabase
        .from("messages")
        .select("id", { head: true, count: "exact" })
        .eq("conversation_id", conversationId)
        .limit(1)
    );
    if (probe?.error) return mapDbError("messages", probe.error);

    if (expectV11) {
      const v11Probe = await withTimeout<QueryResult>(
        supabase.rpc("chat_status_write_v11", {
          p_device_id: "00000000-0000-0000-0000-000000000000",
          p_client_write_seq: -1,
        })
      );
      if (v11Probe?.error) return mapRpcError("chat_status_write_v11", v11Probe.error);
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "READINESS_TIMEOUT") {
      return "Диагностика чата превысила таймаут. Проверьте сеть и доступность Supabase.";
    }
    return "Не удалось выполнить диагностику чата.";
  }
}

export async function diagnoseChannelSendReadiness(input: ChannelReadinessInput): Promise<string | null> {
  const { supabase, userId, channelId } = input;
  if (!userId) return "Пользователь не авторизован.";
  if (!channelId) return "Канал не выбран.";

  try {
    const memberRes = await withTimeout<QueryResult>(
      supabase
        .from("channel_members")
        .select("channel_id, role")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .maybeSingle()
    );
    if (memberRes?.error) return mapDbError("channel_members", memberRes.error);
    if (!memberRes?.data) return "Пользователь не является участником канала.";

    const probe = await withTimeout<QueryResult>(
      supabase
        .from("channel_messages")
        .select("id", { head: true, count: "exact" })
        .eq("channel_id", channelId)
        .limit(1)
    );
    if (probe?.error) return mapDbError("channel_messages", probe.error);

    const rpcProbe = await withTimeout<QueryResult>(
      supabase.rpc("send_channel_message_v1", {
        p_channel_id: null,
        p_content: "",
        p_silent: false,
        p_media_url: null,
        p_media_type: null,
        p_duration_seconds: null,
      })
    );
    if (rpcProbe?.error && !isSafeRpcValidationError(rpcProbe.error)) {
      return mapRpcError("send_channel_message_v1", rpcProbe.error);
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "READINESS_TIMEOUT") {
      return "Диагностика канала превысила таймаут. Проверьте сеть и доступность Supabase.";
    }
    return "Не удалось выполнить диагностику канала.";
  }
}

export async function diagnoseGroupSendReadiness(input: GroupReadinessInput): Promise<string | null> {
  const { supabase, userId, groupId } = input;
  if (!userId) return "Пользователь не авторизован.";
  if (!groupId) return "Группа не выбрана.";

  try {
    const memberRes = await withTimeout<QueryResult>(
      supabase
        .from("group_chat_members")
        .select("group_id, role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle()
    );
    if (memberRes?.error) return mapDbError("group_chat_members", memberRes.error);
    if (!memberRes?.data) return "Пользователь не состоит в этой группе.";

    const probe = await withTimeout<QueryResult>(
      supabase
        .from("group_chat_messages")
        .select("id", { head: true, count: "exact" })
        .eq("group_id", groupId)
        .limit(1)
    );
    if (probe?.error) return mapDbError("group_chat_messages", probe.error);

    const rpcProbe = await withTimeout<QueryResult>(
      supabase.rpc("send_group_message_v1", {
        p_group_id: null,
        p_content: "",
        p_media_url: null,
        p_media_type: null,
      })
    );
    if (rpcProbe?.error && !isSafeRpcValidationError(rpcProbe.error)) {
      return mapRpcError("send_group_message_v1", rpcProbe.error);
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "READINESS_TIMEOUT") {
      return "Диагностика группы превысила таймаут. Проверьте сеть и доступность Supabase.";
    }
    return "Не удалось выполнить диагностику группы.";
  }
}
