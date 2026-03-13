import { supabase } from "@/lib/supabase";

export type ChatSchemaProbeV2 = {
  ok: boolean;
  schema_version?: number;
  required_objects_present?: boolean;
  server_time?: string;
};

let lastProbe: ChatSchemaProbeV2 | null = null;

function isExpectedProbeError(error: any): boolean {
  const code = String(error?.code ?? "");
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    status === 403 ||
    status === 404 ||
    message.includes("chat_schema_probe_v2") ||
    details.includes("chat_schema_probe_v2")
  );
}

export function getLastChatSchemaProbe(): ChatSchemaProbeV2 | null {
  return lastProbe;
}

export async function runChatSchemaProbeOnce(): Promise<ChatSchemaProbeV2 | null> {
  if (lastProbe) return lastProbe;

  try {
    // Probe is authenticated-only by design; skip when there is no session.
    const sess = await supabase.auth.getSession();
    if (sess?.data?.session == null) {
      return null;
    }

    const res = await (supabase as any).rpc("chat_schema_probe_v2");
    const error = (res as any)?.error;
    const data = (res as any)?.data;
    if (error) {
      if (isExpectedProbeError(error)) {
        if (import.meta.env.DEV) {
          console.warn("[ChatSchemaProbe] RPC unavailable for current env/session", error);
        }
      } else {
        console.error("[ChatSchemaProbe] RPC error", error);
      }
      lastProbe = { ok: false };
      return lastProbe;
    }

    if (data && typeof data === "object") {
      lastProbe = data as ChatSchemaProbeV2;
    } else {
      lastProbe = { ok: false };
    }

    if (import.meta.env.DEV) {
      console.info("[ChatSchemaProbe] result", lastProbe);
    }

    return lastProbe;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[ChatSchemaProbe] exception", e);
    }
    lastProbe = { ok: false };
    return lastProbe;
  }
}
