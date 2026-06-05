import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import { createApp, resetProjects } from "../index.js";
import type { ServerDeps } from "../index.js";
import { createDbWorker } from "../../db/worker.js";
import { PauseGate } from "../../../lib/reasonix-core/core/pause-gate.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let testDbDir: string;
let testProjectsDb: ReturnType<typeof createDbWorker>;

function createMockDeps(): ServerDeps {
  const gate = new PauseGate();
  gate.on((req) => {
    if (req.kind === "plan_proposed") gate.resolve(req.id, { type: "approve" });
    else if (req.kind === "plan_checkpoint") gate.resolve(req.id, { type: "continue" });
  });
  return {
    getDbWorker: vi.fn().mockReturnValue({
      request: async () => ({ ok: true, data: [] }),
    }),
    getOrCreateLoop: vi.fn(),
    projectsDb: testProjectsDb,
    gate,
  };
}

function assertNoApiKeyLeak(text: string) {
  const lower = text.toLowerCase();
  expect(lower).not.toContain("api_key");
  expect(lower).not.toContain("apikey");
}

beforeEach(async () => {
  await resetProjects({ projectsDb: testProjectsDb } as ServerDeps);
});

afterAll(() => {
  testProjectsDb.close();
  try { rmSync(testDbDir, { recursive: true, force: true }); } catch {}
});

testDbDir = mkdtempSync(join(tmpdir(), "sf-api-"));
testProjectsDb = createDbWorker(join(testDbDir, "test-projects.db"));

describe("Project CRUD", () => {
  let deps: ServerDeps;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    deps = createMockDeps();
    app = await createApp(deps);
  });

  it("POST /api/projects creates a project and returns 201", async () => {
    const res = await request(app).post("/api/projects").send({ name: "仙逆" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("name", "仙逆");
    expect(res.body).toHaveProperty("createdAt");
    assertNoApiKeyLeak(JSON.stringify(res.body));
  });

  it("GET /api/projects returns array of projects", async () => {
    await request(app).post("/api/projects").send({ name: "遮天" });
    await request(app).post("/api/projects").send({ name: "完美世界" });

    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    assertNoApiKeyLeak(JSON.stringify(res.body));
  });

  it("GET /api/projects/:id returns project or 404", async () => {
    const createRes = await request(app).post("/api/projects").send({ name: "求魔" });
    const id = createRes.body.id;

    const found = await request(app).get(`/api/projects/${id}`);
    expect(found.status).toBe(200);
    expect(found.body.name).toBe("求魔");

    const missing = await request(app).get("/api/projects/nonexistent-id");
    expect(missing.status).toBe(404);
    assertNoApiKeyLeak(JSON.stringify(found.body));
  });

  it("DELETE /api/projects/:id returns 204 or 404", async () => {
    const createRes = await request(app).post("/api/projects").send({ name: "我欲封天" });
    const id = createRes.body.id;

    const del = await request(app).delete(`/api/projects/${id}`);
    expect(del.status).toBe(204);

    const delAgain = await request(app).delete(`/api/projects/${id}`);
    expect(delAgain.status).toBe(404);
  });

  it("projects persist across createApp calls", async () => {
    const deps1 = createMockDeps();
    const app1 = await createApp(deps1);
    await request(app1).post("/api/projects").send({ name: "盘龙" });

    const deps2 = createMockDeps();
    const app2 = await createApp(deps2);
    const res = await request(app2).get("/api/projects");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("盘龙");
  });
});

describe("Chat SSE", () => {
  let deps: ServerDeps;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    deps = createMockDeps();
    app = await createApp(deps);
  });

  it("POST /api/projects/:id/chat returns SSE stream", async () => {
    const mockLoop = {
      messageCount: 0,
      lastPromptTokenCount: 0,
      getMessages: () => [{ role: "user", content: "查询叶凡" }, { role: "assistant", content: "叶凡在筑基九层" }],
      getContextMessages: () => [{ role: "user", content: "查询叶凡" }, { role: "assistant", content: "叶凡在筑基九层" }],
      async *runTurn(_input: string) {
        yield { type: "usage", usage: { promptTokens: 100, completionTokens: 50, cacheHitTokens: 80, cacheMissTokens: 20 } };
        yield { type: "assistant", content: "查询中..." };
        yield { type: "tool_call", call: { id: "tc1", function: { name: "query_character", arguments: '{"name":"叶凡"}' } } };
        yield { type: "tool_result", call: { id: "tc1", function: { name: "query_character", arguments: '{"name":"叶凡"}' } }, result: '{"name":"叶凡"}' };
        yield { type: "done", content: "叶凡在筑基九层" };
      },
      abort() {},
    };
    deps.getOrCreateLoop = vi.fn().mockResolvedValue({ loop: mockLoop, sessionId: "test-session-1" });

    const res = await request(app).post("/api/projects/test-project-id/chat").send({ message: "查询叶凡" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: assistant");
    expect(res.text).toContain("event: tool_call");
    expect(res.text).toContain("event: tool_result");
    expect(res.text).toContain("event: usage");
    expect(res.text).toContain("event: done");
    expect(res.text).toContain("promptTokens");
    assertNoApiKeyLeak(res.text);
  });

  it("POST /api/projects/:id/chat passes model opts to runTurn", async () => {
    const mockLoop = {
      messageCount: 0,
      lastPromptTokenCount: 0,
      getMessages: () => [],
      getContextMessages: () => [],
      async *runTurn(_input: string, opts: any) {
        yield { type: "done", content: `model:${opts?.model}` };
      },
      abort() {},
    };
    deps.getOrCreateLoop = vi.fn().mockResolvedValue({ loop: mockLoop, sessionId: "test-session-opts" });

    const res = await request(app)
      .post("/api/projects/test-project-id/chat")
      .send({ message: "hi", model: "deepseek-v4-pro", thinking: "disabled", reasoning_effort: "max" });

    expect(res.text).toContain("model:deepseek-v4-pro");
  });

  it("GET /api/projects/:id/history returns messages from session", async () => {
    const historyData = [
      { seq: 0, role: "user", content: "你好", toolCalls: "[]", toolCallId: "", reasoningContent: "", usageJson: "" },
      { seq: 1, role: "assistant", content: "你好！我是书灵。", toolCalls: "[]", toolCallId: "", reasoningContent: "", usageJson: "" },
    ];
    deps.getDbWorker = vi.fn().mockReturnValue({
      request: async (req: any) => {
        if (req.sql.includes("agent_messages")) return { ok: true, data: historyData };
        return { ok: true, data: [] };
      },
    });
    deps.getOrCreateLoop = vi.fn().mockResolvedValue({ loop: {}, sessionId: "sess-1" });

    const res = await request(app).get("/api/projects/test-id/history");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].role).toBe("user");
    expect(res.body[1].content).toBe("你好！我是书灵。");
    assertNoApiKeyLeak(JSON.stringify(res.body));
  });
});

describe("Chat SSE error handling", () => {
  let deps: ServerDeps;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    deps = createMockDeps();
    app = await createApp(deps);
  });

  it("POST /api/projects/:id/chat sends error event on loop error", async () => {
    const mockLoop = {
      messageCount: 0,
      lastPromptTokenCount: 0,
      getMessages: () => [{ role: "user", content: "测试错误" }, { role: "assistant", content: "" }],
      getContextMessages: () => [{ role: "user", content: "测试错误" }, { role: "assistant", content: "" }],
      async *runTurn(_input: string) {
        yield { type: "error", error: new Error("模型过载") };
      },
      abort() {},
    };
    deps.getOrCreateLoop = vi.fn().mockResolvedValue({ loop: mockLoop, sessionId: "test-session-err" });
    deps.getDbWorker = vi.fn().mockReturnValue({
      request: async () => ({ ok: true, data: [] }),
    });

    const res = await request(app).post("/api/projects/test-id/chat").send({ message: "测试错误" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("模型过载");
    assertNoApiKeyLeak(res.text);
  });

  it("DELETE /api/projects/:id/chat/abort calls loop.abort and returns 200", async () => {
    const abortFn = vi.fn();
    const mockLoop = {
      messageCount: 0,
      lastPromptTokenCount: 0,
      getMessages: () => [],
      getContextMessages: () => [],
      async *runTurn() { yield { type: "done", content: "" }; },
      abort: abortFn,
    };
    deps.getOrCreateLoop = vi.fn().mockResolvedValue({ loop: mockLoop, sessionId: "test-session-abort" });

    const res = await request(app).delete("/api/projects/test-id/chat/abort");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(abortFn).toHaveBeenCalledOnce();
    assertNoApiKeyLeak(JSON.stringify(res.body));
  });
});

describe("Chapter routes", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp(createMockDeps());
  });

  it("GET /api/projects/:id/chapters returns array", async () => {
    const res = await request(app).get("/api/projects/test-id/chapters");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/projects/:id/chapters/:chapterId/content returns content", async () => {
    const res = await request(app).get("/api/projects/test-id/chapters/1/content");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chapterId");
    expect(res.body).toHaveProperty("content");
  });

  it("GET /api/projects/:id/export returns text file", async () => {
    const res = await request(app).get("/api/projects/test-id/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });
});

describe("Segment routes", () => {
  let segDbDir: string;
  let segDb: ReturnType<typeof createDbWorker>;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    segDbDir = mkdtempSync(join(tmpdir(), "sf-seg-"));
    segDb = createDbWorker(join(segDbDir, "seg-test.db"));
    await segDb.request({ id: 0, type: "run", sql: "INSERT INTO chapters (volume, title, status) VALUES (1, 'Test Chapter', 'draft')", params: [] });
    await segDb.request({ id: 0, type: "run", sql: "INSERT INTO segments (chapter_id, seq, type, content) VALUES (1, 0, 'narration', 'First paragraph')", params: [] });
    await segDb.request({ id: 0, type: "run", sql: "INSERT INTO segments (chapter_id, seq, type, content) VALUES (1, 1, 'narration', 'Second paragraph')", params: [] });
    await segDb.request({ id: 0, type: "run", sql: "INSERT INTO segments (chapter_id, seq, type, content) VALUES (1, 2, 'narration', 'Third paragraph')", params: [] });

    const gate = new PauseGate();
    gate.on((req) => {
      if (req.kind === "plan_proposed") gate.resolve(req.id, { type: "approve" });
      else if (req.kind === "plan_checkpoint") gate.resolve(req.id, { type: "continue" });
    });
    const deps: ServerDeps = {
      getDbWorker: () => segDb,
      getOrCreateLoop: vi.fn(),
      projectsDb: testProjectsDb,
      gate,
    };
    app = await createApp(deps);
  });

  afterEach(() => {
    segDb.close();
    try { rmSync(segDbDir, { recursive: true, force: true }); } catch {}
  });

  it("GET segments returns segments for a chapter", async () => {
    const res = await request(app).get("/api/projects/test-id/chapters/1/segments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].content).toBe("First paragraph");
    expect(res.body[1].content).toBe("Second paragraph");
    expect(res.body[2].content).toBe("Third paragraph");
  });

  it("PUT reorder updates the seq order", async () => {
    const segsBefore = await request(app).get("/api/projects/test-id/chapters/1/segments");
    const ids = segsBefore.body.map((s: any) => s.id);
    const reordered = [ids[2], ids[1], ids[0]];

    const putRes = await request(app)
      .put("/api/projects/test-id/chapters/1/segments/reorder")
      .send({ segmentIds: reordered });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({ ok: true });

    const segsAfter = await request(app).get("/api/projects/test-id/chapters/1/segments");
    expect(segsAfter.body).toHaveLength(3);
    expect(segsAfter.body[0].content).toBe("Third paragraph");
    expect(segsAfter.body[1].content).toBe("Second paragraph");
    expect(segsAfter.body[2].content).toBe("First paragraph");
  });
});
