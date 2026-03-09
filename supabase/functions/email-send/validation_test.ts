import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { validatePayload } from "./validation.ts";

Deno.test("validatePayload: rejects non-object body", () => {
  const result = validatePayload("not-an-object");
  assertEquals(result.valid, false);
  if (!result.valid) {
    assertEquals(result.error, "INVALID_BODY: expected JSON object");
  }
});

Deno.test("validatePayload: rejects invalid recipient email", () => {
  const result = validatePayload({ to: "invalid", subject: "Hi", text: "Body" });
  assertEquals(result.valid, false);
  if (!result.valid) {
    assertEquals(result.error, "INVALID_FIELD: 'to' must be a valid email address");
  }
});

Deno.test("validatePayload: accepts template payload", () => {
  const result = validatePayload({
    to: "user@example.com",
    template: "welcome",
    templateData: { name: "Ada" },
  });
  assertEquals(result.valid, true);
  if (result.valid) {
    assertEquals(result.payload.to, "user@example.com");
    assertEquals(result.payload.template, "welcome");
  }
});

Deno.test("validatePayload: accepts content payload", () => {
  const result = validatePayload({
    to: "user@example.com",
    subject: "Hello",
    text: "Text content",
  });
  assertEquals(result.valid, true);
  if (result.valid) {
    assertEquals(result.payload.subject, "Hello");
    assertEquals(result.payload.text, "Text content");
  }
});
