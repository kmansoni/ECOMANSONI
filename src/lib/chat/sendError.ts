export type SendErrorToast = {
  title: string;
  description?: string;
};

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "";
  if (!error || typeof error !== "object") return "";

  const anyErr = error as any;
  return String(anyErr.message ?? anyErr.error_description ?? anyErr.details ?? "");
}

function extractFullText(error: unknown): string {
  if (!error || typeof error !== "object") return extractMessage(error);
  const anyErr = error as any;
  return [anyErr.code, anyErr.message, anyErr.details, anyErr.hint, anyErr.error_description]
    .filter((v) => typeof v === "string" && v.length > 0)
    .join(" ");
}

export function getChatSendErrorToast(error: unknown): SendErrorToast | null {
  const message = extractMessage(error);
  if (!message) return null;

  const byCode: Record<string, SendErrorToast> = {
    CHAT_NOT_AUTHENTICATED: { title: "Требуется вход в аккаунт" },
    CHAT_CONVERSATION_NOT_SELECTED: { title: "Чат не выбран" },
    CHAT_EMPTY_MESSAGE: { title: "Сообщение пустое" },
    CHAT_MAINTENANCE_MODE: { title: "Чат временно недоступен", description: "Проверьте миграции и RPC в Supabase." },
    CHANNEL_NOT_AUTHENTICATED: { title: "Требуется вход в аккаунт" },
    CHANNEL_NOT_SELECTED: { title: "Канал не выбран" },
    CHANNEL_EMPTY_MESSAGE: { title: "Сообщение пустое" },
    GROUP_NOT_AUTHENTICATED: { title: "Требуется вход в аккаунт" },
    GROUP_NOT_SELECTED: { title: "Группа не выбрана" },
    GROUP_EMPTY_MESSAGE: { title: "Сообщение пустое" },
  };

  const direct = byCode[message];
  if (direct) return direct;

  if (message.startsWith("CHAT_V11_SEND_REJECTED:")) {
    return { title: "Сообщение отклонено сервером", description: "Попробуйте отправить снова через несколько секунд." };
  }

  const full = extractFullText(error).toLowerCase();
  if (full.includes("jwt") || full.includes("auth")) {
    return { title: "Сессия истекла, войдите снова" };
  }
  if (full.includes("permission") || full.includes("insufficient") || full.includes("42501")) {
    return { title: "Недостаточно прав для отправки" };
  }
  if (full.includes("chat_send_message_v11") && (full.includes("does not exist") || full.includes("schema cache"))) {
    return { title: "Чат временно недоступен", description: "На сервере не применены миграции чата." };
  }
  if (full.includes("send_channel_message_v1") && (full.includes("does not exist") || full.includes("schema cache"))) {
    return { title: "Канал временно недоступен", description: "На сервере не применены миграции канала." };
  }
  if (full.includes("send_group_message_v1") && (full.includes("does not exist") || full.includes("schema cache"))) {
    return { title: "Группа временно недоступна", description: "На сервере не применены миграции группы." };
  }

  return null;
}

export function isNonRecoverableSendError(error: unknown): boolean {
  const message = extractMessage(error);

  if (!message) return false;
  if (message.startsWith("HASHTAG_BLOCKED:")) return true;

  return (
    message === "CHAT_NOT_AUTHENTICATED" ||
    message === "CHAT_CONVERSATION_NOT_SELECTED" ||
    message === "CHAT_EMPTY_MESSAGE" ||
    message === "CHANNEL_NOT_AUTHENTICATED" ||
    message === "CHANNEL_NOT_SELECTED" ||
    message === "CHANNEL_EMPTY_MESSAGE" ||
    message === "GROUP_NOT_AUTHENTICATED" ||
    message === "GROUP_NOT_SELECTED" ||
    message === "GROUP_EMPTY_MESSAGE"
  );
}
