import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../types.js";

export class SendmailEmailProvider implements EmailProvider {
  private transporter;
  private fallbackFrom?: string;

  constructor(config: AppConfig) {
    this.fallbackFrom = config.sendmail?.from;

    this.transporter = nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: config.sendmail?.path,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.transporter.sendMail({
      from: input.from || this.fallbackFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return {
      messageId: result.messageId || "sendmail-unknown-message-id",
    };
  }
}
