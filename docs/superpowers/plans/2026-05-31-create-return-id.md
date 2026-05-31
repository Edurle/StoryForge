# 工具增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 所有 create action 返回新建记录 ID；(2) chapter/segment/outline/script 新增 list 和 query action；(3) segment create 自动 seq + 新增 insert action。

**Architecture:** 单文件改动 `src/agent/tools/write-tools.ts` + 测试文件。添加 `getLastInsertId` helper，修改 create 返回值，新增 list/query/insert action。

**Tech Stack:** SQLite `last_insert_rowid()`, DbWorker request interface

---

### Task 1: 添加 helper + 修改所有 create 返回 ID

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

- [ ] **Step 1: 在 `mergeAttrs` 函数之后（第 33 行后）添加 helper**

```typescript
async function getLastInsertId(db: DbWorker): Promise<number> {
  const res = await db.request({ id: 0, type: "query", sql: "SELECT last_insert_rowid() AS id" });
  const rows = res.data as { id: number }[];
  return rows[0]!.id;
}
```

- [ ] **Step 2: 修改自增 ID 表的 create action（4 处）**

每个 INSERT 后加 `const newId = await getLastInsertId(db);` 并返回 `{ success: true, id: newId }`：

1. **chapter create**（~第 126-132 行）
2. **segment create**（~第 186-192 行）— 注意这个后面会重构，先改返回值
3. **outline create**（~第 311-317 行）
4. **script create**（~第 615-621 行）

- [ ] **Step 3: 修改外部标识符表的 create action（8 处）**

5. **character create**（~第 70-76 行）：返回 `{ success: true, name: args.name }`
6. **timeline create**（~第 253-259 行）：返回 `{ success: true, id: args.id }`
7. **formula create**（~第 412-418 行）：返回 `{ success: true, name: args.name }`
8. **item create**（~第 457-463 行）：返回 `{ success: true, name: args.name }`
9. **faction create**（~第 509-515 行）：返回 `{ success: true, name: args.name }`
10. **location create**（~第 561-567 行）：返回 `{ success: true, name: args.name }`
11. **kg create_node**（~第 664-670 行）：返回 `{ success: true, id: args.id }`
12. **setting write**（~第 375-381 行）：返回 `{ success: true, key: args.key }`

- [ ] **Step 4: 运行 typecheck + 测试**

Run: `npm run typecheck && npm run test`
Expected: zero type errors, all tests pass

---

### Task 2: chapter 新增 list + query action

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

- [ ] **Step 1: 更新 chapter description**

改为：`"章节管理。action: list（A级）列出章节，query（A级）查询单章节详情，create（B级）创建章节，edit（B级）编辑章节，delete（C级）删除章节及段落。"`

- [ ] **Step 2: 在 parameters properties 中添加 volume 筛选参数**

```typescript
volume: { type: "number", description: "卷号（list 筛选）" },
```

- [ ] **Step 3: 在 chapter fn 的 `if (args.action === "create")` 之前添加 list 和 query**

```typescript
      if (args.action === "list") {
        let sql = "SELECT id, volume, title, status FROM chapters";
        const params: unknown[] = [];
        if (args.volume != null) { sql += " WHERE volume = ?"; params.push(args.volume); }
        sql += " ORDER BY volume, id";
        const res = await db.request({ id: 0, type: "query", sql, params });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "query") {
        if (args.id == null) return JSON.stringify({ error: "id required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, volume, title, status FROM chapters WHERE id = ?",
          params: [args.id],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as { id: number; volume: number; title: string; status: string }[];
        if (!rows[0]) return JSON.stringify(null);
        const segRes = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, seq, type, content FROM segments WHERE chapter_id = ? ORDER BY seq, id",
          params: [args.id],
        });
        const segments = (segRes.ok && segRes.data) ? segRes.data as { id: number; seq: number; type: string; content: string }[] : [];
        return JSON.stringify({ ...rows[0], segments });
      }
```

- [ ] **Step 4: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 3: segment 重构 — create 自动 seq + 新增 insert + list + query

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

这是最大的改动。需要：
1. 更新 description 和 parameters
2. 新增 list、query、insert action
3. 重构 create 去掉 position，自动算 seq

- [ ] **Step 1: 更新 segment description**

改为：`"段落管理。action: list（A级）按章节列出段落，query（A级）查询单段落详情，create（B级）追加段落到末尾，insert（B级）插入段落到指定位置，edit（B级）编辑段落，delete（C级）删除段落。"`

- [ ] **Step 2: 更新 parameters**

删除 `position` 参数，添加 `after_id` 参数。最终 properties：

```typescript
properties: {
  action: { type: "string", description: "操作：list | query | create | insert | edit | delete" },
  id: { type: "number", description: "段落ID（query/edit/delete用）" },
  chapter_id: { type: "number", description: "章节ID（list/create用）" },
  after_id: { type: "number", description: "插入到指定段落之后（insert用）" },
  content: { type: "string", description: "内容" },
  type: { type: "string", description: "类型" },
  mood: { type: "string", description: "情绪" },
  location: { type: "string", description: "地点" },
},
```

- [ ] **Step 3: 在 segment fn 的 `if (args.action === "create")` 之前添加 list、query、insert**

```typescript
      if (args.action === "list") {
        if (args.chapter_id == null) return JSON.stringify({ error: "chapter_id required for list" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, seq, type, mood, location FROM segments WHERE chapter_id = ? ORDER BY seq, id",
          params: [args.chapter_id],
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "query") {
        if (args.id == null) return JSON.stringify({ error: "id required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, chapter_id, seq, type, content, characters, mood, location FROM segments WHERE id = ?",
          params: [args.id],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as { id: number; chapter_id: number; seq: number; type: string; content: string; characters: string; mood: string; location: string }[];
        if (!rows[0]) return JSON.stringify(null);
        const row = rows[0];
        return JSON.stringify({ ...row, characters: JSON.parse(row.characters) as string[] });
      }
```

- [ ] **Step 4: 重构 segment create — 自动 seq**

将现有的 `args.action === "create"` 块改为：

```typescript
      if (args.action === "create") {
        if (args.chapter_id == null || args.content == null) return JSON.stringify({ error: "chapter_id and content required" });
        const summary = `写入章节 ${args.chapter_id} 文本`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const maxRes = await db.request({
          id: 0, type: "query",
          sql: "SELECT COALESCE(MAX(seq), -1) AS max_seq FROM segments WHERE chapter_id = ?",
          params: [args.chapter_id],
        });
        const maxRows = (maxRes.ok && maxRes.data) ? maxRes.data as { max_seq: number }[] : [{ max_seq: -1 }];
        const nextSeq = maxRows[0]!.max_seq + 1;
        await db.request({
          id: 0, type: "run",
          sql: "INSERT INTO segments (chapter_id, seq, content) VALUES (?, ?, ?)",
          params: [args.chapter_id, nextSeq, args.content],
        });
        const newId = await getLastInsertId(db);
        return JSON.stringify({ success: true, id: newId, seq: nextSeq });
      }
```

- [ ] **Step 5: 在 create 块之后、edit 块之前添加 insert action**

```typescript
      if (args.action === "insert") {
        if (args.chapter_id == null || args.content == null || args.after_id == null) return JSON.stringify({ error: "chapter_id, content, after_id required" });
        const summary = `插入段落到章节 ${args.chapter_id}（${args.after_id}之后）`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const afterRes = await db.request({
          id: 0, type: "query",
          sql: "SELECT seq FROM segments WHERE id = ? AND chapter_id = ?",
          params: [args.after_id, args.chapter_id],
        });
        if (!afterRes.ok || !afterRes.data) return JSON.stringify({ error: "after_id not found" });
        const afterRows = afterRes.data as { seq: number }[];
        if (!afterRows[0]) return JSON.stringify({ error: "after_id not found" });
        const afterSeq = afterRows[0].seq;
        await db.request({
          id: 0, type: "run",
          sql: "UPDATE segments SET seq = seq + 1 WHERE chapter_id = ? AND seq > ?",
          params: [args.chapter_id, afterSeq],
        });
        await db.request({
          id: 0, type: "run",
          sql: "INSERT INTO segments (chapter_id, seq, content) VALUES (?, ?, ?)",
          params: [args.chapter_id, afterSeq + 1, args.content],
        });
        const newId = await getLastInsertId(db);
        return JSON.stringify({ success: true, id: newId, seq: afterSeq + 1 });
      }
```

- [ ] **Step 6: 更新 fn 的类型签名**

将 fn 的 args 类型中 `position` 改为 `after_id`：

```typescript
fn: async (args: { action: string; id?: number; chapter_id?: number; content?: string; after_id?: number; type?: string; mood?: string; location?: string }) => {
```

- [ ] **Step 7: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 4: outline 新增 list + query action

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

- [ ] **Step 1: 更新 outline description**

改为：`"大纲管理。action: list（A级）列出大纲节点，query（A级）查询单节点详情，create（B级）创建节点，edit（B级）编辑节点，delete（C级）删除节点。"`

- [ ] **Step 2: 在 outline fn 的 create 之前添加 list 和 query**

```typescript
      if (args.action === "list") {
        let sql = "SELECT id, parent_id, volume, seq, title, status FROM outlines";
        const params: unknown[] = [];
        if (args.volume != null) { sql += " WHERE volume = ?"; params.push(args.volume); }
        sql += " ORDER BY volume, seq, id";
        const res = await db.request({ id: 0, type: "query", sql, params });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "query") {
        if (args.id == null) return JSON.stringify({ error: "id required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, parent_id, volume, seq, title, summary, foreshadow, status FROM outlines WHERE id = ?",
          params: [args.id],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as Record<string, unknown>[];
        if (!rows[0]) return JSON.stringify(null);
        return JSON.stringify(rows[0]);
      }
```

- [ ] **Step 3: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 5: script 新增 list + query action

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

- [ ] **Step 1: 更新 script description**

改为：`"脚本管理。action: list（A级）列出脚本，query（A级）查询单脚本详情，create（B级）创建脚本，edit（B级）编辑脚本。"`

- [ ] **Step 2: 在 script fn 的 create 之前添加 list 和 query**

```typescript
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, scene_id, scene_type, title FROM scripts ORDER BY id",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "query") {
        if (args.scene_id == null) return JSON.stringify({ error: "scene_id required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, scene_id, scene_type, title, content, constraints FROM scripts WHERE scene_id = ?",
          params: [args.scene_id],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as Record<string, unknown>[];
        if (!rows[0]) return JSON.stringify(null);
        return JSON.stringify(rows[0]);
      }
```

- [ ] **Step 3: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 6: 添加测试

**Files:**
- Modify: `src/agent/tools/__tests__/tools.test.ts`

- [ ] **Step 1: 添加 create 返回 ID 测试**

```typescript
describe("Create returns ID", () => {
  it("chapter create returns id", async () => {
    const result = await reg.dispatch("chapter", { action: "create", title: "ID测试章", volume: 1 });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(typeof parsed.id).toBe("number");
  });

  it("segment create returns id and auto seq", async () => {
    const chRes = await reg.dispatch("chapter", { action: "create", title: "Seq测试章" });
    const ch = JSON.parse(chRes);
    const s1 = await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "第一段" });
    const p1 = JSON.parse(s1);
    expect(p1.success).toBe(true);
    expect(typeof p1.id).toBe("number");
    expect(p1.seq).toBe(0);
    const s2 = await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "第二段" });
    const p2 = JSON.parse(s2);
    expect(p2.seq).toBe(1);
  });

  it("character create returns name", async () => {
    const result = await reg.dispatch("character", { action: "create", name: "ID测试角色" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe("ID测试角色");
  });
});
```

- [ ] **Step 2: 添加 list/query/insert 测试**

```typescript
describe("List, Query and Insert actions", () => {
  it("chapter list returns array with id", async () => {
    const result = await reg.dispatch("chapter", { action: "list" });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("title");
  });

  it("chapter query returns detail with segments", async () => {
    const list = JSON.parse(await reg.dispatch("chapter", { action: "list" }));
    const first = list[0];
    const result = JSON.parse(await reg.dispatch("chapter", { action: "query", id: first.id }));
    expect(result.id).toBe(first.id);
    expect(Array.isArray(result.segments)).toBe(true);
  });

  it("segment list requires chapter_id", async () => {
    const result = JSON.parse(await reg.dispatch("segment", { action: "list" }));
    expect(result.error).toBeTruthy();
  });

  it("segment list by chapter_id returns ordered", async () => {
    const ch = JSON.parse(await reg.dispatch("chapter", { action: "create", title: "有序章" }));
    await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "段A" });
    await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "段B" });
    const result = JSON.parse(await reg.dispatch("segment", { action: "list", chapter_id: ch.id }));
    expect(result.length).toBe(2);
    expect(result[0].seq).toBeLessThan(result[1].seq);
  });

  it("segment insert shifts subsequent seq", async () => {
    const ch = JSON.parse(await reg.dispatch("chapter", { action: "create", title: "插入章" }));
    const s1 = JSON.parse(await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "原段1" }));
    const s2 = JSON.parse(await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "原段2" }));
    const inserted = JSON.parse(await reg.dispatch("segment", { action: "insert", chapter_id: ch.id, after_id: s1.id, content: "插入段" }));
    expect(inserted.success).toBe(true);
    const list = JSON.parse(await reg.dispatch("segment", { action: "list", chapter_id: ch.id }));
    expect(list.length).toBe(3);
    const byId = (id: number) => list.find((s: { id: number }) => s.id === id);
    expect(byId(s1.id).seq).toBe(0);
    expect(byId(inserted.id).seq).toBe(1);
    expect(byId(s2.id).seq).toBe(2);
  });

  it("segment query returns full detail", async () => {
    const ch = JSON.parse(await reg.dispatch("chapter", { action: "create", title: "详情章" }));
    const seg = JSON.parse(await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "详细内容" }));
    const result = JSON.parse(await reg.dispatch("segment", { action: "query", id: seg.id }));
    expect(result.content).toBe("详细内容");
    expect(result).toHaveProperty("characters");
  });

  it("outline list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("outline", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("script list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("script", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });
});
```

- [ ] **Step 3: 运行全部测试**

Run: `npm run test`
Expected: all tests pass

---

## Summary

| 改动 | 文件 |
|------|------|
| `getLastInsertId` helper | write-tools.ts |
| 12 处 create 返回标识符 | write-tools.ts |
| chapter list + query | write-tools.ts |
| segment list + query + insert + create 自动 seq | write-tools.ts |
| outline list + query | write-tools.ts |
| script list + query | write-tools.ts |
| 测试 | tools.test.ts |
