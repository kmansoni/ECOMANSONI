export function requireClientMsgId(value?: string | null): string {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new Error("CHAT_CLIENT_MSG_ID_REQUIRED");
  }

  return value;
}
