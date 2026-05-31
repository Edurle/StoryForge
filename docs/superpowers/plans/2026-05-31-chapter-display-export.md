# 章节展示与导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右侧面板改为只读章节浏览器（目录树 + 内容展示 + TXT 导出），移除所有"新增"/编辑按钮。

**Architecture:** 后端新增 2 个 API：`GET /chapters`（返回章节+段落数）和 `GET /chapters/:id/content`（返回拼接后全文）。前端右侧面板替换为章节树（按卷分组）→ 点击展示内容 → 导出 TXT。知识库左侧的"+ 新增"按钮也移除。

**Tech Stack:** Express 5 后端路由，Vue 3 前端组件，knowledge.ts 新增查询函数

---

### Task 1: 后端 knowledge.ts 新增章节查询函数

**Files:**
- Modify: `src/services/knowledge.ts` (末尾追加)

- [ ] **Step 1: 添加 `queryChapters` 和 `queryChapterContent` 函数**

在 `src/services/knowledge.ts` 末尾追加：

```typescript
export interface ChapterSummary {
  id: number;
  volume: number;
  title: string;
  status: string;
  segmentCount: number;
}

export async function queryChapters(w: DbWorker): Promise<ChapterSummary[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: `SELECT c.id, c.volume, c.title, c.status, COUNT(s.id) AS segment_count
      FROM chapters c LEFT JOIN segments s ON s.chapter_id = c.id
      GROUP BY c.id ORDER BY c.volume, c.id`,
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { id: number; volume: number; title: string; status: string; segment_count: number }[];
  return rows.map(row => ({
    id: row.id,
    volume: row.volume,
    title: row.title,
    status: row.status,
    segmentCount: row.segment_count,
  }));
}

export async function queryChapterContent(w: DbWorker, chapterId: number): Promise<string> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT content FROM segments WHERE chapter_id = ? ORDER BY seq, id",
    params: [chapterId],
  });
  if (!res.ok || !res.data) return "";
  const rows = res.data as { content: string }[];
  return rows.map(row => row.content).join("\n\n");
}
```

- [ ] **Step 2: 运行 typecheck 验证**

Run: `npx tsc --noEmit`
Expected: zero errors

---

### Task 2: 后端新增章节 API 路由

**Files:**
- Modify: `src/server/index.ts` (import + 2 个路由)

- [ ] **Step 1: 在 import 区域添加 knowledge.ts 的新函数**

在 `src/server/index.ts` 第 15 行的 import 追加 `queryChapters, queryChapterContent`：

```typescript
import { queryCharacters, queryAllSettings, queryFormulas, queryAllTimeline, queryItems, queryFactions, queryLocations, queryChapters, queryChapterContent } from "../services/knowledge.js";
```

- [ ] **Step 2: 添加 2 个路由（在 knowledge 路由之前，tree/content 路由附近）**

将原有的 `tree` 和 `content` 路由替换为：

```typescript
  app.get("/api/projects/:projectId/chapters", async (_req, res) => {
    const projectId = (_req.params as Record<string, string | undefined>).projectId!;
    const db = deps.getDbWorker(projectId);
    res.json(await queryChapters(db));
  });

  app.get("/api/projects/:projectId/chapters/:chapterId/content", async (req, res) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const chapterId = parseInt((req.params as Record<string, string | undefined>).chapterId!, 10);
    if (isNaN(chapterId)) { res.status(400).json({ error: "invalid chapterId" }); return; }
    const db = deps.getDbWorker(projectId);
    const content = await queryChapterContent(db, chapterId);
    res.json({ chapterId, content });
  });

  app.get("/api/projects/:projectId/export", async (_req, res) => {
    const projectId = (_req.params as Record<string, string | undefined>).projectId!;
    const db = deps.getDbWorker(projectId);
    const chapters = await queryChapters(db);
    const parts: string[] = [];
    for (const ch of chapters) {
      const content = await queryChapterContent(db, ch.id);
      parts.push(`${ch.title}\n\n${content}`);
    }
    const text = parts.join("\n\n---\n\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=export.txt");
    res.send(text);
  });
```

删除原有的 `tree` 和 `content` 路由（第 236-242 行）。

- [ ] **Step 3: 运行 typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors

---

### Task 3: 前端 API client 新增章节接口

**Files:**
- Modify: `web/src/api/client.ts`

- [ ] **Step 1: 在 `api` 对象中追加 3 个方法**

在 `getKnowledge` 方法之后追加：

```typescript
  async getChapters(projectId: string): Promise<Array<{
    id: number; volume: number; title: string; status: string; segmentCount: number;
  }>> {
    const res = await fetch(`${BACKEND}/${projectId}/chapters`);
    return res.json();
  },
  async getChapterContent(projectId: string, chapterId: number): Promise<{ chapterId: number; content: string }> {
    const res = await fetch(`${BACKEND}/${projectId}/chapters/${chapterId}/content`);
    return res.json();
  },
  getExportUrl(projectId: string): string {
    return `${BACKEND}/${projectId}/export`;
  },
```

- [ ] **Step 2: 运行前端 typecheck**

Run: `npx vue-tsc --noEmit` (在 web/ 目录下)
Expected: zero errors

---

### Task 4: 前端右侧面板改为章节浏览器

**Files:**
- Modify: `web/src/views/ProjectWorkbench.vue`

这是最大的改动。右侧面板从静态编辑器改为章节浏览器。

- [ ] **Step 1: 添加响应式状态变量**

在 `const activeKbTab` 附近添加：

```typescript
const chapters = ref<Array<{ id: number; volume: number; title: string; status: string; segmentCount: number }>>([]);
const selectedChapterId = ref<number | null>(null);
const chapterContent = ref("");
const chapterLoading = ref(false);
```

- [ ] **Step 2: 添加 `loadChapters` 和 `selectChapter` 函数**

```typescript
async function loadChapters() {
  try {
    chapters.value = await api.getChapters(props.id);
  } catch {}
}

async function selectChapter(id: number) {
  if (selectedChapterId.value === id) return;
  selectedChapterId.value = id;
  chapterLoading.value = true;
  chapterContent.value = "";
  try {
    const res = await api.getChapterContent(props.id, id);
    chapterContent.value = res.content;
  } catch {
    chapterContent.value = "加载失败";
  } finally {
    chapterLoading.value = false;
  }
}
```

- [ ] **Step 3: 在 `onMounted` 中调用 `loadChapters()`，在 `done` 事件处理中刷新**

在 `onMounted` 回调末尾加：
```typescript
loadChapters();
```

在 `send()` 函数的 `done` 事件处理中加：
```typescript
loadChapters();
```

- [ ] **Step 4: 替换右侧面板模板**

将 `<aside v-show="!layout.rightCollapsed" class="right-panel">` 整个替换为：

```html
      <aside v-show="!layout.rightCollapsed" class="right-panel">
        <div class="panel-header">
          章节
          <a v-if="chapters.length > 0" :href="api.getExportUrl(props.id)" download="export.txt" class="panel-action-btn">导出 TXT</a>
        </div>
        <div class="chapter-tree" v-if="chapters.length > 0">
          <div v-for="vol in volumes" :key="vol" class="chapter-volume">
            <div class="volume-header">第{{ vol }}卷</div>
            <div v-for="ch in chaptersByVolume(vol)" :key="ch.id"
              :class="['chapter-item', { active: selectedChapterId === ch.id }]"
              @click="selectChapter(ch.id)">
              <span class="chapter-title">{{ ch.title }}</span>
              <span class="chapter-segments">{{ ch.segmentCount }}段</span>
            </div>
          </div>
        </div>
        <div v-else class="editor-placeholder">暂无章节，通过对话让 AI 创建。</div>
        <div v-if="selectedChapterId != null" class="chapter-content-area">
          <div v-if="chapterLoading" class="editor-placeholder">加载中...</div>
          <pre v-else class="chapter-text">{{ chapterContent }}</pre>
        </div>
      </aside>
```

- [ ] **Step 5: 添加 computed 辅助属性**

```typescript
const volumes = computed(() => [...new Set(chapters.value.map(c => c.volume))].sort());

function chaptersByVolume(vol: number) {
  return chapters.value.filter(c => c.volume === vol);
}
```

- [ ] **Step 6: 替换右侧面板 CSS**

删除 `.editor-toolbar`、`.editor-content`、`.editor-placeholder`、`.panel-action-btn` 相关样式（保留 `.panel-action-btn` 因为知识库也用）。追加：

```css
.chapter-tree {
  border-bottom: 1px solid #f3f4f6;
  max-height: 40%;
  overflow-y: auto;
  flex-shrink: 0;
}
.volume-header {
  padding: 0.4rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #9ca3af;
  background: #fafbfc;
}
.chapter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.8rem 0.4rem 1.4rem;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s;
}
.chapter-item:hover { background: #f3f4f6; }
.chapter-item.active { background: #eff6ff; color: #1d4ed8; }
.chapter-title { color: #374151; }
.chapter-item.active .chapter-title { color: #1d4ed8; font-weight: 500; }
.chapter-segments { font-size: 0.68rem; color: #b0b8c4; }
.chapter-content-area {
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid #f3f4f6;
}
.chapter-text {
  padding: 0.8rem;
  font-size: 0.88rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  color: #1f2937;
}
.editor-placeholder {
  text-align: center;
  color: #9ca3af;
  padding: 1.5rem 0;
  font-size: 0.82rem;
}
```

- [ ] **Step 7: 移除知识库左侧的"+ 新增"按钮**

删除 `ProjectWorkbench.vue` 第 33 行：
```html
<button class="panel-action-btn">+ 新增</button>
```

- [ ] **Step 8: 运行 typecheck + 测试**

Run: `npm run typecheck && npm run test`
Expected: typecheck zero errors, all tests pass

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/services/knowledge.ts` | 追加 2 函数 | `queryChapters` + `queryChapterContent` |
| `src/server/index.ts` | 追加 3 路由, 删 2 占位路由 | `/chapters`, `/chapters/:id/content`, `/export` |
| `web/src/api/client.ts` | 追加 3 方法 | `getChapters`, `getChapterContent`, `getExportUrl` |
| `web/src/views/ProjectWorkbench.vue` | 大改 | 右侧→章节浏览器, 移除新增按钮 |
