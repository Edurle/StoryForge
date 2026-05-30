import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupTestDb } from "../../services/__tests__/helpers.js";
import { createDbWorker } from "../../db/worker.js";
import { saveMessages, loadHistory, getLatestSessionId, createSession } from "../history.js";

describe("History Service", () => {
  const db = setupTestDb();

  it("createSession + saveMessages + loadHistory round-trip", async () => {
    const w = db.w;
    await createSession(w, "sess-1", "deepseek-chat");
    const messages = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好！我是书灵。" },
    ];
    await saveMessages(w, "sess-1", messages);

    const history = await loadHistory(w, "sess-1");
    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe("user");
    expect(history[0]!.content).toBe("你好");
    expect(history[1]!.role).toBe("assistant");
    expect(history[1]!.content).toBe("你好！我是书灵。");
  });

  it("saveMessages with tool_calls and tool_call_id", async () => {
    const w = db.w;
    await createSession(w, "sess-2", "deepseek-chat");
    const messages = [
      { role: "user" as const, content: "查叶凡" },
      { role: "assistant" as const, content: "", tool_calls: [{ id: "tc1", type: "function" as const, function: { name: "query_character", arguments: '{"name":"叶凡"}' } }] },
      { role: "tool" as const, tool_call_id: "tc1", content: '{"name":"叶凡"}' },
    ];
    await saveMessages(w, "sess-2", messages);

    const history = await loadHistory(w, "sess-2");
    expect(history).toHaveLength(3);
    expect(history[1]!.role).toBe("assistant");
    expect(history[1]!.toolCalls).toContain("query_character");
    expect(history[2]!.role).toBe("tool");
    expect(history[2]!.toolCallId).toBe("tc1");
  });

  it("getLatestSessionId returns null when no sessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sf-hist-"));
    const w = createDbWorker(join(dir, "empty.db"));
    try {
      const latestId = await getLatestSessionId(w);
      expect(latestId).toBeNull();
    } finally {
      w.close();
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });

  it("getLatestSessionId returns most recent session", async () => {
    const w = db.w;
    await createSession(w, "sess-old", "deepseek-chat");
    await new Promise((r) => setTimeout(r, 1100));
    await createSession(w, "sess-new", "deepseek-chat");

    const latestId = await getLatestSessionId(w);
    expect(latestId).toBe("sess-new");
  });

  it("saveMessages with usageMap persists usage_json", async () => {
    const w = db.w;
    await createSession(w, "sess-usage", "deepseek-chat");
    const messages = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好！我是书灵。" },
    ];
    const usageMap = new Map<number, { promptTokens: number; completionTokens: number; cacheHitTokens: number; cacheMissTokens: number }>();
    usageMap.set(1, { promptTokens: 100, completionTokens: 50, cacheHitTokens: 80, cacheMissTokens: 20 });
    await saveMessages(w, "sess-usage", messages, usageMap);

    const history = await loadHistory(w, "sess-usage");
    expect(history).toHaveLength(2);
    expect(history[0]!.usageJson).toBe("");
    expect(history[1]!.usageJson).toBe('{"promptTokens":100,"completionTokens":50,"cacheHitTokens":80,"cacheMissTokens":20}');
  });

  it("loadHistory returns empty for non-existent session", async () => {
    const history = await loadHistory(db.w, "no-such-session");
    expect(history).toEqual([]);
  });
});
