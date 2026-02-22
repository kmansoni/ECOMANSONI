export interface MessagePushPayload {
  v: 1;
  kind: "message";
  messageId: string;
  chatId: string;
  senderId: string;
  preview: {
    title: string;
    body: string;
    hasMedia?: boolean;
  };
  counters?: {
    unreadChats?: number;
    unreadMessages?: number;
  };
  deeplink: {
    path: "/chat";
    params: { chatId: string; messageId?: string };
  };
}

export interface IncomingCallPushPayload {
  v: 1;
  kind: "incoming_call";
  callId: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  media: "audio" | "video";
  createdAtMs: number;
  expiresAtMs: number;
  security: {
    tokenHint: "supabase_jwt" | "opaque";
    joinToken?: string;
  };
  deeplink: {
    path: "/call";
    params: { callId: string };
  };
}

export interface SecurityPushPayload {
  v: 1;
  kind: "security";
  event: "new_login" | "session_revoked" | "device_removed";
  deviceId?: string;
  ip?: string;
  city?: string;
  createdAtMs: number;
  deeplink: {
    path: "/settings/security";
    params?: Record<string, string>;
  };
}

export type PushPayload =
  | MessagePushPayload
  | IncomingCallPushPayload
  | SecurityPushPayload;
