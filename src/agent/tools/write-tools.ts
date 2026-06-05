import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { PauseGate } from "../../../lib/reasonix-core/core/pause-gate.js";
import type { DbWorker } from "../../db/worker.js";
import { createSnapshot, rollbackToSnapshot } from "../../services/state.js";
import {
  queryCharacter,
  queryCharacters,
  querySetting,
  queryTimeline,
  queryRelations,
  queryFormulas,
} from "../../services/knowledge.js";

async function mergeAttrs(db: DbWorker, table: string, name: string, newAttrs: Record<string, unknown>): Promise<void> {
  const curRes = await db.request({
    id: 0,
    type: "query",
    sql: `SELECT custom_attrs FROM ${table} WHERE name = ?`,
    params: [name],
  });
  let existing: Record<string, unknown> = {};
  if (curRes.ok && curRes.data) {
    const rows = curRes.data as { custom_attrs: string }[];
    if (rows[0]) existing = JSON.parse(rows[0].custom_attrs) as Record<string, unknown>;
  }
  const merged = { ...existing, ...newAttrs };
  await db.request({
    id: 0,
    type: "run",
    sql: `UPDATE ${table} SET custom_attrs = ?, updated_at = datetime('now') WHERE name = ?`,
    params: [JSON.stringify(merged), name],
  });
}

async function getLastInsertId(db: DbWorker): Promise<number> {
  const res = await db.request({ id: 0, type: "query", sql: "SELECT last_insert_rowid() AS id" });
  const rows = res.data as { id: number }[];
  return rows[0]!.id;
}

export function registerWriteTools(reg: ToolRegistry, db: DbWorker, gate: PauseGate): void {
  reg.register({
    name: "character",
    description: "角色管理（统一工具）。action: query（A级）查询单个角色，list（A级）列出角色，relations（A级）查询关系，create（B级）创建角色，edit（B级）编辑角色（attrs 合并策略），delete（C级）删除角色。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：query | list | relations | create | edit | delete" },
        name: { type: "string", description: "角色名" },
        stage: { type: "string", description: "修炼阶段（list筛选/create/edit用）" },
        attrs: { type: "object", description: "自定义属性" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; name?: string; stage?: string; attrs?: Record<string, unknown> }) => {
      if (args.action === "query") {
        if (!args.name) return JSON.stringify({ error: "name required for query" });
        const result = await queryCharacter(db, args.name);
        return JSON.stringify(result);
      }
      if (args.action === "list") {
        const filter = args.stage ? { stage: args.stage } : undefined;
        const result = await queryCharacters(db, filter);
        return JSON.stringify(result);
      }
      if (args.action === "relations") {
        if (!args.name) return JSON.stringify({ error: "name required for relations" });
        const result = await queryRelations(db, args.name);
        return JSON.stringify(result);
      }
      if (args.action === "create") {
        if (!args.name) return JSON.stringify({ error: "name required for create" });
        const summary = `创建角色 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO characters (name, stage, custom_attrs) VALUES (?, ?, ?)",
          params: [args.name, args.stage ?? "", JSON.stringify(args.attrs ?? {})],
        });
        await db.request({ id: 0, type: "run", sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'character', ?)", params: [args.name, args.name] });
        return JSON.stringify({ success: true, name: args.name });
      }
      if (args.action === "edit") {
        if (!args.name) return JSON.stringify({ error: "name required for edit" });
        const summary = `编辑角色 "${args.name}"${args.stage ? ` → ${args.stage}` : ""}`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        if (args.attrs) await mergeAttrs(db, "characters", args.name, args.attrs);
        if (args.stage) {
          await db.request({
            id: 0,
            type: "run",
            sql: "UPDATE characters SET stage = ?, updated_at = datetime('now') WHERE name = ?",
            params: [args.stage, args.name],
          });
        }
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "chapter",
    description: "章节管理。action: list（A级）列出章节，query（A级）查询单章节详情，create（B级）创建章节，edit（B级）编辑章节，delete（C级）删除章节及段落。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit | delete" },
        id: { type: "number", description: "章节ID" },
        title: { type: "string", description: "标题" },
        volume: { type: "number", description: "卷号（list 筛选）" },
        status: { type: "string", description: "状态" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; id?: number; title?: string; volume?: number; status?: string }) => {
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
      if (args.action === "create") {
        const title = args.title ?? "";
        const summary = `创建章节 "${title}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO chapters (volume, title, status) VALUES (?, ?, ?)",
          params: [args.volume ?? 1, title, args.status ?? "draft"],
        });
        const newId = await getLastInsertId(db);
        return JSON.stringify({ success: true, id: newId });
      }
      if (args.action === "edit") {
        if (args.id == null) return JSON.stringify({ error: "id required for edit" });
        const summary = `编辑章节 ${args.id}`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.title != null) { sets.push("title = ?"); params.push(args.title); }
        if (args.status != null) { sets.push("status = ?"); params.push(args.status); }
        if (args.volume != null) { sets.push("volume = ?"); params.push(args.volume); }
        if (sets.length === 0) return JSON.stringify({ success: true });
        sets.push("updated_at = datetime('now')");
        params.push(args.id);
        await db.request({ id: 0, type: "run", sql: `UPDATE chapters SET ${sets.join(", ")} WHERE id = ?`, params });
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        if (args.id == null) return JSON.stringify({ error: "id required for delete" });
        const summary = `删除章节 ${args.id}`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_chapter", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM segments WHERE chapter_id = ?", params: [args.id] });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM chapters WHERE id = ?", params: [args.id] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "segment",
    description: "段落管理。action: list（A级）按章节列出段落，query（A级）查询单段落详情，create（B级）追加段落到末尾，insert（B级）插入段落到指定位置，edit（B级）编辑段落，delete（C级）删除段落。",
    parameters: {
      type: "object",
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
      required: ["action"],
    },
    fn: async (args: { action: string; id?: number; chapter_id?: number; content?: string; after_id?: number; type?: string; mood?: string; location?: string }) => {
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
      if (args.action === "edit") {
        if (args.id == null) return JSON.stringify({ error: "id required for edit" });
        const summary = `编辑段落 ${args.id}`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.content != null) { sets.push("content = ?"); params.push(args.content); }
        if (args.type != null) { sets.push("type = ?"); params.push(args.type); }
        if (args.mood != null) { sets.push("mood = ?"); params.push(args.mood); }
        if (args.location != null) { sets.push("location = ?"); params.push(args.location); }
        if (sets.length === 0) return JSON.stringify({ success: true });
        sets.push("updated_at = datetime('now')");
        params.push(args.id);
        await db.request({ id: 0, type: "run", sql: `UPDATE segments SET ${sets.join(", ")} WHERE id = ?`, params });
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        if (args.id == null) return JSON.stringify({ error: "id required for delete" });
        const summary = `删除段落 ${args.id}`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_segment", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM segments WHERE id = ?", params: [args.id] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "timeline",
    description: "时间线管理。action: list（A级）列出全部事件，query（A级）按范围查询事件，create（B级）创建事件，edit（C级）编辑事件，delete（C级）删除事件。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit | delete" },
        id: { type: "string", description: "事件ID" },
        time: { type: "string", description: "事件时间" },
        description: { type: "string", description: "事件描述" },
        characters: { type: "array", items: { type: "string" }, description: "涉及角色" },
        location: { type: "string", description: "地点" },
        cause_id: { type: "string", description: "原因事件ID" },
        event_id: { type: "string", description: "要编辑的事件ID" },
        from: { type: "string", description: "查询起始时间" },
        to: { type: "string", description: "查询结束时间" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; id?: string; time?: string; description?: string; characters?: string[]; location?: string; cause_id?: string; event_id?: string; from?: string; to?: string }) => {
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
      if (args.action === "query") {
        if (!args.from || !args.to) return JSON.stringify({ error: "from and to required for query" });
        const result = await queryTimeline(db, { from: args.from, to: args.to });
        return JSON.stringify(result);
      }
      if (args.action === "create") {
        if (args.id == null || args.time == null || args.description == null) return JSON.stringify({ error: "id, time, description required" });
        const summary = `创建时间线事件 "${args.id}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO timeline_events (id, time, description, characters, location, cause_id) VALUES (?, ?, ?, ?, ?, ?)",
          params: [args.id, args.time, args.description, JSON.stringify(args.characters ?? []), args.location ?? "", args.cause_id ?? null],
        });
        return JSON.stringify({ success: true, id: args.id });
      }
      if (args.action === "edit") {
        if (args.event_id == null) return JSON.stringify({ error: "event_id required for edit" });
        const summary = `编辑事件 ${args.event_id}`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "edit_timeline", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.description != null) { sets.push("description = ?"); params.push(args.description); }
        if (args.time != null) { sets.push("time = ?"); params.push(args.time); }
        if (sets.length === 0) return JSON.stringify({ success: true });
        params.push(args.event_id);
        await db.request({ id: 0, type: "run", sql: `UPDATE timeline_events SET ${sets.join(", ")} WHERE id = ?`, params });
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        if (args.id == null) return JSON.stringify({ error: "id required for delete" });
        const summary = `删除时间线事件 "${args.id}"`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_timeline_event", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM timeline_events WHERE id = ?", params: [args.id] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "outline",
    description: "大纲管理。action: list（A级）列出大纲节点，query（A级）查询单节点详情，create（B级）创建节点，edit（B级）编辑节点，delete（C级）删除节点。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：create | edit | delete" },
        id: { type: "number", description: "节点ID" },
        parent_id: { type: "number", description: "父节点ID" },
        volume: { type: "number", description: "卷号" },
        seq: { type: "number", description: "排序" },
        title: { type: "string", description: "标题" },
        summary: { type: "string", description: "摘要" },
        foreshadow: { type: "string", description: "伏笔" },
        status: { type: "string", description: "状态" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; id?: number; parent_id?: number; volume?: number; seq?: number; title?: string; summary?: string; foreshadow?: string; status?: string }) => {
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
      if (args.action === "create") {
        const title = args.title ?? "";
        const summary = `创建大纲 "${title}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO outlines (parent_id, volume, seq, title, summary, foreshadow, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
          params: [args.parent_id ?? null, args.volume ?? 1, args.seq ?? 0, title, args.summary ?? "", args.foreshadow ?? "", args.status ?? "draft"],
        });
        const newId = await getLastInsertId(db);
        return JSON.stringify({ success: true, id: newId });
      }
      if (args.action === "edit") {
        if (args.id == null) return JSON.stringify({ error: "id required for edit" });
        const summary = `编辑大纲 ${args.id}`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.title != null) { sets.push("title = ?"); params.push(args.title); }
        if (args.summary != null) { sets.push("summary = ?"); params.push(args.summary); }
        if (args.foreshadow != null) { sets.push("foreshadow = ?"); params.push(args.foreshadow); }
        if (args.status != null) { sets.push("status = ?"); params.push(args.status); }
        if (args.parent_id != null) { sets.push("parent_id = ?"); params.push(args.parent_id); }
        if (args.volume != null) { sets.push("volume = ?"); params.push(args.volume); }
        if (args.seq != null) { sets.push("seq = ?"); params.push(args.seq); }
        if (sets.length === 0) return JSON.stringify({ success: true });
        sets.push("updated_at = datetime('now')");
        params.push(args.id);
        await db.request({ id: 0, type: "run", sql: `UPDATE outlines SET ${sets.join(", ")} WHERE id = ?`, params });
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        if (args.id == null) return JSON.stringify({ error: "id required for delete" });
        const summary = `删除大纲 ${args.id}`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_outline", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM outlines WHERE id = ?", params: [args.id] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "setting",
    description: "全局设定管理。action: list（A级）列出设定，query（A级）查询设定，write（B级）写入设定，upsert 策略。写入时必须指定 tag 分类，如：技能、能力、道具、装备、奇遇、世界观、修炼体系等。tag 由你根据小说类型和内容自行决定，确保同类设定归入同一 tag。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | write" },
        key: { type: "string", description: "设定键名" },
        value: { type: "string", description: "设定值" },
        description: { type: "string", description: "说明" },
        tag: { type: "string", description: "设定分类标签，如：技能、能力、道具、装备、奇遇、世界观、修炼体系等。write 时必填。" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; key?: string; value?: string; description?: string; tag?: string }) => {
      if (args.action === "list") {
        const res = await db.request({
          id: 0, type: "query",
          sql: "SELECT key, value, description, tag FROM global_constants ORDER BY tag, key",
        });
        if (!res.ok || !res.data) return JSON.stringify([]);
        return JSON.stringify(res.data);
      }
      if (args.action === "query") {
        if (!args.key) return JSON.stringify({ error: "key required for query" });
        const result = await querySetting(db, args.key);
        return JSON.stringify(result);
      }
      if (args.action === "write") {
        if (!args.key || !args.value) return JSON.stringify({ error: "key and value required for write" });
        const summary = `写入设定 "${args.key}" (tag: ${args.tag || "未分类"})`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO global_constants (key, value, description, tag) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description, tag = excluded.tag",
          params: [args.key, args.value, args.description ?? "", args.tag ?? ""],
        });
        return JSON.stringify({ success: true, key: args.key, tag: args.tag ?? "" });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "formula",
    description: "公式管理。action: list（A级）列出公式，query（A级）查询单公式，create（B级）创建公式，edit（B级）编辑公式。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit" },
        name: { type: "string", description: "公式名" },
        template: { type: "string", description: "公式模板" },
        vars: { type: "string", description: "变量说明" },
        description: { type: "string", description: "公式描述" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; name?: string; template?: string; vars?: string; description?: string }) => {
      if (args.action === "list") {
        const result = await queryFormulas(db);
        return JSON.stringify(result);
      }
      if (args.action === "query") {
        if (!args.name) return JSON.stringify({ error: "name required for query" });
        const result = await queryFormulas(db);
        const found = result.find(f => f.name === args.name);
        if (!found) return JSON.stringify(null);
        return JSON.stringify(found);
      }
      if (args.action === "create") {
        if (!args.name) return JSON.stringify({ error: "name required for create" });
        if (args.template == null) return JSON.stringify({ error: "template required for create" });
        const summary = `创建公式 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO formulas (name, template, description, vars) VALUES (?, ?, ?, ?)",
          params: [args.name, args.template, args.description ?? "", args.vars ?? ""],
        });
        return JSON.stringify({ success: true, name: args.name });
      }
      if (args.action === "edit") {
        if (!args.name) return JSON.stringify({ error: "name required for edit" });
        const summary = `编辑公式 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.template != null) { sets.push("template = ?"); params.push(args.template); }
        if (args.vars != null) { sets.push("vars = ?"); params.push(args.vars); }
        if (args.description != null) { sets.push("description = ?"); params.push(args.description); }
        if (sets.length === 0) return JSON.stringify({ success: true });
        params.push(args.name);
        await db.request({ id: 0, type: "run", sql: `UPDATE formulas SET ${sets.join(", ")} WHERE name = ?`, params });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "item",
    description: "物品管理。action: list（A级）列出物品，query（A级）查询单物品，create（B级）创建物品，edit（B级）编辑物品（attrs 合并），delete（C级）删除物品。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit | delete" },
        name: { type: "string", description: "物品名" },
        type: { type: "string", description: "类型" },
        attrs: { type: "object", description: "自定义属性" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; name?: string; type?: string; attrs?: Record<string, unknown> }) => {
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
      if (args.action === "create") {
        const summary = `创建物品 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO items (name, type, custom_attrs) VALUES (?, ?, ?)",
          params: [args.name, args.type ?? "", JSON.stringify(args.attrs ?? {})],
        });
        await db.request({ id: 0, type: "run", sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'item', ?)", params: [args.name, args.name] });
        return JSON.stringify({ success: true, name: args.name });
      }
      if (args.action === "edit") {
        const summary = `编辑物品 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (args.type) {
          await db.request({
            id: 0,
            type: "run",
            sql: "UPDATE items SET type = ?, updated_at = datetime('now') WHERE name = ?",
            params: [args.type, args.name],
          });
        }
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        const summary = `删除物品 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_item", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM items WHERE name = ?", params: [args.name] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "faction",
    description: "势力管理。action: list（A级）列出势力，query（A级）查询单势力，create（B级）创建势力，edit（B级）编辑势力（attrs 合并），delete（C级）删除势力。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit | delete" },
        name: { type: "string", description: "势力名" },
        description: { type: "string", description: "描述" },
        attrs: { type: "object", description: "自定义属性" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; name?: string; description?: string; attrs?: Record<string, unknown> }) => {
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
      if (args.action === "create") {
        const summary = `创建势力 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO factions (name, description, custom_attrs) VALUES (?, ?, ?)",
          params: [args.name, args.description ?? "", JSON.stringify(args.attrs ?? {})],
        });
        await db.request({ id: 0, type: "run", sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'faction', ?)", params: [args.name, args.name] });
        return JSON.stringify({ success: true, name: args.name });
      }
      if (args.action === "edit") {
        const summary = `编辑势力 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        if (args.attrs && args.name != null) await mergeAttrs(db, "factions", args.name, args.attrs);
        if (args.description) {
          await db.request({
            id: 0,
            type: "run",
            sql: "UPDATE factions SET description = ?, updated_at = datetime('now') WHERE name = ?",
            params: [args.description, args.name],
          });
        }
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        const summary = `删除势力 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_faction", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM factions WHERE name = ?", params: [args.name] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "location",
    description: "地点管理。action: list（A级）列出地点，query（A级）查询单地点，create（B级）创建地点，edit（B级）编辑地点（attrs 合并），delete（C级）删除地点。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit | delete" },
        name: { type: "string", description: "地点名" },
        description: { type: "string", description: "描述" },
        attrs: { type: "object", description: "自定义属性" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; name?: string; description?: string; attrs?: Record<string, unknown> }) => {
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
      if (args.action === "create") {
        const summary = `创建地点 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO locations (name, description, custom_attrs) VALUES (?, ?, ?)",
          params: [args.name, args.description ?? "", JSON.stringify(args.attrs ?? {})],
        });
        await db.request({ id: 0, type: "run", sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'location', ?)", params: [args.name, args.name] });
        return JSON.stringify({ success: true, name: args.name });
      }
      if (args.action === "edit") {
        const summary = `编辑地点 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        if (args.attrs && args.name != null) await mergeAttrs(db, "locations", args.name, args.attrs);
        if (args.description) {
          await db.request({
            id: 0,
            type: "run",
            sql: "UPDATE locations SET description = ?, updated_at = datetime('now') WHERE name = ?",
            params: [args.description, args.name],
          });
        }
        return JSON.stringify({ success: true });
      }
      if (args.action === "delete") {
        const summary = `删除地点 "${args.name}"`;
        const verdict = await gate.ask({ kind: "plan_checkpoint", payload: { stepId: "delete_location", result: summary } });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await db.request({ id: 0, type: "run", sql: "DELETE FROM locations WHERE name = ?", params: [args.name] });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "script",
    description: "脚本管理。action: list（A级）列出脚本，query（A级）查询单脚本详情，create（B级）创建脚本，edit（B级）编辑脚本。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list | query | create | edit" },
        scene_id: { type: "string", description: "场景ID（query/create/edit用）" },
        scene_type: { type: "string", description: "场景类型" },
        title: { type: "string", description: "标题" },
        content: { type: "string", description: "内容" },
        constraints: { type: "object", description: "约束条件" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; scene_id: string; scene_type?: string; title?: string; content?: string; constraints?: Record<string, unknown> }) => {
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
      if (args.action === "create") {
        const summary = `创建脚本 "${args.scene_id}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO scripts (scene_id, scene_type, title, content, constraints) VALUES (?, ?, ?, ?, ?)",
          params: [args.scene_id, args.scene_type ?? "", args.title ?? "", args.content ?? "", JSON.stringify(args.constraints ?? {})],
        });
        const newId = await getLastInsertId(db);
        return JSON.stringify({ success: true, id: newId });
      }
      if (args.action === "edit") {
        const summary = `编辑脚本 "${args.scene_id}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.title != null) { sets.push("title = ?"); params.push(args.title); }
        if (args.content != null) { sets.push("content = ?"); params.push(args.content); }
        if (args.constraints != null) { sets.push("constraints = ?"); params.push(JSON.stringify(args.constraints)); }
        if (sets.length === 0) return JSON.stringify({ success: true });
        sets.push("updated_at = datetime('now')");
        params.push(args.scene_id);
        await db.request({ id: 0, type: "run", sql: `UPDATE scripts SET ${sets.join(", ")} WHERE scene_id = ?`, params });
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "kg",
    description: "知识图谱管理。action: list_nodes（A级）列出节点，list_relations（A级）列出关系，query_node（A级）查询单节点及关系，create_node（B级）创建节点，create_relation（B级）创建关系，delete_node（C级）删除节点及关系，delete_relation（C级）删除关系。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：list_nodes | list_relations | query_node | create_node | create_relation | delete_node | delete_relation" },
        id: { type: "string", description: "节点ID" },
        type: { type: "string", description: "节点类型（list_nodes 筛选）或关系类型" },
        label: { type: "string", description: "标签" },
        attrs: { type: "object", description: "属性" },
        source_id: { type: "string", description: "源节点ID" },
        target_id: { type: "string", description: "目标节点ID" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; id?: string; type?: string; label?: string; attrs?: Record<string, unknown>; source_id?: string; target_id?: string }) => {
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
      if (args.action === "create_node") {
        if (args.id == null || args.type == null || args.label == null) return JSON.stringify({ error: "id, type, label required" });
        const summary = `创建知识图谱节点 "${args.id}"`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO kg_nodes (id, type, label, attrs) VALUES (?, ?, ?, ?)",
          params: [args.id, args.type, args.label, JSON.stringify(args.attrs ?? {})],
        });
        return JSON.stringify({ success: true, id: args.id });
      }
      if (args.action === "create_relation") {
        if (args.source_id == null || args.target_id == null || args.type == null) return JSON.stringify({ error: "source_id, target_id, type required" });
        const summary = `创建知识图谱关系 ${args.source_id} → ${args.target_id}`;
        const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
        if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
        await db.request({
          id: 0,
          type: "run",
          sql: "INSERT INTO kg_relations (source_id, target_id, type, attrs) VALUES (?, ?, ?, ?)",
          params: [args.source_id, args.target_id, args.type, JSON.stringify(args.attrs ?? {})],
        });
        return JSON.stringify({ success: true });
      }
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
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });

  reg.register({
    name: "snapshot",
    description: "快照管理。action: create（C级）创建快照存档，rollback（C级）回滚到指定快照。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：create | rollback" },
        description: { type: "string", description: "快照描述" },
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              id: { type: "string" },
            },
            required: ["type", "id"],
          },
          description: "受影响实体列表",
        },
        snapshot_id: { type: "number", description: "快照ID" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; description?: string; entities?: Array<{ type: string; id: string }>; snapshot_id?: number }) => {
      if (args.action === "create") {
        if (args.description == null || args.entities == null) return JSON.stringify({ error: "description and entities required" });
        const verdict = await gate.ask({
          kind: "plan_checkpoint",
          payload: { stepId: "confirm_checkpoint", result: args.description },
        });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        const snapshot_id = await createSnapshot(db, args.description, args.entities);
        return JSON.stringify({ snapshot_id });
      }
      if (args.action === "rollback") {
        if (args.snapshot_id == null) return JSON.stringify({ error: "snapshot_id required" });
        const verdict = await gate.ask({
          kind: "plan_checkpoint",
          payload: { stepId: "rollback", result: `回滚到快照 ${args.snapshot_id}` },
        });
        if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
        await rollbackToSnapshot(db, args.snapshot_id);
        return JSON.stringify({ success: true });
      }
      return JSON.stringify({ error: `unknown action: ${args.action}` });
    },
  });
}
