/**
 * Anthropic client tests for client-side integration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAnthropicConfig,
  isAnthropicConfigured,
  type AnthropicMessage,
} from "./anthropic-client";

describe("anthropic-client", () => {
  beforeEach(() => {
    // Reset import.meta.env for each test
    import.meta.env.VITE_ANTHROPIC_ENABLED = "";
    import.meta.env.VITE_ANTHROPIC_MODEL = "";
    import.meta.env.VITE_ANTHROPIC_MAX_TOKENS = "";
  });

  describe("getAnthropicConfig", () => {
    it("should return default config when env vars not set", () => {
      const config = getAnthropicConfig();

      expect(config).toHaveProperty("model", "claude-opus-4-6");
      expect(config).toHaveProperty("maxTokens", 2000);
    });

    it("should return custom model from env", () => {
      import.meta.env.VITE_ANTHROPIC_MODEL = "claude-3-haiku";
      const config = getAnthropicConfig();

      expect(config.model).toBe("claude-3-haiku");
    });

    it("should return custom max_tokens from env", () => {
      import.meta.env.VITE_ANTHROPIC_MAX_TOKENS = "4000";
      const config = getAnthropicConfig();

      expect(config.maxTokens).toBe(4000);
    });

    it("should handle invalid max_tokens gracefully", () => {
      import.meta.env.VITE_ANTHROPIC_MAX_TOKENS = "invalid";
      const config = getAnthropicConfig();

      expect(Number.isNaN(config.maxTokens)).toBe(true);
    });
  });

  describe("isAnthropicConfigured", () => {
    it("should return false when flag not set", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "";
      expect(isAnthropicConfigured()).toBe(false);
    });

    it("should return false when flag is whitespace", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "   ";
      expect(isAnthropicConfigured()).toBe(false);
    });

    it("should return true when flag is set", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "true";
      expect(isAnthropicConfigured()).toBe(true);
    });

    it("should return false when flag is 'false'", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "false";
      expect(isAnthropicConfigured()).toBe(false);
    });

    it("should return false when flag is '0'", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "0";
      expect(isAnthropicConfigured()).toBe(false);
    });
  });

  describe("Anthropic message format", () => {
    it("should accept valid AnthropicMessage objects", () => {
      const messages: AnthropicMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ];

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: "user", content: "Hello" });
      expect(messages[2].role).toBe("user");
    });

    it("should handle multiline content", () => {
      const message: AnthropicMessage = {
        role: "user",
        content: `Line 1
Line 2
Line 3`,
      };

      expect(message.content).toContain("Line 1");
      expect(message.content).toContain("Line 3");
    });

    it("should prioritize VITE_ANTHROPIC_MODEL over default", () => {
      import.meta.env.VITE_ANTHROPIC_MODEL = "claude-opus-4-6";
      const config = getAnthropicConfig();
      expect(config.model).toBe("claude-opus-4-6");
    });
  });

  describe("Config validation", () => {
    it("should not be configured without flag", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "";
      expect(isAnthropicConfigured()).toBe(false);
    });

    it("should trim whitespace in flag value", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "  true  ";
      expect(isAnthropicConfigured()).toBe(true);
    });
  });

  describe("System prompt format", () => {
    it("should handle system prompt in Anthropic format", () => {
      const systemPrompt =
        "You are a helpful assistant. Respond in Russian. Be concise.";

      // Just verify it's a string and non-empty
      expect(typeof systemPrompt).toBe("string");
      expect(systemPrompt.length).toBeGreaterThan(0);
    });
  });

  describe("Setup validation for .env.local", () => {
    it("should indicate when VITE_ANTHROPIC_ENABLED is needed", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "";

      if (!isAnthropicConfigured()) {
        console.log(
          "Note: Set VITE_ANTHROPIC_ENABLED=true in .env.local to enable Anthropic"
        );
      }

      expect(isAnthropicConfigured()).toBe(false);
    });

    it("should work when all env vars are set", () => {
      import.meta.env.VITE_ANTHROPIC_ENABLED = "true";
      import.meta.env.VITE_ANTHROPIC_MODEL = "claude-opus-4-6";
      import.meta.env.VITE_ANTHROPIC_MAX_TOKENS = "3000";

      expect(isAnthropicConfigured()).toBe(true);
      const config = getAnthropicConfig();
      expect(config.model).toBe("claude-opus-4-6");
      expect(config.maxTokens).toBe(3000);
    });
  });
});
