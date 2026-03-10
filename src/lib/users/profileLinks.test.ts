import { describe, expect, it } from "vitest";
import { buildProfilePath, buildProfileUrl, getCanonicalProfileSlug } from "@/lib/users/profileLinks";

describe("profileLinks", () => {
  it("prefers username over userId for canonical slug", () => {
    expect(getCanonicalProfileSlug({ username: " @mansoni ", userId: "11111111-1111-1111-1111-111111111111" })).toBe("mansoni");
  });

  it("falls back to userId when username is missing", () => {
    expect(buildProfilePath({ userId: "11111111-1111-1111-1111-111111111111" })).toBe("/user/11111111-1111-1111-1111-111111111111");
  });

  it("URL-encodes profile slug in route path", () => {
    expect(buildProfilePath({ username: "иван петров" })).toBe("/user/%D0%B8%D0%B2%D0%B0%D0%BD%20%D0%BF%D0%B5%D1%82%D1%80%D0%BE%D0%B2");
  });

  it("builds absolute profile URL from custom origin", () => {
    expect(buildProfileUrl({ username: "mansoni" }, { origin: "https://app.mansoni.ru/" })).toBe("https://app.mansoni.ru/user/mansoni");
  });

  it("throws when neither username nor userId is available", () => {
    expect(() => getCanonicalProfileSlug({})).toThrow("PROFILE_SLUG_MISSING");
  });
});