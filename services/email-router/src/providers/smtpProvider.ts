import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../types.js";

export class SmtpEmailProvider implements EmailProvider {
  private transporter;
  private fallbackFrom?: string;

  constructor(config: AppConfig) {
    if (!config.smtp) {
      throw new Error("SMTP configuration is required for smtp provider");
    }

    this.fallbackFrom = config.smtp.from;
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.pass
          ? {
              user: config.smtp.user,
              pass: config.smtp.pass,
            }
          : undefined,
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
      messageId: result.messageId || "smtp-unknown-message-id",
    };
  }
}
