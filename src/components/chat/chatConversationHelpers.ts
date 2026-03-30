import type { EncryptedPayload } from "@/hooks/useE2EEncryption";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import { repairBrokenLineWrapArtifacts } from "@/lib/chat/textPipeline";

/**
 * Парсит JSON-строку зашифрованного E2EE контента сообщения.
 * Возвращает `null` при любой ошибке парсинга или невалидной структуре.
 */
export function parseEncryptedPayload(content: unknown): EncryptedPayload | null {
  try {
    const parsed = JSON.parse(String(content ?? ""));
    if (
      parsed &&
      parsed.v === 2 &&
      typeof parsed.iv === "string" &&
      typeof parsed.ct === "string" &&
      typeof parsed.tag === "string" &&
      typeof parsed.epoch === "number" &&
      typeof parsed.kid === "string"
    ) {
      return parsed as EncryptedPayload;
    }
  } catch (error) {
    logger.debug("chat: parse encrypted payload failed", { error });
    return null;
  }
  return null;
}

/**
 * Компактный формат ошибки для внутренней диагностики.
 */
export function toCompactErrorDetails(error: unknown): { code: string; message: string; status: number | null } {
  if (error instanceof Error) {
    return {
      code: "",
      message: String(error.message || "Unknown error"),
      status: null,
    };
  }

  if (error && typeof error === "object") {
    const anyErr = error as any;
    const code = typeof anyErr.code === "string" ? anyErr.code : "";
    const status = Number.isFinite(Number(anyErr.status)) ? Number(anyErr.status) : null;
    const message = String(anyErr.message ?? anyErr.details ?? anyErr.error_description ?? "Unknown error");
    return { code, message, status };
  }

  return {
    code: "",
    message: typeof error === "string" ? error : String(error ?? "Unknown error"),
    status: null,
  };
}

/**
 * Форматирует секунды в строку M:SS (для таймера записи и длительности голосовых).
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Форматирует ISO-дату в HH:mm (время сообщения в чате).
 */
export function formatMessageTime(dateStr: string, conversationId?: string): string {
  try {
    return format(new Date(dateStr), "HH:mm");
  } catch (error) {
    logger.debug("chat: failed to format message time", { conversationId, dateStr, error });
    return "";
  }
}

/**
 * Нормализация артефактов вертикального отображения текста.
 * Делегирует в repairBrokenLineWrapArtifacts.
 */
export function normalizeBrokenVerticalText(text: string): string {
  return repairBrokenLineWrapArtifacts(text);
}
