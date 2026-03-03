import type { AppConfig } from "../config.js";
import type { EmailProvider } from "../types.js";
import { SendmailEmailProvider } from "./sendmailProvider.js";
import { SmtpEmailProvider } from "./smtpProvider.js";

export function createEmailProvider(config: AppConfig): EmailProvider {
  if (config.provider === "smtp") {
    return new SmtpEmailProvider(config);
  }

  if (config.provider === "sendmail") {
    return new SendmailEmailProvider(config);
  }

  throw new Error(`Unsupported EMAIL_ROUTER_PROVIDER: ${String(config.provider)}`);
}
