import { loadConfig } from "./config.js";
import { EmailDb } from "./db.js";
import { createApi } from "./http/api.js";
import { createEmailProvider } from "./providers/index.js";
import { renderTemplate } from "./templates/render.js";
import type { EmailOutboxRecord } from "./types.js";

const config = loadConfig();
const db = new EmailDb(config);
const provider = createEmailProvider(config);
const app = createApi(config, db);

let isPolling = false;

function computeRetryDelaySeconds(attemptCount: number): number {
  const base = 10;
  const cap = 15 * 60;
  const delay = Math.min(cap, base * Math.pow(2, Math.max(0, attemptCount - 1)));
  return delay;
}

function isNonRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("invalid email") ||
    msg.includes("template") ||
    msg.includes("missing subject") ||
    msg.includes("missing html/text")
  );
}

async function processRow(row: EmailOutboxRecord): Promise<void> {
  const templateVars = row.template_vars ?? {};

  let subject = row.subject;
  let html = row.html_body ?? undefined;
  let text = row.text_body ?? undefined;

  if ((!subject || (!html && !text)) && row.template_key) {
    const template = await db.getTemplate(row.template_key);
    if (!template) {
      throw new Error(`template not found or inactive: ${row.template_key}`);
    }

    if (!subject) {
      subject = renderTemplate(template.subject_template, templateVars);
    }

    if (!html && template.html_template) {
      html = renderTemplate(template.html_template, templateVars);
    }

    if (!text && template.text_template) {
      text = renderTemplate(template.text_template, templateVars);
    }
  }

  if (!subject) {
    throw new Error("missing subject");
  }

  if (!html && !text) {
    throw new Error("missing html/text content");
  }

  const result = await provider.send({
    to: row.to_email,
    from: row.from_email || config.defaultFrom,
    subject,
    html,
    text,
  });

  await db.markSent(row, config.provider, result.messageId);
}

async function pollCycle(): Promise<void> {
  if (isPolling) {
    return;
  }

  isPolling = true;
  try {
    const rows = await db.claimBatch(config.batchSize, config.lockSeconds);

    for (const row of rows) {
      try {
        await processRow(row);
      } catch (error) {
        const err = error instanceof Error ? error : new Error("unknown error");
        const nonRetryable = isNonRetryableError(err);
        const retryDelaySeconds = nonRetryable
          ? 0
          : computeRetryDelaySeconds(Math.max(1, row.attempt_count + 1));

        await db.markFailed(row, config.provider, err.message, retryDelaySeconds);
      }
    }
  } catch (error) {
    console.error("[email-router] poll cycle failed", error);
  } finally {
    isPolling = false;
  }
}

app.listen(config.port, () => {
  console.log(`[email-router] listening on :${config.port} (provider=${config.provider})`);
});

setInterval(() => {
  void pollCycle();
}, config.pollMs);

void pollCycle();
