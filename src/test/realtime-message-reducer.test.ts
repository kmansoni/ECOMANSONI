import { describe, expect, it } from "vitest";
import { removeRealtimeMessage, upsertRealtimeMessage } from "@/lib/chat/realtimeMessageReducer";

type TestMessage = {
  id: string;
  created_at: string;
  content?: string;
  updated_at?: string | null;
  edited_at?: string | null;
};

describe("realtimeMessageReducer", () => {
  it("deduplicates by id on replayed INSERT", () => {
    const base: TestMessage[] = [
      { id: "m-1", created_at: "2026-03-05T10:00:00.000Z", content: "one" },
    ];

    const next = upsertRealtimeMessage(base, {
      id: "m-1",
      created_at: "2026-03-05T10:00:00.000Z",
      content: "one",
    });

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("m-1");
  });

  it("merges UPDATE payload into existing message", () => {
    const base: TestMessage[] = [
      {
        id: "m-1",
        created_at: "2026-03-05T10:00:00.000Z",
        content: "before",
        updated_at: "2026-03-05T10:00:01.000Z",
      },
    ];

    const next = upsertRealtimeMessage(base, {
      id: "m-1",
      created_at: "2026-03-05T10:00:00.000Z",
      content: "after",
      updated_at: "2026-03-05T10:00:02.000Z",
    });

    expect(next).toHaveLength(1);
    expect(next[0].content).toBe("after");
  });

  it("keeps messages sorted by created_at after upserts", () => {
    const base: TestMessage[] = [
      { id: "m-2", created_at: "2026-03-05T10:02:00.000Z" },
    ];

    const next = upsertRealtimeMessage(base, {
      id: "m-1",
      created_at: "2026-03-05T10:01:00.000Z",
    });

    expect(next.map((message) => message.id)).toEqual(["m-1", "m-2"]);
  });

  it("ignores stale UPDATE payload when version is older", () => {
    const base: TestMessage[] = [
      {
        id: "m-1",
        created_at: "2026-03-05T10:00:00.000Z",
        content: "latest",
        updated_at: "2026-03-05T10:05:00.000Z",
      },
    ];

    const next = upsertRealtimeMessage(base, {
      id: "m-1",
      created_at: "2026-03-05T10:00:00.000Z",
      content: "stale",
      updated_at: "2026-03-05T10:04:00.000Z",
    });

    expect(next).toHaveLength(1);
    expect(next[0].content).toBe("latest");
  });

  it("repositions message when created_at changes in incoming payload", () => {
    const base: TestMessage[] = [
      { id: "m-1", created_at: "2026-03-05T10:02:00.000Z" },
      { id: "m-2", created_at: "2026-03-05T10:03:00.000Z" },
    ];

    const next = upsertRealtimeMessage(base, {
      id: "m-2",
      created_at: "2026-03-05T10:01:00.000Z",
    });

    expect(next.map((message) => message.id)).toEqual(["m-2", "m-1"]);
  });

  it("removes message by id on DELETE", () => {
    const base: TestMessage[] = [
      { id: "m-1", created_at: "2026-03-05T10:00:00.000Z" },
      { id: "m-2", created_at: "2026-03-05T10:01:00.000Z" },
    ];

    const next = removeRealtimeMessage(base, "m-1");

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("m-2");
  });
});
