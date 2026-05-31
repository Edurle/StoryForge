import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupTestDb } from "../../services/__tests__/helpers.js";
import { createDbWorker } from "../../db/worker.js";
import { saveMessages, loadHistory, createSession, getActiveSession, loadSnapshot, saveSnapshot, cleanOldSnapshots, getNextSeq } from "../history.js";

describe("History Service", () => {
  const db = setupTestDb();

  it("createSession + saveMessages + loadHistory round-trip", async () => {
    const w = db.w;
    await createSession(w, "sess-1", "proj-1", "deepseek-chat");
    const messages = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好！我是书灵。" },
    ];
    await saveMessages(w, "sess-1", messages, 0);

    const history = await loadHistory(w, "sess-1");
    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe("user");
    expect(history[0]!.content).toBe("你好");
    expect(history[1]!.role).toBe("assistant");
    expect(history[1]!.content).toBe("你好！我是书灵。");
  });

  it("saveMessages with tool_calls and tool_call_id", async () => {
    const w = db.w;
    await createSession(w, "sess-2", "proj-1", "deepseek-chat");
    const messages = [
      { role: "user" as const, content: "查叶凡" },
      { role: "assistant" as const, content: "", tool_calls: [{ id: "tc1", type: "function" as const, function: { name: "query_character", arguments: '{"name":"叶凡"}' } }] },
      { role: "tool" as const, tool_call_id: "tc1", content: '{"name":"叶凡"}' },
    ];
    await saveMessages(w, "sess-2", messages, 0);

    const history = await loadHistory(w, "sess-2");
    expect(history).toHaveLength(3);
    expect(history[1]!.role).toBe("assistant");
    expect(history[1]!.toolCalls).toContain("query_character");
    expect(history[2]!.role).toBe("tool");
    expect(history[2]!.toolCallId).toBe("tc1");
  });

  it("getActiveSession returns empty for new project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sf-hist-"));
    const w = createDbWorker(join(dir, "empty.db"));
    try {
      const result = await getActiveSession(w, "new-project");
      expect(result.isNew).toBe(true);
      expect(result.sessionId).toBe("");
    } finally {
      w.close();
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });

  it("getActiveSession returns existing session", async () => {
    const w = db.w;
    await createSession(w, "sess-old", "proj-gas", "deepseek-chat");
    await new Promise((r) => setTimeout(r, 1100));
    await createSession(w, "sess-new", "proj-gas", "deepseek-chat");

    const result = await getActiveSession(w, "proj-gas");
    expect(result.isNew).toBe(false);
    expect(result.sessionId).toBe("sess-new");
  });

  it("saveMessages with usageMap persists usage_json", async () => {
    const w = db.w;
    await createSession(w, "sess-usage", "proj-1", "deepseek-chat");
    const messages = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好！我是书灵。" },
    ];
    const usageMap = new Map<number, { promptTokens: number; completionTokens: number; cacheHitTokens: number; cacheMissTokens: number }>();
    usageMap.set(1, { promptTokens: 100, completionTokens: 50, cacheHitTokens: 80, cacheMissTokens: 20 });
    await saveMessages(w, "sess-usage", messages, 0, usageMap);

    const history = await loadHistory(w, "sess-usage");
    expect(history).toHaveLength(2);
    expect(history[0]!.usageJson).toBe("");
    expect(history[1]!.usageJson).toBe('{"promptTokens":100,"completionTokens":50,"cacheHitTokens":80,"cacheMissTokens":20}');
  });

  it("loadHistory returns empty for non-existent session", async () => {
    const history = await loadHistory(db.w, "no-such-session");
    expect(history).toEqual([]);
  });

  it("saveMessages appends with startSeq", async () => {
    const w = db.w;
    await createSession(w, "sess-append", "proj-1", "deepseek-chat");
    const msgs1 = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi" },
    ];
    await saveMessages(w, "sess-append", msgs1, 0);

    const msgs2 = [
      { role: "user" as const, content: "world" },
      { role: "assistant" as const, content: "hey" },
    ];
    await saveMessages(w, "sess-append", msgs2, 2);

    const history = await loadHistory(w, "sess-append");
    expect(history).toHaveLength(4);
    expect(history[0]!.seq).toBe(0);
    expect(history[1]!.seq).toBe(1);
    expect(history[2]!.seq).toBe(2);
    expect(history[2]!.content).toBe("world");
    expect(history[3]!.seq).toBe(3);
    expect(history[3]!.content).toBe("hey");
  });

  it("snapshot round-trip", async () => {
    const w = db.w;
    await createSession(w, "sess-snap", "proj-snap", "deepseek-chat");
    const msgs = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好！我是书灵。" },
    ];
    await saveSnapshot(w, "proj-snap", "sess-snap", msgs, 100, 0);

    const loaded = await loadSnapshot(w, "sess-snap");
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.role).toBe("user");
    expect(loaded[0]!.content).toBe("你好");
    expect(loaded[1]!.role).toBe("assistant");
  });

  it("loadSnapshot returns empty for non-existent session", async () => {
    const loaded = await loadSnapshot(db.w, "no-such-session");
    expect(loaded).toEqual([]);
  });

  it("cleanOldSnapshots keeps only 20", async () => {
    const w = db.w;
    await createSession(w, "sess-clean", "proj-clean", "deepseek-chat");
    const msgs = [{ role: "user" as const, content: "hi" }];
    for (let i = 0; i < 25; i++) {
      await saveSnapshot(w, "proj-clean", "sess-clean", msgs, 0, 0);
    }
    await cleanOldSnapshots(w, "sess-clean");

    const loaded = await loadSnapshot(w, "sess-clean");
    expect(loaded).toHaveLength(1);

    const allRes = await w.request({
      id: 0, type: "query",
      sql: "SELECT COUNT(*) as cnt FROM context_snapshots WHERE session_id = ?",
      params: ["sess-clean"],
    });
    const cnt = (allRes.data as Array<Record<string, number>>)[0]!["cnt"];
    expect(cnt).toBe(20);
  });

  it("getNextSeq returns 0 for empty session", async () => {
    const w = db.w;
    await createSession(w, "sess-seq", "proj-1", "deepseek-chat");
    const seq = await getNextSeq(w, "sess-seq");
    expect(seq).toBe(0);
  });

  it("getNextSeq returns maxSeq + 1 after messages", async () => {
    const w = db.w;
    await createSession(w, "sess-seq2", "proj-1", "deepseek-chat");
    await saveMessages(w, "sess-seq2", [
      { role: "user" as const, content: "a" },
      { role: "assistant" as const, content: "b" },
    ], 0);
    const seq = await getNextSeq(w, "sess-seq2");
    expect(seq).toBe(2);
  });
});
