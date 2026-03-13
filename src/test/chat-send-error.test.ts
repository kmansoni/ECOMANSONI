import { describe, expect, it } from "vitest";
import { getChatSendErrorToast } from "@/lib/chat/sendError";

describe("chat send error mapping", () => {
  it("maps object-shaped auth error", () => {
    const payload = getChatSendErrorToast({
      code: "PGRST301",
      message: "JWT expired",
    });

    expect(payload?.title).toContain("Сессия");
  });

  it("maps missing v11 rpc function", () => {
    const payload = getChatSendErrorToast({
      code: "42883",
      message: "function public.chat_send_message_v11(uuid) does not exist",
    });

    expect(payload?.title).toContain("временно недоступен");
  });

  it("maps missing channel send rpc function", () => {
    const payload = getChatSendErrorToast({
      code: "42883",
      message: "function public.send_channel_message_v1(uuid,text,boolean,text,text,integer) does not exist",
    });

    expect(payload?.title).toContain("Канал");
  });

  it("maps missing group send rpc function", () => {
    const payload = getChatSendErrorToast({
      code: "42883",
      message: "function public.send_group_message_v1(uuid,text,text,text) does not exist",
    });

    expect(payload?.title).toContain("Группа");
  });

  it("maps direct slow mode wait code", () => {
    const payload = getChatSendErrorToast({
      message: "SLOW_MODE_WAIT:17",
    });

    expect(payload?.title).toContain("Медленный режим");
    expect(payload?.description).toContain("17с");
  });

  it("maps slow mode wait from full error text", () => {
    const payload = getChatSendErrorToast({
      code: "P0001",
      message: "send_group_message_v1 failed",
      details: "SLOW_MODE_WAIT:9",
    });

    expect(payload?.title).toContain("Медленный режим");
    expect(payload?.description).toContain("9с");
  });
});
