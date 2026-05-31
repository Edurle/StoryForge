# 全量 CRUD + 知识图谱增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 agent 对所有小说相关数据增删改查，知识图谱自动同步节点 + 支持查询，前端展示关系图。

**Architecture:** 三层改动：(1) 后端工具补全 list/query action + kg 查询 + 自动同步节点；(2) 后端 API 新增知识图谱查询路由；(3) 前端知识库增加"关系图"tab。

**Tech Stack:** SQLite, Express 5, Vue 3, SVG

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/agent/tools/write-tools.ts` | 补全 list/query action + 自动同步 kg_node + kg 查询 |
| `src/agent/tools/query-tools.ts` | project_status 扩展计数 |
| `src/services/knowledge.ts` | 新增 queryKgNodes, queryKgRelations, queryKgGraph |
| `src/server/index.ts` | 新增 /knowledge/graph 路由 |
| `web/src/api/client.ts` | 新增 getKnowledgeGraph |
| `web/src/views/ProjectWorkbench.vue` | 知识库增加"关系图"tab |
| `src/agent/tools/__tests__/tools.test.ts` | 新增测试 |
| `src/server/system-prompt.ts` | 更新提示词指导 agent 使用知识图谱 |

---

### Task 1: write-tools.ts — 补全缺失的 list/query action

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

需要给以下工具添加 list（和 query，如果适用）action：

- [ ] **Step 1: timeline 新增 list action**

在 timeline 工具中，`description` 改为包含 list，在 `query` 之前添加：

```typescript
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, time, description, characters, location FROM timeline_events ORDER BY time",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        const rows = res.data as { id: string; time: string; description: string; characters: string; location: string }[];
        return JSON.stringify(rows.map(row => ({
          ...row,
          characters: JSON.parse(row.characters) as string[],
        })));
      }
```

timeline parameters 中 action description 改为：`"操作：list | query | create | edit | delete"`

- [ ] **Step 2: item 新增 list + query action**

在 item 工具中，`description` 改为包含 list/query，在 `create` 之前添加：

```typescript
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT name, type, custom_attrs FROM items ORDER BY name",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        const rows = res.data as { name: string; type: string; custom_attrs: string }[];
        return JSON.stringify(rows.map(row => ({ name: row.name, type: row.type, attrs: JSON.parse(row.custom_attrs) as Record<string, unknown> })));
      }
      if (args.action === "query") {
        if (args.name == null) return JSON.stringify({ error: "name required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT name, type, custom_attrs FROM items WHERE name = ?",
          params: [args.name],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as { name: string; type: string; custom_attrs: string }[];
        if (!rows[0]) return JSON.stringify(null);
        return JSON.stringify({ name: rows[0].name, type: rows[0].type, attrs: JSON.parse(rows[0].custom_attrs) as Record<string, unknown> });
      }
```

item description 改为：`"物品管理。action: list（A级）列出物品，query（A级）查询单物品，create（B级）创建物品，edit（B级）编辑物品（attrs 合并），delete（C级）删除物品。"`
item parameters action description 改为：`"操作：list | query | create | edit | delete"`

- [ ] **Step 3: faction 新增 list + query action**

同理，faction 工具：

```typescript
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT name, description, custom_attrs FROM factions ORDER BY name",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        const rows = res.data as { name: string; description: string; custom_attrs: string }[];
        return JSON.stringify(rows.map(row => ({ name: row.name, description: row.description, attrs: JSON.parse(row.custom_attrs) as Record<string, unknown> })));
      }
      if (args.action === "query") {
        if (args.name == null) return JSON.stringify({ error: "name required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT name, description, custom_attrs FROM factions WHERE name = ?",
          params: [args.name],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as { name: string; description: string; custom_attrs: string }[];
        if (!rows[0]) return JSON.stringify(null);
        return JSON.stringify({ name: rows[0].name, description: rows[0].description, attrs: JSON.parse(rows[0].custom_attrs) as Record<string, unknown> });
      }
```

- [ ] **Step 4: location 新增 list + query action**

```typescript
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT name, description, custom_attrs FROM locations ORDER BY name",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        const rows = res.data as { name: string; description: string; custom_attrs: string }[];
        return JSON.stringify(rows.map(row => ({ name: row.name, description: row.description, attrs: JSON.parse(row.custom_attrs) as Record<string, unknown> })));
      }
      if (args.action === "query") {
        if (args.name == null) return JSON.stringify({ error: "name required for query" });
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT name, description, custom_attrs FROM locations WHERE name = ?",
          params: [args.name],
        });
        if (!res.ok || !res.data) return JSON.stringify(null);
        const rows = res.data as { name: string; description: string; custom_attrs: string }[];
        if (!rows[0]) return JSON.stringify(null);
        return JSON.stringify({ name: rows[0].name, description: rows[0].description, attrs: JSON.parse(rows[0].custom_attrs) as Record<string, unknown> });
      }
```

- [ ] **Step 5: setting 新增 list action**

在 setting 工具中，`query` 之前添加：

```typescript
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT key, value, description FROM global_constants ORDER BY key",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
```

setting description 改为：`"全局设定管理。action: list（A级）列出设定，query（A级）查询设定，write（B级）写入设定，upsert 策略。"`

- [ ] **Step 6: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 2: write-tools.ts — 自动同步 kg_node

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

在 character/item/faction/location 的 create action 中，INSERT 成功后自动 INSERT OR IGNORE 到 kg_nodes。

- [ ] **Step 1: character create 末尾加自动同步**

在 character create 的 INSERT 之后、return 之前，添加：

```typescript
        await db.request({
          id: 0, type: "run",
          sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'character', ?)",
          params: [args.name, args.name],
        }).catch(() => {});
```

> 注意：`INSERT OR IGNORE` 如果节点已存在会静默跳过。用 `.catch(() => {})` 防止 kg_nodes 表不存在时（理论上不可能，但防御性编程）阻塞。

实际上 DbWorker 的 request 不会 throw，它返回 `{ ok: false }`。所以直接 await 即可：

```typescript
        await db.request({
          id: 0, type: "run",
          sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'character', ?)",
          params: [args.name, args.name],
        });
```

- [ ] **Step 2: item create 末尾加自动同步**

```typescript
        await db.request({
          id: 0, type: "run",
          sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'item', ?)",
          params: [args.name, args.name],
        });
```

- [ ] **Step 3: faction create 末尾加自动同步**

```typescript
        await db.request({
          id: 0, type: "run",
          sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'faction', ?)",
          params: [args.name, args.name],
        });
```

- [ ] **Step 4: location create 末尾加自动同步**

```typescript
        await db.request({
          id: 0, type: "run",
          sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'location', ?)",
          params: [args.name, args.name],
        });
```

- [ ] **Step 5: 运行 typecheck + 测试**

Run: `npm run typecheck && npm run test`
Expected: zero errors, all tests pass

---

### Task 3: write-tools.ts — kg 工具增强查询 + 删除

**Files:**
- Modify: `src/agent/tools/write-tools.ts`

- [ ] **Step 1: 更新 kg 工具 description**

改为：
```
"知识图谱管理。action: list_nodes（A级）列出节点，list_relations（A级）列出关系，query_node（A级）查询单节点及关系，create_node（B级）创建节点，create_relation（B级）创建关系，delete_node（C级）删除节点及关系，delete_relation（C级）删除关系。"
```

- [ ] **Step 2: 更新 parameters properties**

添加 `node_type` 参数用于筛选：

```typescript
properties: {
  action: { type: "string", description: "操作：list_nodes | list_relations | query_node | create_node | create_relation | delete_node | delete_relation" },
  id: { type: "string", description: "节点ID" },
  type: { type: "string", description: "节点类型（list_nodes 筛选）或关系类型" },
  label: { type: "string", description: "标签" },
  attrs: { type: "object", description: "属性" },
  source_id: { type: "string", description: "源节点ID" },
  target_id: { type: "string", description: "目标节点ID" },
},
```

注意：将原来的 `type` 的 description 从 "节点/关系类型" 改为 "节点类型（list_nodes 筛选）或关系类型"。

- [ ] **Step 3: 在 create_node 之前添加 list_nodes, list_relations, query_node**

```typescript
      if (args.action === "list_nodes") {
        let sql = "SELECT id, type, label FROM kg_nodes";
        const params: unknown[] = [];
        if (args.type) { sql += " WHERE type = ?"; params.push(args.type); }
        sql += " ORDER BY type, label";
        const res = await db.request({ id: 0, type: "query", sql, params });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "list_relations") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT r.source_id, r.target_id, r.type, n1.label AS source_label, n2.label AS target_label FROM kg_relations r LEFT JOIN kg_nodes n1 ON r.source_id = n1.id LEFT JOIN kg_nodes n2 ON r.target_id = n2.id ORDER BY r.type",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "query_node") {
        if (args.id == null) return JSON.stringify({ error: "id required for query_node" });
        const nodeRes = await db.request({
          id: 0, type: "query",
          sql: "SELECT id, type, label, attrs FROM kg_nodes WHERE id = ?",
          params: [args.id],
        });
        if (!nodeRes.ok || !nodeRes.data) return JSON.stringify(null);
        const nodeRows = nodeRes.data as { id: string; type: string; label: string; attrs: string }[];
        if (!nodeRows[0]) return JSON.stringify(null);
        const node = { ...nodeRows[0], attrs: JSON.parse(nodeRows[0].attrs) as Record<string, unknown> };
        const outRes = await db.request({
          id: 0, type: "query",
          sql: "SELECT target_id AS related_id, type FROM kg_relations WHERE source_id = ?",
          params: [args.id],
        });
        const inRes = await db.request({
          id: 0, type: "query",
          sql: "SELECT source_id AS related_id, type FROM kg_relations WHERE target_id = ?",
          params: [args.id],
        });
        const outgoing = (outRes.ok && outRes.data) ? outRes.data as { related_id: string; type: string }[] : [];
        const incoming = (inRes.ok && inRes.data) ? inRes.data as { related_id: string; type: string }[] : [];
        return JSON.stringify({ ...node, outgoing, incoming });
      }
```

- [ ] **Step 4: 在 create_relation 之后添加 delete_node, delete_relation**

```typescript
      if (args.action === "delete_node") {
        if (args.id == null) return JSON.stringify({ error: "id required for delete_node" });
        const summary = `删除知识图谱节点 "${args.id}" 及其关系`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_kg_node", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM kg_relations WHERE source_id = ? OR target_id = ?", params: [args.id, args.id] });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM kg_nodes WHERE id = ?", params: [args.id] });
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete_relation") {
        if (args.source_id == null || args.target_id == null || args.type == null) return JSON.stringify({ error: "source_id, target_id, type required" });
        const summary = `删除关系 ${args.source_id} → ${args.target_id} (${args.type})`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_kg_relation", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM kg_relations WHERE source_id = ? AND target_id = ? AND type = ?", params: [args.source_id, args.target_id, args.type] });
        return JSON.stringify({ success: true });
      }
```

- [ ] **Step 5: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 4: query-tools.ts — 扩展 project_status

**Files:**
- Modify: `src/agent/tools/query-tools.ts`

- [ ] **Step 1: 扩展 project_status 计数**

将 `query-tools.ts` 的 fn 替换为：

```typescript
    fn: async () => {
      const tables = [
        "characters", "items", "factions", "locations",
        "timeline_events", "chapters", "segments", "outlines", "scripts",
        "formulas", "global_constants",
        "kg_nodes", "kg_relations",
      ];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const res = await db.request({ id: 0, type: "query", sql: `SELECT COUNT(*) as count FROM ${table}` });
        counts[table] = (res as { data?: Array<{ count: number }> }).data?.[0]?.count ?? 0;
      }
      return JSON.stringify(counts);
    },
```

description 也更新为：`"查询项目状态概览。返回所有数据表的行计数。新会话开始时建议先调用此工具了解项目规模。"`

- [ ] **Step 2: 运行 typecheck + 测试**

Run: `npm run typecheck && npm run test`
Expected: zero errors, all tests pass

---

### Task 5: knowledge.ts — 新增图谱查询函数 + 后端路由

**Files:**
- Modify: `src/services/knowledge.ts`
- Modify: `src/server/index.ts`
- Modify: `web/src/api/client.ts`

- [ ] **Step 1: knowledge.ts 新增 3 个函数**

在 `knowledge.ts` 末尾追加：

```typescript
export interface KgNodeRow {
  id: string;
  type: string;
  label: string;
}

export interface KgRelationRow {
  source_id: string;
  target_id: string;
  type: string;
  source_label: string;
  target_label: string;
}

export async function queryKgNodes(w: DbWorker): Promise<KgNodeRow[]> {
  const res = await w.request({
    id: 0, type: "query",
    sql: "SELECT id, type, label FROM kg_nodes ORDER BY type, label",
  });
  if (!res.ok || !res.data) return [];
  return res.data as KgNodeRow[];
}

export async function queryKgRelations(w: DbWorker): Promise<KgRelationRow[]> {
  const res = await w.request({
    id: 0, type: "query",
    sql: "SELECT r.source_id, r.target_id, r.type, n1.label AS source_label, n2.label AS target_label FROM kg_relations r LEFT JOIN kg_nodes n1 ON r.source_id = n1.id LEFT JOIN kg_nodes n2 ON r.target_id = n2.id ORDER BY r.type",
  });
  if (!res.ok || !res.data) return [];
  return res.data as KgRelationRow[];
}

export async function queryKgGraph(w: DbWorker): Promise<{ nodes: KgNodeRow[]; edges: KgRelationRow[] }> {
  const [nodes, edges] = await Promise.all([queryKgNodes(w), queryKgRelations(w)]);
  return { nodes, edges };
}
```

- [ ] **Step 2: index.ts 新增 /knowledge/graph 路由**

在 `index.ts` 的 import 中追加 `queryKgGraph`。

在知识库路由组之后添加：

```typescript
  app.get("/api/projects/:projectId/knowledge/graph", async (_req, res) => {
    const projectId = (_req.params as Record<string, string | undefined>).projectId!;
    const db = deps.getDbWorker(projectId);
    res.json(await queryKgGraph(db));
  });
```

- [ ] **Step 3: client.ts 新增 getKnowledgeGraph**

在 api 对象中追加：

```typescript
  async getKnowledgeGraph(projectId: string): Promise<{
    nodes: Array<{ id: string; type: string; label: string }>;
    edges: Array<{ source_id: string; target_id: string; type: string; source_label: string; target_label: string }>;
  }> {
    const res = await fetch(`${BACKEND}/${projectId}/knowledge/graph`);
    return res.json();
  },
```

- [ ] **Step 4: 运行 typecheck**

Run: `npm run typecheck`
Expected: zero errors

---

### Task 6: 前端 — 知识库增加"关系图"tab

**Files:**
- Modify: `web/src/views/ProjectWorkbench.vue`

- [ ] **Step 1: 添加 graphData 状态**

在 `kbData` ref 附近添加：

```typescript
const graphData = ref<{ nodes: Array<{ id: string; type: string; label: string }>; edges: Array<{ source_id: string; target_id: string; type: string; source_label: string; target_label: string }> }>({ nodes: [], edges: [] });
```

- [ ] **Step 2: kbTabs 添加"关系图"**

将 `kbTabs` 改为：

```typescript
const kbTabs = ["全部", "角色", "设定", "时间线", "公式", "关系图", "提示词"];
```

- [ ] **Step 3: loadKnowledge 中加载图谱数据**

在 `loadKnowledge` 函数的 `Promise.all` 中追加 `api.getKnowledgeGraph(props.id)`，并赋值给 `graphData.value`。

修改为：

```typescript
async function loadKnowledge() {
  try {
    const [characters, settings, formulas, timeline, items, factions, locations, graph] = await Promise.all([
      api.getKnowledge<typeof kbData.value.characters>(props.id, "characters"),
      api.getKnowledge<typeof kbData.value.settings>(props.id, "settings"),
      api.getKnowledge<typeof kbData.value.formulas>(props.id, "formulas"),
      api.getKnowledge<typeof kbData.value.timeline>(props.id, "timeline"),
      api.getKnowledge<typeof kbData.value.items>(props.id, "items"),
      api.getKnowledge<typeof kbData.value.factions>(props.id, "factions"),
      api.getKnowledge<typeof kbData.value.locations>(props.id, "locations"),
      api.getKnowledgeGraph(props.id),
    ]);
    kbData.value = { characters, settings, formulas, timeline, items, factions, locations };
    graphData.value = graph;
  } catch {}
}
```

- [ ] **Step 4: 在模板中添加关系图 tab 内容**

在"提示词"template 之前、"全部"中 `kb-empty` 之前添加：

```html
          <template v-if="activeKbTab === '关系图'">
            <div v-if="graphData.nodes.length > 0" class="kb-cards">
              <RelationGraph :nodes="graphNodes" :edges="graphEdges" :width="340" :height="300" />
            </div>
            <div v-else class="kb-empty">暂无关系数据</div>
          </template>
```

- [ ] **Step 5: 添加 computed 转换 graph 数据**

```typescript
const graphNodes = computed(() => graphData.value.nodes.map(n => ({ id: n.id, label: n.label, group: n.type })));
const graphEdges = computed(() => graphData.value.edges.map(e => ({ source: e.source_id, target: e.target_id, type: e.type })));
```

- [ ] **Step 6: 在 script 中导入 RelationGraph**

在 import 区域添加：

```typescript
import RelationGraph from "@/components/RelationGraph.vue";
```

- [ ] **Step 7: 运行 typecheck + 测试**

Run: `npm run typecheck && npm run test`
Expected: zero errors, all tests pass

---

### Task 7: 更新 system-prompt.ts

**Files:**
- Modify: `src/server/system-prompt.ts`

- [ ] **Step 1: 更新系统提示词**

将 `SYSTEM_PROMPT` 替换为：

```typescript
export const SYSTEM_PROMPT = `你是「书灵」，一个专业的 AI 网文创作助手。通过工具操作结构化创作数据，协助完成长篇小说的构思、大纲、脚本、正文和校验。

## 行为原则

1. 先查后写——修改数据前先查询当前状态，不要凭空假设。新会话开始时先调用 project_status 了解项目规模。
2. 工具驱动——所有数据通过工具访问和修改，不凭记忆回答设定细节。
3. 知识图谱——创建角色、物品、势力、地点时会自动在图谱中创建节点。使用 kg 工具的 create_relation 建立实体间关系（如师徒、所属、持有等），用 list_relations 和 query_node 查看关系网络。充分使用图谱记录和查询实体间的复杂关系。
4. 一致性优先——写入后用 validate_consistency 检查数值和时间线。
5. 知识沉淀——对角色、设定、工作流形成深入理解时，用 skill(action=save) 写入数据库。下次通过 skill(action=get) 加载，避免重复分析和 token 浪费。
6. 确认级别——A 级自动执行，B 级通知用户，C 级需用户明确同意。被取消的操作不重试。

## 回复风格

- 中文回复
- 具体可执行，不空泛鼓励
- 设定矛盾要明确指出
- 数值用 calculate 验证
`;
```

---

### Task 8: 添加测试

**Files:**
- Modify: `src/agent/tools/__tests__/tools.test.ts`

- [ ] **Step 1: 添加 list/query 补全测试**

在文件末尾（最后的 `});` 之前）添加：

```typescript
describe("List query completion", () => {
  it("timeline list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("timeline", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("item list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("item", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("item create and query", async () => {
    await reg.dispatch("item", { action: "create", name: "测试剑", type: "武器" });
    const detail = JSON.parse(await reg.dispatch("item", { action: "query", name: "测试剑" }));
    expect(detail.name).toBe("测试剑");
    expect(detail.type).toBe("武器");
  });

  it("faction list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("faction", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("faction create and query", async () => {
    await reg.dispatch("faction", { action: "create", name: "测试宗" });
    const detail = JSON.parse(await reg.dispatch("faction", { action: "query", name: "测试宗" }));
    expect(detail.name).toBe("测试宗");
  });

  it("location list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("location", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("setting list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("setting", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Knowledge graph auto-sync and query", () => {
  it("character create auto-creates kg_node", async () => {
    await reg.dispatch("character", { action: "create", name: "图谱角色" });
    const nodes = JSON.parse(await reg.dispatch("kg", { action: "list_nodes" }));
    const found = nodes.find((n: { id: string }) => n.id === "图谱角色");
    expect(found).toBeTruthy();
    expect(found.type).toBe("character");
  });

  it("kg list_nodes returns array", async () => {
    const result = JSON.parse(await reg.dispatch("kg", { action: "list_nodes" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("kg list_relations returns array", async () => {
    const result = JSON.parse(await reg.dispatch("kg", { action: "list_relations" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("kg query_node returns detail with relations", async () => {
    const nodes = JSON.parse(await reg.dispatch("kg", { action: "list_nodes" }));
    if (nodes.length > 0) {
      const result = JSON.parse(await reg.dispatch("kg", { action: "query_node", id: nodes[0].id }));
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("outgoing");
      expect(result).toHaveProperty("incoming");
    }
  });

  it("project_status returns all tables", async () => {
    const result = JSON.parse(await reg.dispatch("project_status", {}));
    expect(result).toHaveProperty("characters");
    expect(result).toHaveProperty("kg_nodes");
    expect(result).toHaveProperty("kg_relations");
    expect(result).toHaveProperty("chapters");
    expect(result).toHaveProperty("segments");
  });
});
```

- [ ] **Step 2: 运行全部测试**

Run: `npm run test`
Expected: all tests pass

---

## Summary

| Task | 改动 | 文件 |
|------|------|------|
| **1** | 补全 list/query: timeline, item, faction, location, setting | write-tools.ts |
| **2** | 自动同步 kg_node: character/item/faction/location create | write-tools.ts |
| **3** | kg 增强: list_nodes, list_relations, query_node, delete_node, delete_relation | write-tools.ts |
| **4** | project_status 扩展 13 表计数 | query-tools.ts |
| **5** | 后端: knowledge.ts 图谱查询 + /knowledge/graph 路由 + client.ts | knowledge.ts, index.ts, client.ts |
| **6** | 前端: 知识库"关系图"tab + RelationGraph 组件接入 | ProjectWorkbench.vue |
| **7** | 系统提示词: 指导 agent 充分使用知识图谱 | system-prompt.ts |
| **8** | 测试: list/query + kg 自动同步 + project_status | tools.test.ts |
