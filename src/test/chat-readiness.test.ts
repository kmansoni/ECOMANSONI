import { describe, expect, it } from "vitest";
import {
  diagnoseChannelSendReadiness,
  diagnoseDmSendReadiness,
  diagnoseGroupSendReadiness,
} from "@/lib/chat/readiness";

function makeSupabaseMock(config: Record<string, { maybeSingle?: any; limit?: any }>) {
  return {
    from(table: string) {
      const tableCfg = config[table] ?? {};
      const chain: any = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(tableCfg.maybeSingle ?? { data: null, error: null });
        },
        limit() {
          return Promise.resolve(tableCfg.limit ?? { data: [], error: null });
        },
      };
      return chain;
    },
  };
}

describe("chat readiness diagnostics", () => {
  it("detects missing DM membership", async () => {
    const supabase = makeSupabaseMock({
      conversation_participants: {
        maybeSingle: { data: null, error: null },
      },
    });

    const msg = await diagnoseDmSendReadiness({
      supabase,
      userId: "u1",
      conversationId: "c1",
    });

    expect(msg).toBe("Пользователь не состоит в этом диалоге.");
  });

  it("maps RLS errors for channels", async () => {
    const supabase = makeSupabaseMock({
      channel_members: {
        maybeSingle: {
          data: null,
          error: { code: "42501", message: "permission denied for table channel_members" },
        },
      },
    });

    const msg = await diagnoseChannelSendReadiness({
      supabase,
      userId: "u1",
      channelId: "ch1",
    });

    expect(msg).toContain("RLS/права блокируют");
  });

  it("returns null when group send path is healthy", async () => {
    const supabase = makeSupabaseMock({
      group_chat_members: {
        maybeSingle: { data: { group_id: "g1", role: "member" }, error: null },
      },
      group_chat_messages: {
        limit: { data: [], error: null },
      },
    });

    const msg = await diagnoseGroupSendReadiness({
      supabase,
      userId: "u1",
      groupId: "g1",
    });

    expect(msg).toBeNull();
  });
});
