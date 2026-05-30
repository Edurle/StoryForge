import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { PauseGate } from "../../../lib/reasonix-core/core/pause-gate.js";
import type { DbWorker } from "../../db/worker.js";
import { createSnapshot, rollbackToSnapshot } from "../../services/state.js";

export function registerWriteTools(reg: ToolRegistry, db: DbWorker, gate: PauseGate): void {
  reg.register({
    name: "edit_character",
    description: "编辑角色信息（B级确认）。attrs 参数采用合并策略——只更新传入的字段，未提及的字段保持不变。例如 attrs: {hp: 800} 只改 hp，其他属性不受影响。stage 参数直接更新修炼阶段。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "角色名" },
        stage: { type: "string", description: "修炼阶段" },
        attrs: { type: "object", description: "自定义属性（合并）" },
      },
      required: ["name"],
    },
    fn: async (args: { name: string; stage?: string; attrs?: Record<string, unknown> }) => {
      const summary = `编辑角色 "${args.name}"${args.stage ? ` → ${args.stage}` : ""}`;
      const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
      if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });

      if (args.attrs) {
        const curRes = await db.request({
          id: 0,
          type: "query",
          sql: "SELECT custom_attrs FROM characters WHERE name = ?",
          params: [args.name],
        });
        let existing: Record<string, unknown> = {};
        if (curRes.ok && curRes.data) {
          const rows = curRes.data as { custom_attrs: string }[];
          if (rows[0]) existing = JSON.parse(rows[0].custom_attrs) as Record<string, unknown>;
        }
        const merged = { ...existing, ...args.attrs };
        await db.request({
          id: 0,
          type: "run",
          sql: "UPDATE characters SET custom_attrs = ?, updated_at = datetime('now') WHERE name = ?",
          params: [JSON.stringify(merged), args.name],
        });
      }

      if (args.stage) {
        await db.request({
          id: 0,
          type: "run",
          sql: "UPDATE characters SET stage = ?, updated_at = datetime('now') WHERE name = ?",
          params: [args.stage, args.name],
        });
      }

      return JSON.stringify({ success: true });
    },
  });

  reg.register({
    name: "update_character_state",
    description: "更新角色动态状态属性（B级确认）。与 edit_character 类似但专注于运行时状态（位置、HP、装备等）。attrs 同样采用合并策略，不会删除未提及的字段。适用于战斗/剧情推进中的状态变更。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "角色名" },
        attrs: { type: "object", description: "要更新的属性" },
      },
      required: ["name", "attrs"],
    },
    fn: async (args: { name: string; attrs: Record<string, unknown> }) => {
      const summary = `更新角色 "${args.name}" 状态`;
      const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
      if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });

      const curRes = await db.request({
        id: 0,
        type: "query",
        sql: "SELECT custom_attrs FROM characters WHERE name = ?",
        params: [args.name],
      });
      let existing: Record<string, unknown> = {};
      if (curRes.ok && curRes.data) {
        const rows = curRes.data as { custom_attrs: string }[];
        if (rows[0]) existing = JSON.parse(rows[0].custom_attrs) as Record<string, unknown>;
      }
      const merged = { ...existing, ...args.attrs };
      await db.request({
        id: 0,
        type: "run",
        sql: "UPDATE characters SET custom_attrs = ?, updated_at = datetime('now') WHERE name = ?",
        params: [JSON.stringify(merged), args.name],
      });

      return JSON.stringify({ success: true });
    },
  });

  reg.register({
    name: "write_text",
    description: "写入章节正文段落（B级确认）。chapter_id 指定目标章节，content 为正文文本，position 可选指定插入序号。段落存储在 segments 表中。",
    parameters: {
      type: "object",
      properties: {
        chapter_id: { type: "number", description: "章节ID" },
        content: { type: "string", description: "文本内容" },
        position: { type: "number", description: "插入位置序号" },
      },
      required: ["chapter_id", "content"],
    },
    fn: async (args: { chapter_id: number; content: string; position?: number }) => {
      const summary = `写入章节 ${args.chapter_id} 文本`;
      const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
      if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });

      const seq = args.position ?? 0;
      await db.request({
        id: 0,
        type: "run",
        sql: "INSERT INTO segments (chapter_id, seq, content) VALUES (?, ?, ?)",
        params: [args.chapter_id, seq, args.content],
      });

      return JSON.stringify({ success: true });
    },
  });

  reg.register({
    name: "edit_outline",
    description: "编辑大纲节点（B级确认）。action 目前支持 'update'。data 需包含 id 字段，可更新 title 和 summary。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作类型：update" },
        data: { type: "object", description: "大纲数据" },
      },
      required: ["action", "data"],
    },
    fn: async (args: { action: string; data: Record<string, unknown> }) => {
      const summary = `编辑大纲: ${args.action}`;
      const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
      if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });

      if (args.action === "update" && args.data.id != null) {
        const sets: string[] = [];
        const params: unknown[] = [];
        if (args.data.title != null) {
          sets.push("title = ?");
          params.push(args.data.title);
        }
        if (args.data.summary != null) {
          sets.push("summary = ?");
          params.push(args.data.summary);
        }
        if (sets.length === 0) return JSON.stringify({ success: true });
        sets.push("updated_at = datetime('now')");
        params.push(args.data.id);
        await db.request({
          id: 0,
          type: "run",
          sql: `UPDATE outlines SET ${sets.join(", ")} WHERE id = ?`,
          params,
        });
      }

      return JSON.stringify({ success: true });
    },
  });

  reg.register({
    name: "confirm_checkpoint",
    description: "创建状态快照存档点（C级阻断确认——需用户明确同意）。在重要剧情节点（大战、角色死亡、重大设定变更）前创建，以便后续回滚。entities 格式：[{type:'character', id:'角色名'}]。返回 snapshot_id。",
    parameters: {
      type: "object",
      properties: {
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
      },
      required: ["description", "entities"],
    },
    fn: async (args: { description: string; entities: Array<{ type: string; id: string }> }) => {
      const verdict = await gate.ask({
        kind: "plan_checkpoint",
        payload: { stepId: "confirm_checkpoint", result: args.description },
      });
      if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });

      const snapshot_id = await createSnapshot(db, args.description, args.entities);
      return JSON.stringify({ snapshot_id });
    },
  });

  reg.register({
    name: "rollback",
    description: "回滚到指定快照（C级阻断确认——需用户明确同意）。这是紧急操作，仅在确认数据错误时使用。回滚后会恢复快照创建时所有受影响实体的属性值。",
    parameters: {
      type: "object",
      properties: {
        snapshot_id: { type: "number", description: "快照ID" },
      },
      required: ["snapshot_id"],
    },
    fn: async (args: { snapshot_id: number }) => {
      const verdict = await gate.ask({
        kind: "plan_checkpoint",
        payload: { stepId: "rollback", result: `回滚到快照 ${args.snapshot_id}` },
      });
      if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });

      await rollbackToSnapshot(db, args.snapshot_id);
      return JSON.stringify({ success: true });
    },
  });

  reg.register({
    name: "edit_timeline",
    description: "编辑时间线事件（C级阻断确认——需用户明确同意）。时间线是叙事骨架，修改可能影响因果链。可更新 description 和 time 字段。",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "事件ID" },
        description: { type: "string", description: "事件描述" },
        time: { type: "string", description: "事件时间" },
      },
      required: ["event_id"],
    },
    fn: async (args: { event_id: string; description?: string; time?: string }) => {
      const verdict = await gate.ask({
        kind: "plan_checkpoint",
        payload: { stepId: "edit_timeline", result: `编辑事件 ${args.event_id}` },
      });
      if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });

      const sets: string[] = [];
      const params: unknown[] = [];
      if (args.description != null) {
        sets.push("description = ?");
        params.push(args.description);
      }
      if (args.time != null) {
        sets.push("time = ?");
        params.push(args.time);
      }
      if (sets.length === 0) return JSON.stringify({ success: true });
      params.push(args.event_id);
      await db.request({
        id: 0,
        type: "run",
        sql: `UPDATE timeline_events SET ${sets.join(", ")} WHERE id = ?`,
        params,
      });

      return JSON.stringify({ success: true });
    },
  });
}
