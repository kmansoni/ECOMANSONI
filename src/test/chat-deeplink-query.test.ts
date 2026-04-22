import { describe, expect, it } from "vitest";
import { clearHandledChatsQueryParams, parseChatsQueryActions } from "@/lib/chat/deepLinkQuery";

describe("chat deep link query helpers", () => {
  it("parses supported chat query actions", () => {
    const actions = parseChatsQueryActions(
      "?open=dm1&openChannel=ch1&openGroup=gr1&invite=abc&newMessage=hello&startCall=user1&callType=video"
    );

    expect(actions).toEqual({
      openDmId: "dm1",
      openChannelId: "ch1",
      openGroupId: "gr1",
      invite: "abc",
      newMessage: "hello",
      startCallUserId: "user1",
      startCallType: "video",
    });
  });

  it("defaults invalid callType to audio", () => {
    const actions = parseChatsQueryActions("?startCall=user1&callType=invalid");
    expect(actions.startCallType).toBe("audio");
  });

  it("accepts legacy openDmId deeplink parameter", () => {
    const actions = parseChatsQueryActions("?openDmId=legacy-dm-1");
    expect(actions.openDmId).toBe("legacy-dm-1");
  });

  it("clears handled keys and preserves unrelated query params", () => {
    const next = clearHandledChatsQueryParams(
      "?open=dm1&openDmId=legacy-dm-1&invite=abc&startCall=user1&foo=bar&callType=video"
    );
    expect(next).toBe("?foo=bar");
  });
});
