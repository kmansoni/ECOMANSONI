/**
 * Deep link router — handles Telegram-like deep links.
 *
 * Supported formats:
 * - /msg?text=Hello → open new message with pre-filled text
 * - /join/{hash} → join group/channel by invite hash
 * - /@{username} → open user profile
 * - /chat/{id} → open specific chat
 * - /channel/{id} → open specific channel
 * - /call/{userId} → initiate call
 *
 * Called from:
 * 1. URL bar navigation (handled by React Router)
 * 2. Native deep links (Capacitor App.addListener("appUrlOpen"))
 * 3. Push notification taps
 */

export interface DeepLinkAction {
  type: "open-chat" | "open-profile" | "join-invite" | "new-message" | "open-channel" | "start-call" | "unknown";
  payload: Record<string, string>;
}

export function parseDeepLink(url: string): DeepLinkAction {
  try {
    // Handle both full URLs and path-only
    const parsed = url.startsWith("http") ? new URL(url) : new URL(url, "https://app.mansoni.com");
    const path = parsed.pathname;
    const params = Object.fromEntries(parsed.searchParams.entries());

    // /msg?text=Hello
    if (path === "/msg" || path === "/message") {
      return { type: "new-message", payload: { text: params.text ?? "" } };
    }

    // /join/{hash}
    const joinMatch = path.match(/^\/join\/([a-zA-Z0-9_-]+)$/);
    if (joinMatch) {
      return { type: "join-invite", payload: { hash: joinMatch[1] } };
    }

    // /@{username}
    const usernameMatch = path.match(/^\/@([a-zA-Z0-9_.]+)$/);
    if (usernameMatch) {
      return { type: "open-profile", payload: { username: usernameMatch[1] } };
    }

    // /chat/{id}
    const chatMatch = path.match(/^\/chat\/([a-f0-9-]+)$/i);
    if (chatMatch) {
      return { type: "open-chat", payload: { chatId: chatMatch[1] } };
    }

    // /channel/{id}
    const channelMatch = path.match(/^\/channel\/([a-f0-9-]+)$/i);
    if (channelMatch) {
      return { type: "open-channel", payload: { channelId: channelMatch[1] } };
    }

    // /call/{userId}
    const callMatch = path.match(/^\/call\/([a-f0-9-]+)$/i);
    if (callMatch) {
      return { type: "start-call", payload: { userId: callMatch[1] } };
    }

    return { type: "unknown", payload: { path, ...params } };
  } catch {
    return { type: "unknown", payload: { raw: url } };
  }
}

/**
 * Convert a DeepLinkAction to a React Router path.
 */
export function deepLinkToRoute(action: DeepLinkAction): string | null {
  switch (action.type) {
    case "open-chat":
      return `/chats?open=${action.payload.chatId}`;
    case "open-profile":
      return `/user/${action.payload.username}`;
    case "join-invite":
      return `/chats?invite=${action.payload.hash}`;
    case "new-message":
      return `/chats?newMessage=${encodeURIComponent(action.payload.text ?? "")}`;
    case "open-channel":
      return `/chats?openChannel=${action.payload.channelId}`;
    case "start-call":
      return `/chats?startCall=${action.payload.userId}`;
    default:
      return null;
  }
}
