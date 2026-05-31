import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { PauseGate } from "../../../lib/reasonix-core/core/pause-gate.js";
import type { DbWorker } from "../../db/worker.js";
import { loadSkill, saveSkill, listSkills, deleteSkill } from "../../services/skills.js";

export function registerSkillTools(reg: ToolRegistry, db: DbWorker, gate: PauseGate): void {
  reg.register({
    name: "skill",
    description: "技能管理工具。action: get(加载技能内容)、list(列出技能)、save(保存技能，需确认)、delete(删除技能，需确认)。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作：get(加载)、list(列表)、save(保存，需确认)、delete(删除，需确认)" },
        name: { type: "string", description: "技能名（get/save/delete 必填）" },
        content: { type: "string", description: "技能内容（save 必填）" },
        description: { type: "string", description: "技能描述（save 可选）" },
        category: { type: "string", description: "题材类别，如'通用'、'玄幻'（list/save 可选，默认'通用'）" },
      },
      required: ["action"],
    },
    fn: async (args: { action: string; name?: string; content?: string; description?: string; category?: string }) => {
      switch (args.action) {
        case "get": {
          if (!args.name) return JSON.stringify({ error: "name is required for get" });
          const content = await loadSkill(db, args.name);
          if (content === null) return JSON.stringify({ error: `skill "${args.name}" not found` });
          return JSON.stringify({ name: args.name, content });
        }
        case "list": {
          const result = await listSkills(db, args.category);
          return JSON.stringify(result);
        }
        case "save": {
          if (!args.name) return JSON.stringify({ error: "name is required for save" });
          if (!args.content) return JSON.stringify({ error: "content is required for save" });
          const summary = `保存技能 "${args.name}"`;
          const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
          if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
          await saveSkill(db, args.name, args.content, args.description, args.category);
          return JSON.stringify({ success: true });
        }
        case "delete": {
          if (!args.name) return JSON.stringify({ error: "name is required for delete" });
          const summary = `删除技能 "${args.name}"`;
          const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
          if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
          await deleteSkill(db, args.name);
          return JSON.stringify({ success: true });
        }
        default:
          return JSON.stringify({ error: `unknown action "${args.action}"` });
      }
    },
  });
}
