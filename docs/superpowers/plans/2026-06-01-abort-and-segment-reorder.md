# Abort + Segment Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stop button to abort agent output mid-stream (with message saving) and drag-to-reorder segments in chapter preview.

**Architecture:** Backend already has `loop.abort()` + `AbortController`. We add a `DELETE /chat/abort` endpoint, frontend stores the `AbortController` ref and shows a stop button. For segments, we add a reorder API + per-segment display with `vuedraggable`.

**Tech Stack:** Express 5, Vue 3, vuedraggable@next, vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/agent/loop.ts` | Modify | Distinguish abort errors from real errors |
| `src/server/index.ts` | Modify | Add abort endpoint, handle `aborted` SSE event |
| `src/services/knowledge.ts` | Modify | Add `queryChapterSegments`, `reorderSegments` |
| `src/server/__tests__/api.test.ts` | Modify | Add tests for abort + segment routes |
| `web/src/api/client.ts` | Modify | Add `abort`, `getChapterSegments`, `reorderSegments` |
| `web/src/views/ProjectWorkbench.vue` | Modify | Stop button, per-segment display with drag |
| `web/package.json` | Modify | Add `vuedraggable` dependency |

---

### Task 1: Backend — Loop abort error handling

**Files:**
- Modify: `src/agent/loop.ts:110-125`

- [ ] **Step 1: Write the failing test**

In `src/agent/__tests__/loop.test.ts`, add a test that verifies abort during an in-flight `client.chat()` call yields `{ type: "aborted" }` (not error):

```typescript
it("yields aborted when client.chat throws AbortError", async () => {
  const mockClient = {
    chat: vi.fn().mockRejectedValue(Object.assign(new Error("The user aborted a request."), { name: "AbortError" })),
  };
  const tools = new ToolRegistry();
  const prefix = new ImmutablePrefix([]);
  const loop = new StoryForgeLoop({ client: mockClient, tools, prefix });

  const events: EngineEvent[] = [];
  for await (const event of loop.runTurn("hello")) {
    events.push(event);
  }
  expect(events.some(e => e.type === "aborted")).toBe(true);
  expect(events.some(e => e.type === "error")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent/__tests__/loop.test.ts`
Expected: FAIL — abort error currently yields `{ type: "error" }`

- [ ] **Step 3: Write minimal implementation**

In `src/agent/loop.ts`, change the catch block in `runTurn` (around line 122):

```typescript
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          yield { type: "aborted" };
          return;
        }
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
        return;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/agent/__tests__/loop.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/agent/loop.ts src/agent/__tests__/loop.test.ts
git commit -m "feat: loop yields aborted on AbortError instead of error"
```

---

### Task 2: Backend — Abort endpoint + SSE aborted event

**Files:**
- Modify: `src/server/index.ts` (add abort route + handle aborted event)
- Modify: `src/server/__tests__/api.test.ts` (add test)

- [ ] **Step 1: Add the abort route**

In `src/server/index.ts`, add after the gate resolve route (around line 208):

```typescript
  app.delete("/api/projects/:projectId/chat/abort", async (req, res) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    try {
      const { loop } = await deps.getOrCreateLoop(projectId);
      loop.abort();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed to abort" });
    }
  });
```

- [ ] **Step 2: Handle aborted SSE event**

In the SSE `for await` loop in `src/server/index.ts` (around line 161), add after the `error` handler:

```typescript
        } else if (event.type === "aborted") {
          res.write(`event: aborted\ndata: {}\n\n`);
        }
```

- [ ] **Step 3: Write test for abort route**

In `src/server/__tests__/api.test.ts`, add inside the `Project CRUD` describe block (or a new describe block):

```typescript
describe("Chat abort", () => {
  let deps: ServerDeps;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    deps = createMockDeps();
    (deps.getOrCreateLoop as ReturnType<typeof vi.fn>).mockResolvedValue({
      loop: { abort: vi.fn(), getMessages: () => [], messageCount: 0, lastPromptTokenCount: 0 },
      sessionId: "test-session",
    });
    app = await createApp(deps);
  });

  it("DELETE /chat/abort returns 200", async () => {
    const createRes = await request(app).post("/api/projects").send({ name: "TestAbort" });
    const id = createRes.body.id;
    const res = await request(app).delete(`/api/projects/${id}/chat/abort`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 6: Commit**

```bash
git add src/server/index.ts src/server/__tests__/api.test.ts
git commit -m "feat: add DELETE /chat/abort endpoint and SSE aborted event"
```

---

### Task 3: Backend — Segment reorder + segments query

**Files:**
- Modify: `src/services/knowledge.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/__tests__/api.test.ts`

- [ ] **Step 1: Add service functions**

In `src/services/knowledge.ts`, add at the end (before the last function or after `queryKgGraph`):

```typescript
export async function queryChapterSegments(w: DbWorker, chapterId: number): Promise<Array<{ id: number; seq: number; content: string }>> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id, seq, content FROM segments WHERE chapter_id = ? ORDER BY seq, id",
    params: [chapterId],
  });
  if (!res.ok || !res.data) return [];
  return res.data as Array<{ id: number; seq: number; content: string }>;
}

export async function reorderSegments(w: DbWorker, chapterId: number, orderedIds: number[]): Promise<void> {
  const stmts = orderedIds.map((id, idx) =>
    w.request({ id: 0, type: "run", sql: "UPDATE segments SET seq = ? WHERE id = ? AND chapter_id = ?", params: [idx, id, chapterId] })
  );
  await Promise.all(stmts);
}
```

- [ ] **Step 2: Add routes**

In `src/server/index.ts`, add imports for the new functions:

```typescript
import { queryCharacters, queryAllSettings, queryFormulas, queryAllTimeline, queryItems, queryFactions, queryLocations, queryChapters, queryChapterContent, queryChapterSegments, reorderSegments, queryKgGraph } from "../services/knowledge.js";
```

Add two new routes (after the chapter content route, around line 249):

```typescript
  app.get("/api/projects/:projectId/chapters/:chapterId/segments", async (req, res) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const chapterId = parseInt((req.params as Record<string, string | undefined>).chapterId!, 10);
    if (isNaN(chapterId)) { res.status(400).json({ error: "invalid chapterId" }); return; }
    const db = deps.getDbWorker(projectId);
    res.json(await queryChapterSegments(db, chapterId));
  });

  app.put("/api/projects/:projectId/chapters/:chapterId/segments/reorder", async (req, res) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const chapterId = parseInt((req.params as Record<string, string | undefined>).chapterId!, 10);
    if (isNaN(chapterId)) { res.status(400).json({ error: "invalid chapterId" }); return; }
    const segmentIds = req.body.segmentIds as number[] | undefined;
    if (!Array.isArray(segmentIds)) { res.status(400).json({ error: "segmentIds array required" }); return; }
    const db = deps.getDbWorker(projectId);
    await reorderSegments(db, chapterId, segmentIds);
    res.json({ success: true });
  });
```

- [ ] **Step 3: Write tests**

In `src/server/__tests__/api.test.ts`, add inside a new describe block that uses a real DB for segment operations:

```typescript
describe("Segment routes", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let realDb: DbWorker;
  let realDbDir: string;

  beforeAll(async () => {
    realDbDir = mkdtempSync(join(tmpdir(), "sf-seg-"));
    realDb = createDbWorker(join(realDbDir, "segments.db"));
  });

  afterAll(() => {
    realDb.close();
    try { rmSync(realDbDir, { recursive: true, force: true }); } catch {}
  });

  beforeEach(async () => {
    const gate = new PauseGate();
    gate.on((req) => {
      if (req.kind === "plan_proposed") gate.resolve(req.id, { type: "approve" });
      else if (req.kind === "plan_checkpoint") gate.resolve(req.id, { type: "continue" });
    });
    const deps: ServerDeps = {
      getDbWorker: () => realDb,
      getOrCreateLoop: vi.fn(),
      projectsDb: testProjectsDb,
      gate,
    };
    app = await createApp(deps);
  });

  it("GET /segments returns segments for chapter", async () => {
    const db = realDb;
    await db.request({ id: 0, type: "run", sql: "INSERT INTO chapters (id, volume, title) VALUES (1, 1, '第一章')", params: [] });
    await db.request({ id: 0, type: "run", sql: "INSERT INTO segments (id, chapter_id, seq, content) VALUES (1, 1, 0, '段落A')", params: [] });
    await db.request({ id: 0, type: "run", sql: "INSERT INTO segments (id, chapter_id, seq, content) VALUES (2, 1, 1, '段落B')", params: [] });
    const createRes = await request(app).post("/api/projects").send({ name: "SegTest" });
    const pid = createRes.body.id;
    const res = await request(app).get(`/api/projects/${pid}/chapters/1/segments`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].content).toBe("段落A");
  });

  it("PUT /segments/reorder updates seq order", async () => {
    const createRes = await request(app).post("/api/projects").send({ name: "ReorderTest" });
    const pid = createRes.body.id;
    await realDb.request({ id: 0, type: "run", sql: "INSERT INTO chapters (id, volume, title) VALUES (10, 1, '重排章')", params: [] });
    await realDb.request({ id: 0, type: "run", sql: "INSERT INTO segments (id, chapter_id, seq, content) VALUES (10, 10, 0, 'X')", params: [] });
    await realDb.request({ id: 0, type: "run", sql: "INSERT INTO segments (id, chapter_id, seq, content) VALUES (11, 10, 1, 'Y')", params: [] });
    const res = await request(app).put(`/api/projects/${pid}/chapters/10/segments/reorder`).send({ segmentIds: [11, 10] });
    expect(res.status).toBe(200);
    const segs = await request(app).get(`/api/projects/${pid}/chapters/10/segments`);
    expect(segs.body[0].id).toBe(11);
    expect(segs.body[1].id).toBe(10);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 6: Commit**

```bash
git add src/services/knowledge.ts src/server/index.ts src/server/__tests__/api.test.ts
git commit -m "feat: add segment list + reorder API"
```

---

### Task 4: Frontend — API client methods

**Files:**
- Modify: `web/src/api/client.ts`

- [ ] **Step 1: Add abort + segment API methods**

In `web/src/api/client.ts`, add to the `api` object (after `getExportUrl`):

```typescript
  async abort(projectId: string): Promise<void> {
    await fetch(`${BACKEND}/${projectId}/chat/abort`, { method: "DELETE" });
  },
  async getChapterSegments(projectId: string, chapterId: number): Promise<Array<{ id: number; seq: number; content: string }>> {
    const res = await fetch(`${BACKEND}/${projectId}/chapters/${chapterId}/segments`);
    return res.json();
  },
  async reorderSegments(projectId: string, chapterId: number, segmentIds: number[]): Promise<void> {
    await fetch(`${BACKEND}/${projectId}/chapters/${chapterId}/segments/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentIds }),
    });
  },
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/client.ts
git commit -m "feat: add abort + segment API client methods"
```

---

### Task 5: Frontend — Install vuedraggable

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install vuedraggable**

Run: `cd web && npm install vuedraggable@next`

- [ ] **Step 2: Verify install**

Run: `cd web && npx vue-tsc --noEmit`
Expected: Zero errors

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore: add vuedraggable dependency"
```

---

### Task 6: Frontend — Stop button + segment drag reorder UI

**Files:**
- Modify: `web/src/views/ProjectWorkbench.vue`

This is the largest task. Changes:

1. **Stop button**: Send button becomes red "停止" when `sending=true`. Store `AbortController` ref. On click, call `api.abort()` and handle cleanup.

2. **Segment display**: Chapter content area shows per-segment blocks with drag handles using `vuedraggable`.

- [ ] **Step 1: Add imports and refs**

In the `<script setup>` section, add after existing imports:

```typescript
import draggable from "vuedraggable";
```

Add new refs after existing refs:

```typescript
const chatCtrl = ref<AbortController | null>(null);
const chapterSegments = ref<Array<{ id: number; seq: number; content: string }>>([]);
```

- [ ] **Step 2: Modify selectChapter to load segments**

Replace the `selectChapter` function:

```typescript
async function selectChapter(id: number) {
  if (selectedChapterId.value === id) {
    selectedChapterId.value = null;
    chapterContent.value = "";
    chapterSegments.value = [];
    return;
  }
  selectedChapterId.value = id;
  chapterLoading.value = true;
  chapterContent.value = "";
  chapterSegments.value = [];
  try {
    chapterSegments.value = await api.getChapterSegments(props.id, id);
    chapterContent.value = chapterSegments.value.map(s => s.content).join("\n\n");
  } catch {
    chapterContent.value = "加载失败";
  } finally {
    chapterLoading.value = false;
  }
}
```

- [ ] **Step 3: Add reorder handler**

```typescript
async function handleSegmentReorder() {
  if (selectedChapterId.value == null) return;
  const ids = chapterSegments.value.map(s => s.id);
  try {
    await api.reorderSegments(props.id, selectedChapterId.value, ids);
    chapterSegments.value = chapterSegments.value.map((s, i) => ({ ...s, seq: i }));
  } catch {}
}
```

- [ ] **Step 4: Add stop function**

```typescript
async function stopChat() {
  if (chatCtrl.value) {
    chatCtrl.value.abort();
    chatCtrl.value = null;
  }
  await api.abort(props.id);
  sending.value = false;
  loadKnowledge();
  loadChapters();
}
```

- [ ] **Step 5: Modify send() to store AbortController**

In the `send()` function, change the `api.chat(...)` call to store the returned controller:

```typescript
  chatCtrl.value = api.chat(props.id, text, (event) => {
```

Add handling for `aborted` event inside the callback (after the `error` handler):

```typescript
    } else if (event.type === "aborted") {
      pendingMsg = undefined;
      sending.value = false;
      chatCtrl.value = null;
      messages.value.push({ role: "tool", content: "⏹ 已停止" });
      scrollToBottom();
      loadKnowledge();
      loadChapters();
```

- [ ] **Step 6: Update template — stop button**

In the template, replace the send button:

```html
            <button v-if="sending" class="stop-btn" @click="stopChat">停止</button>
            <button v-else class="send-btn" @click="send" :disabled="!input.trim()">发送</button>
```

- [ ] **Step 7: Update template — segment drag display**

Replace the `<pre v-else class="chapter-text">` block in the chapter-content-area:

```html
          <div v-else class="segment-list">
            <draggable
              v-model="chapterSegments"
              item-key="id"
              handle=".seg-handle"
              @end="handleSegmentReorder"
            >
              <template #item="{ element }">
                <div class="segment-item">
                  <span class="seg-handle" title="拖拽排序">⋮⋮</span>
                  <pre class="segment-text">{{ element.content }}</pre>
                </div>
              </template>
            </draggable>
          </div>
```

- [ ] **Step 8: Add CSS styles**

Add to `<style scoped>`:

```css
.stop-btn {
  padding: 0.35rem 1rem;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}
.stop-btn:hover { background: #dc2626; }
.segment-list {
  padding: 0.6rem;
}
.segment-item {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.4rem;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
  margin-bottom: 0.4rem;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.segment-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.seg-handle {
  cursor: grab;
  color: #d1d5db;
  font-size: 0.85rem;
  padding: 0.2rem 0.1rem;
  user-select: none;
  flex-shrink: 0;
  line-height: 1.6;
}
.seg-handle:active { cursor: grabbing; }
.segment-text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #1f2937;
  flex: 1;
}
```

- [ ] **Step 9: Typecheck frontend**

Run: `cd web && npx vue-tsc --noEmit`
Expected: Zero errors

- [ ] **Step 10: Run all backend tests**

Run: `npm run test && npm run typecheck`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add web/src/views/ProjectWorkbench.vue
git commit -m "feat: add stop button + segment drag reorder UI"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full backend test suite**

Run: `npm run test`
Expected: All tests pass (including new abort + segment tests)

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 3: Frontend typecheck**

Run: `cd web && npx vue-tsc --noEmit`
Expected: Zero errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
- Open browser, create project, send a message, click "停止" — should abort and save
- Create a chapter with multiple segments, open chapter, drag segments to reorder — should persist
