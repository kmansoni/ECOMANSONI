import { toast } from "sonner";

import { parseRateLimitFromResponse } from "./rateLimit";

export async function maybeToastRateLimit(res: Response): Promise<boolean> {
  const parsed = await parseRateLimitFromResponse(res);
  if (!parsed) return false;

  const wait = parsed.retryAfterSeconds;
  const action = parsed.payload.action;

  toast({
    title: "Слишком много запросов",
    description: wait
      ? action
        ? `Действие: ${action}. Попробуйте снова через ${wait} сек.`
        : `Попробуйте снова через ${wait} сек.`
      : action
        ? `Действие: ${action}. Попробуйте чуть позже.`
        : "Попробуйте чуть позже.",
  });

  return true;
}
