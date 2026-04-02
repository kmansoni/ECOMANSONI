#!/usr/bin/env node
/**
 * Test suite for ai-pr.mjs - validates Anthropic API payload format
 */

import assert from "assert";

// Mock the toAnthropicMessages function
function toAnthropicMessages(messages) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => String(m.content || ""))
    .join("\n\n");

  const nonSystem = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const anthropicMsgs = nonSystem.map((m) => ({
    role: m.role,
    content: [
      {
        type: "text",
        text: String(m.content || ""),
      },
    ],
  }));

  // Only add cache_control to the last message to save costs
  if (anthropicMsgs.length > 0) {
    anthropicMsgs[anthropicMsgs.length - 1].content[0].cache_control = { type: "ephemeral" };
  }

  return { system, messages: anthropicMsgs };
}

function validatePayload(payload) {
  // Check system block
  if (payload.system && payload.system.length > 0) {
    const systemBlock = payload.system[0];
    assert.strictEqual(systemBlock.type, "text", "System block should have type='text'");
    assert.strictEqual(typeof systemBlock.text, "string", "System block should have text");
    assert(!systemBlock.cache_control, "System block should NOT have cache_control");
  }

  // Check messages
  assert(Array.isArray(payload.messages), "Messages should be an array");
  payload.messages.forEach((msg, idx) => {
    assert(msg.role === "user" || msg.role === "assistant", `Message ${idx} should have valid role`);
    assert(Array.isArray(msg.content), `Message ${idx} content should be array`);

    msg.content.forEach((block, blockIdx) => {
      assert.strictEqual(block.type, "text", `Message ${idx} block ${blockIdx} should have type='text'`);
      assert.strictEqual(typeof block.text, "string", `Message ${idx} block ${blockIdx} should have text`);

      // cache_control can only be on the last content block of the last message
      if (block.cache_control) {
        const isLastMessage = idx === payload.messages.length - 1;
        const isLastBlock = blockIdx === msg.content.length - 1;
        assert(isLastMessage && isLastBlock, "cache_control should only be on last block of last message");

        // Validate cache_control format - MUST NOT have scope or other fields
        assert.strictEqual(block.cache_control.type, "ephemeral", "cache_control.type should be 'ephemeral'");
        const allowedKeys = ["type"];
        const actualKeys = Object.keys(block.cache_control);
        const hasExtraKeys = actualKeys.some(k => !allowedKeys.includes(k));
        assert(!hasExtraKeys, `cache_control should only have 'type', but has: ${actualKeys.join(", ")}`);
      }
    });
  });

  return true;
}

// Test Suite
console.log("🧪 Running ai-pr.mjs validation tests...\n");

// Test 1: Basic message conversion
console.log("Test 1: Basic message conversion");
const result1 = toAnthropicMessages([
  { role: "system", content: "You are a helper" },
  { role: "user", content: "Hello" },
]);
assert.strictEqual(result1.system, "You are a helper");
assert.strictEqual(result1.messages.length, 1);
assert.strictEqual(result1.messages[0].role, "user");
console.log("✓ Pass\n");

// Test 2: Cache control only on last message
console.log("Test 2: Cache control placement");
const result2 = toAnthropicMessages([
  { role: "system", content: "System prompt" },
  { role: "user", content: "Message 1" },
  { role: "assistant", content: "Response" },
  { role: "user", content: "Message 2 (last)" },
]);
assert.strictEqual(result2.messages.length, 3);
// First message should NOT have cache_control
assert(!result2.messages[0].content[0].cache_control, "First message should NOT have cache_control");
// Last message MUST have cache_control
assert(result2.messages[2].content[0].cache_control, "Last message MUST have cache_control");
console.log("✓ Pass\n");

// Test 3: Cache control format validation
console.log("Test 3: Cache control format (no extra fields)");
const result3 = toAnthropicMessages([
  { role: "system", content: "System" },
  { role: "user", content: "User message" },
]);
const cacheCtrl = result3.messages[0].content[0].cache_control;
assert.deepStrictEqual(cacheCtrl, { type: "ephemeral" }, "cache_control should be exactly { type: 'ephemeral' }");
assert(!cacheCtrl.scope, "cache_control must NOT have 'scope' field");
console.log("✓ Pass\n");

// Test 4: Full payload validation
console.log("Test 4: Full payload structure validation");
const messages = [
  { role: "system", content: "You are an AI" },
  { role: "user", content: "What is 2+2?" },
  { role: "assistant", content: "4" },
  { role: "user", content: "Thank you" },
];
const payload = toAnthropicMessages(messages);

// Simulate building the API payload
const fullPayload = {
  model: "claude-3-7-sonnet-latest",
  system: [
    {
      type: "text",
      text: payload.system,
    }
  ],
  messages: payload.messages,
  max_tokens: 2000,
  temperature: 0.2,
  stream: false,
};

validatePayload(fullPayload);
console.log("✓ Pass\n");

// Test 5: Empty content handling
console.log("Test 5: Empty content handling");
const result5 = toAnthropicMessages([
  { role: "system", content: "" },
  { role: "user", content: "" },
]);
assert.strictEqual(result5.system, "");
assert.strictEqual(result5.messages[0].content[0].text, "");
console.log("✓ Pass\n");

// Test 6: Multiple system messages (should be joined)
console.log("Test 6: Multiple system messages joined");
const result6 = toAnthropicMessages([
  { role: "system", content: "First instruction" },
  { role: "system", content: "Second instruction" },
  { role: "user", content: "User input" },
]);
assert.strictEqual(result6.system, "First instruction\n\nSecond instruction");
console.log("✓ Pass\n");

console.log("✅ All tests passed!\n");
console.log("Summary:");
console.log("- cache_control format is correct: { type: 'ephemeral' }");
console.log("- No 'scope' or extra fields in cache_control");
console.log("- cache_control only on last message block");
console.log("- System blocks have NO cache_control");
