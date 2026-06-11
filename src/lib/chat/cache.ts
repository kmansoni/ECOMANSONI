const CHAT_CACHE_PREFIXES = ["chat_", "media_", "thumb_", "draft_"];

export async function clearCacheSafely(options: { type: "media" | "all" | "messages" }): Promise<void> {
  if (options.type === "all") {
    localStorage.clear();
    return;
  }

  const prefixes = options.type === "media"
    ? ["media_", "thumb_"]
    : CHAT_CACHE_PREFIXES;

  for (const key of Object.keys(localStorage)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}
