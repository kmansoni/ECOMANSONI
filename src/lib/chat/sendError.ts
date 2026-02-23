export type SendErrorToast = {
  title: string;
  description?: string;
};

export function getChatSendErrorToast(error: unknown): SendErrorToast | null {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  if (!message) return null;

  const byCode: Record<string, SendErrorToast> = {
    CHAT_NOT_AUTHENTICATED: { title: "Требуется вход в аккаунт" },
    CHAT_CONVERSATION_NOT_SELECTED: { title: "Чат не выбран" },
    CHAT_EMPTY_MESSAGE: { title: "Сообщение пустое" },
    CHANNEL_NOT_AUTHENTICATED: { title: "Требуется вход в аккаунт" },
    CHANNEL_NOT_SELECTED: { title: "Канал не выбран" },
    CHANNEL_EMPTY_MESSAGE: { title: "Сообщение пустое" },
    GROUP_NOT_AUTHENTICATED: { title: "Требуется вход в аккаунт" },
    GROUP_NOT_SELECTED: { title: "Группа не выбрана" },
    GROUP_EMPTY_MESSAGE: { title: "Сообщение пустое" },
  };

  const direct = byCode[message];
  if (direct) return direct;

  if (message.includes("JWT")) return { title: "Сессия истекла, войдите снова" };
  if (message.includes("permission") || message.includes("insufficient")) {
    return { title: "Недостаточно прав для отправки" };
  }

  return null;
}

export function isNonRecoverableSendError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

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
