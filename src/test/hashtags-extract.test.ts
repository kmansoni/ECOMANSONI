import { describe, expect, it } from "vitest";
import { extractNormalizedHashtags } from "@/lib/hashtags";

describe("extractNormalizedHashtags", () => {
  it("extracts russian/latin tags, normalizes to lowercase, dedups", () => {
    const text = "Hello #Cars #машина #машина #car_1 #CAR_1";
    expect(extractNormalizedHashtags(text)).toEqual(["cars", "машина", "car_1"]);
  });

  it("returns empty when none", () => {
    expect(extractNormalizedHashtags("no tags here")).toEqual([]);
  });

  it("does not match invalid # tokens", () => {
    // '-' is not allowed by backend regex.
    expect(extractNormalizedHashtags("#bad-tag #ok_tag")).toEqual(["bad", "ok_tag"]);
  });
});
