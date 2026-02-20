import { describe, expect, it } from "vitest";
import { canCapability, resolveCapabilities, type ChannelRoleCapability } from "@/lib/channel-capabilities";

describe("channel capability resolver", () => {
  const roleCapabilities: ChannelRoleCapability[] = [
    { role: "member", capability_key: "channel.posts.read", is_allowed: true },
    { role: "member", capability_key: "channel.posts.create", is_allowed: false },
    { role: "member", capability_key: "channel.analytics.read", is_allowed: false },
  ];

  it("uses role defaults when no override exists", () => {
    const resolved = resolveCapabilities({
      role: "member",
      roleCapabilities,
      overrides: [],
    });

    expect(canCapability(resolved, "channel.posts.read")).toBe(true);
    expect(canCapability(resolved, "channel.posts.create")).toBe(false);
  });

  it("allows override to take precedence over role default", () => {
    const resolved = resolveCapabilities({
      role: "member",
      roleCapabilities,
      overrides: [{ capability_key: "channel.posts.create", is_enabled: true }],
    });

    expect(canCapability(resolved, "channel.posts.create")).toBe(true);
    expect(resolved["channel.posts.create"]?.source).toBe("override");
  });
});

