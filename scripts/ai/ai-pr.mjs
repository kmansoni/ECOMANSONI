import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const task = process.env.AI_TASK;
if (!task || !task.trim()) {
  console.error("Missing AI_TASK");
  process.exit(1);
}

const apiKey = process.env.AI_API_KEY;
if (!apiKey) {
  console.error("Missing AI_API_KEY secret");
  process.exit(1);
}

const provider = String(process.env.AI_PROVIDER || "openai_compat").toLowerCase();

const baseUrlDefault = provider === "anthropic"
  ? "https://api.anthropic.com/v1"
  : "https://api.mansoni.ru/v1";

const baseUrl = (process.env.AI_BASE_URL || baseUrlDefault).replace(/\/$/, "");
const model = process.env.AI_MODEL || (provider === "anthropic" ? "claude-3-7-sonnet-latest" : "google/gemini-3-flash-preview");
const maxTokens = Number(process.env.AI_MAX_TOKENS || 2000);

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
}

function listRepoFiles() {
  const out = sh("git ls-files");
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function safeReadFile(relPath, maxChars = 20000) {
  const abs = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const raw = fs.readFileSync(abs, "utf8");
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars) + "\n\n/* TRUNCATED */\n";
}

function toAnthropicMessages(messages) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => String(m.content || ""))
    .join("\n\n");

  const nonSystem = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const anthropicMsgs = nonSystem.map((m) => ({
    role: m.role,
    content: [{ type: "text", text: String(m.content || "") }],
  }));

  return { system, messages: anthropicMsgs };
}

async function callAI(messages, { stream = false } = {}) {
  if (stream) throw new Error("Streaming not supported in workflow script");

  if (provider === "anthropic") {
    const url = `${baseUrl}/messages`;
    const payload = toAnthropicMessages(messages);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: payload.system,
        messages: payload.messages,
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`AI upstream error ${resp.status}: ${t}`);
    }

    const json = await resp.json();
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks.map((b) => String(b?.text ?? "")).join("");
    if (!text.trim()) throw new Error("AI returned empty content");
    return String(text);
  }

  // OpenAI-compatible
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI upstream error ${resp.status}: ${t}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  return String(content);
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function stripFences(s) {
  const m = s.match(/```(?:diff)?\n([\s\S]*?)\n```/);
  return m ? m[1] : s;
}

function applyPatch(patch) {
  fs.writeFileSync(".ai.patch", patch, "utf8");
  try {
    sh("git apply --whitespace=nowarn .ai.patch");
  } catch (e) {
    const msg = e?.stderr?.toString?.() || String(e);
    console.error("git apply failed:\n", msg);
    console.error("Patch saved to .ai.patch");
    process.exit(1);
  }
}

const repoFiles = listRepoFiles();

const system1 = {
  role: "system",
  content:
    "You are an automated coding agent running inside GitHub Actions. " +
    "You must propose which files to read to implement the task. Return ONLY JSON. " +
    "Do NOT include any extra commentary. Do NOT request user input. ",
};

const user1 = {
  role: "user",
  content: [
    `Task: ${task}`,
    "",
    "Repository file list:",
    repoFiles.slice(0, 1200).join("\n"),
    "",
    "Return JSON: {\"files\": [<up to 8 repo-relative paths>], \"notes\": \"...\" }",
  ].join("\n"),
};

const pickText = await callAI([system1, user1]);
const picked = extractJson(pickText);
const filesToRead = Array.isArray(picked?.files) ? picked.files.slice(0, 8) : [];

if (!filesToRead.length) {
  console.error("AI did not return files to read. Raw:\n", pickText);
  process.exit(1);
}

const filePayload = filesToRead
  .map((p) => {
    const content = safeReadFile(p);
    return {
      path: p,
      content: content ?? "<MISSING>",
    };
  })
  .filter(Boolean);

const system2 = {
  role: "system",
  content:
    "You are an automated coding agent. Produce a unified diff patch that applies cleanly. " +
    "Return ONLY the diff (no explanations). If impossible, return 'NO_PATCH'. " +
    "Keep changes minimal, do not break existing behavior, do not add AI signatures. " +
    "Do not introduce Cyrillic identifiers in code, file names, or diffs.",
};

const user2 = {
  role: "user",
  content: [
    `Task: ${task}`,
    "",
    "Context files:",
    ...filePayload.map((f) => `--- FILE: ${f.path}\n${f.content}`),
    "",
    "Output: unified diff starting with '*** Begin Patch' is NOT allowed. Use standard git diff format.",
  ].join("\n\n"),
};

const patchTextRaw = await callAI([system2, user2]);
const patchText = stripFences(patchTextRaw).trim();

if (patchText === "NO_PATCH") {
  console.error("AI could not produce a patch.");
  process.exit(1);
}

applyPatch(patchText);
console.log("Patch applied successfully.");
