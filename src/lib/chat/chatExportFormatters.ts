/**
 * chatExportFormatters — форматирование экспорта истории чата.
 *
 * Поддерживаемые форматы: JSON, TXT, HTML.
 * Каждый форматтер принимает массив сообщений и возвращает строку.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExportMessage {
  id: string;
  senderName: string;
  content: string;
  createdAt: string;
  mediaType: string | null;
  mediaUrl: string | null;
}

export interface ExportMeta {
  chatName: string;
  exportedAt: string;
  totalMessages: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export type ExportFormat = "json" | "txt" | "html";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── JSON ──────────────────────────────────────────────────────────────────────

export function formatAsJSON(messages: ExportMessage[], meta: ExportMeta): string {
  const payload = {
    meta: {
      chatName: meta.chatName,
      exportedAt: meta.exportedAt,
      totalMessages: meta.totalMessages,
      dateRange: {
        from: meta.dateFrom,
        to: meta.dateTo,
      },
    },
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.senderName,
      text: m.content,
      date: m.createdAt,
      mediaType: m.mediaType,
      mediaUrl: m.mediaUrl,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ─── TXT ───────────────────────────────────────────────────────────────────────

export function formatAsTxt(messages: ExportMessage[], meta: ExportMeta): string {
  const lines: string[] = [];

  lines.push(`═══════════════════════════════════════`);
  lines.push(`Экспорт чата: ${meta.chatName}`);
  lines.push(`Дата экспорта: ${formatDate(meta.exportedAt)}`);
  lines.push(`Сообщений: ${meta.totalMessages}`);
  if (meta.dateFrom || meta.dateTo) {
    const from = meta.dateFrom ? formatDate(meta.dateFrom) : "начало";
    const to = meta.dateTo ? formatDate(meta.dateTo) : "конец";
    lines.push(`Период: ${from} — ${to}`);
  }
  lines.push(`═══════════════════════════════════════`);
  lines.push("");

  let lastDate = "";

  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt).toLocaleDateString("ru-RU");
    if (msgDate !== lastDate) {
      lines.push(`── ${msgDate} ──`);
      lastDate = msgDate;
    }

    const time = new Date(msg.createdAt).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });

    lines.push(`[${time}] ${msg.senderName}: ${msg.content}`);

    if (msg.mediaType && msg.mediaUrl) {
      lines.push(`  📎 ${msg.mediaType}: ${msg.mediaUrl}`);
    }
  }

  return lines.join("\n");
}

// ─── HTML ──────────────────────────────────────────────────────────────────────

export function formatAsHTML(messages: ExportMessage[], meta: ExportMeta): string {
  const messageRows = messages.map((msg) => {
    const time = formatDate(msg.createdAt);
    const mediaBlock =
      msg.mediaType && msg.mediaUrl
        ? `<div class="media"><a href="${escapeHtml(msg.mediaUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(msg.mediaType)}</a></div>`
        : "";

    return `
      <div class="message">
        <div class="meta">
          <span class="sender">${escapeHtml(msg.senderName)}</span>
          <span class="time">${escapeHtml(time)}</span>
        </div>
        <div class="text">${escapeHtml(msg.content)}</div>
        ${mediaBlock}
      </div>`;
  });

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Экспорт: ${escapeHtml(meta.chatName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 16px; max-width: 720px; margin: 0 auto; }
    .header { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { font-size: 18px; margin-bottom: 8px; }
    .header .info { color: #666; font-size: 13px; line-height: 1.6; }
    .message { background: #fff; border-radius: 8px; padding: 12px 16px; margin-bottom: 4px; }
    .message .meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .message .sender { font-weight: 600; font-size: 14px; color: #2563eb; }
    .message .time { font-size: 12px; color: #999; }
    .message .text { font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .message .media { margin-top: 6px; }
    .message .media a { color: #2563eb; text-decoration: none; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(meta.chatName)}</h1>
    <div class="info">
      Дата экспорта: ${escapeHtml(formatDate(meta.exportedAt))}<br>
      Сообщений: ${meta.totalMessages}${
        meta.dateFrom || meta.dateTo
          ? `<br>Период: ${meta.dateFrom ? escapeHtml(formatDate(meta.dateFrom)) : "начало"} — ${meta.dateTo ? escapeHtml(formatDate(meta.dateTo)) : "конец"}`
          : ""
      }
    </div>
  </div>
  ${messageRows.join("\n")}
</body>
</html>`;
}

// ─── Dispatcher ────────────────────────────────────────────────────────────────

const FORMATTERS: Record<ExportFormat, (msgs: ExportMessage[], meta: ExportMeta) => string> = {
  json: formatAsJSON,
  txt: formatAsTxt,
  html: formatAsHTML,
};

const MIME_TYPES: Record<ExportFormat, string> = {
  json: "application/json",
  txt: "text/plain",
  html: "text/html",
};

const EXTENSIONS: Record<ExportFormat, string> = {
  json: "json",
  txt: "txt",
  html: "html",
};

export function formatExport(
  format: ExportFormat,
  messages: ExportMessage[],
  meta: ExportMeta,
): string {
  return FORMATTERS[format](messages, meta);
}

export function getExportMimeType(format: ExportFormat): string {
  return MIME_TYPES[format];
}

export function getExportExtension(format: ExportFormat): string {
  return EXTENSIONS[format];
}
