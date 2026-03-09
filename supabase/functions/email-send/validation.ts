export interface EmailPayload {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  from?: string;
  replyTo?: string;
}

export function validatePayload(
  body: unknown,
): { valid: true; payload: EmailPayload } | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "INVALID_BODY: expected JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.to !== "string" || !b.to.includes("@")) {
    return { valid: false, error: "INVALID_FIELD: 'to' must be a valid email address" };
  }

  // Must have at least one of: subject+html/text, or template.
  const hasContent = b.html || b.text || b.subject;
  const hasTemplate = typeof b.template === "string" && b.template.length > 0;

  if (!hasContent && !hasTemplate) {
    return { valid: false, error: "INVALID_BODY: must provide either 'template' or 'subject'+'html'/'text'" };
  }

  return {
    valid: true,
    payload: {
      to: b.to as string,
      subject: typeof b.subject === "string" ? b.subject : undefined,
      html: typeof b.html === "string" ? b.html : undefined,
      text: typeof b.text === "string" ? b.text : undefined,
      template: typeof b.template === "string" ? b.template : undefined,
      templateData:
        b.templateData && typeof b.templateData === "object" && !Array.isArray(b.templateData)
          ? (b.templateData as Record<string, unknown>)
          : undefined,
      from: typeof b.from === "string" ? b.from : undefined,
      replyTo: typeof b.replyTo === "string" ? b.replyTo : undefined,
    },
  };
}
