import { describe, expect, it } from "vitest";
import {
  diagnoseChannelSendReadiness,
  diagnoseDmSendReadiness,
  diagnoseGroupSendReadiness,
} from "@/lib/chat/readiness";

function makeSupabaseMock(
  config: Record<string, { maybeSingle?: any; limit?: any }>,
  rpcConfig?: Record<string, any>
) {
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
    rpc(name: string) {
      return Promise.resolve(rpcConfig?.[name] ?? { data: [], error: null });
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

  it("reports missing channel send RPC", async () => {
    const supabase = makeSupabaseMock(
      {
        channel_members: {
          maybeSingle: { data: { channel_id: "ch1", role: "admin" }, error: null },
        },
        channel_messages: {
          limit: { data: [], error: null },
        },
      },
      {
        send_channel_message_v1: {
          data: null,
          error: {
            code: "42883",
            message: "function public.send_channel_message_v1(uuid,text,boolean,text,text,integer) does not exist",
          },
        },
      }
    );

    const msg = await diagnoseChannelSendReadiness({
      supabase,
      userId: "u1",
      channelId: "ch1",
    });

    expect(msg).toContain("send_channel_message_v1");
  });

  it("returns null when group send path is healthy", async () => {
    const supabase = makeSupabaseMock(
      {
        group_chat_members: {
          maybeSingle: { data: { group_id: "g1", role: "member" }, error: null },
        },
        group_chat_messages: {
          limit: { data: [], error: null },
        },
      },
      {
        send_group_message_v1: {
          data: null,
          error: { code: "22023", message: "group_id is required" },
        },
      }
    );

    const msg = await diagnoseGroupSendReadiness({
      supabase,
      userId: "u1",
      groupId: "g1",
    });

    expect(msg).toBeNull();
  });

  it("reports missing group send RPC", async () => {
    const supabase = makeSupabaseMock(
      {
        group_chat_members: {
          maybeSingle: { data: { group_id: "g1", role: "member" }, error: null },
        },
        group_chat_messages: {
          limit: { data: [], error: null },
        },
      },
      {
        send_group_message_v1: {
          data: null,
          error: {
            code: "42883",
            message: "function public.send_group_message_v1(uuid,text,text,text) does not exist",
          },
        },
      }
    );

    const msg = await diagnoseGroupSendReadiness({
      supabase,
      userId: "u1",
      groupId: "g1",
    });

    expect(msg).toContain("send_group_message_v1");
  });

  it("reports missing v11 RPC for dm when v11 is expected", async () => {
    const supabase = makeSupabaseMock(
      {
        conversation_participants: {
          maybeSingle: { data: { conversation_id: "c1" }, error: null },
        },
        messages: {
          limit: { data: [], error: null },
        },
      },
      {
        chat_status_write_v11: {
          data: null,
          error: {
            code: "42883",
            message: "function public.chat_status_write_v11(uuid, bigint) does not exist",
          },
        },
      }
    );

    const msg = await diagnoseDmSendReadiness({
      supabase,
      userId: "u1",
      conversationId: "c1",
      expectV11: true,
    });

    expect(msg).toContain("chat_status_write_v11");
  });
});
