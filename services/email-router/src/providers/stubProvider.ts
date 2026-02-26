import type { EmailProvider, SendEmailInput, SendEmailResult } from "../types.js";

export class StubEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const messageId = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    console.log("[email-router][stub] send", {
      to: input.to,
      from: input.from,
      subject: input.subject,
      messageId,
    });

    return { messageId };
  }
}
