import { describe, expect, it } from "vitest";
import { deepLinkToRoute, parseDeepLink } from "@/lib/deeplinks";

describe("deeplinks", () => {
  it("maps open profile deep link to user route", () => {
    const action = parseDeepLink("/@@mansoni".replace("@@", "@"));
    expect(action.type).toBe("open-profile");
    expect(deepLinkToRoute(action)).toBe("/user/mansoni");
  });

  it("maps call deep link to chats startCall query", () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const action = parseDeepLink(`/call/${userId}`);
    expect(action.type).toBe("start-call");
    expect(deepLinkToRoute(action)).toBe(`/chats?startCall=${userId}`);
  });

  it("maps channel deep link to chats openChannel query", () => {
    const channelId = "22222222-2222-2222-2222-222222222222";
    const action = parseDeepLink(`/channel/${channelId}`);
    expect(action.type).toBe("open-channel");
    expect(deepLinkToRoute(action)).toBe(`/chats?openChannel=${channelId}`);
  });
});
