import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { PauseGate } from "../../../lib/reasonix-core/core/pause-gate.js";
import type { DbWorker } from "../../db/worker.js";
import { loadSkill, saveSkill, listSkills, deleteSkill } from "../../services/skills.js";

export function registerSkillTools(reg: ToolRegistry, db: DbWorker, gate: PauseGate): void {
  reg.register({
    name: "list_skills",
    description: "列出所有技能（按类别筛选）。返回每个技能的名称、描述和类别。不返回技能内容——用 get_skill 加载完整内容。category 可选，不传则返回全部。",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "按题材类别筛选，如 '通用'、'玄幻'、'网游'。不传则返回全部" },
      },
    },
    fn: async (args: { category?: string }) => {
      const result = await listSkills(db, args.category);
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "get_skill",
    description: "加载指定技能的完整内容。技能是按需加载的创作指南或领域知识，包含分步工作流、模板、注意事项等。先用 list_skills 查看有哪些可用技能。返回 { name, content }，不存在时返回 error。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "技能名称" },
      },
      required: ["name"],
    },
    fn: async (args: { name: string }) => {
      const content = await loadSkill(db, args.name);
      if (content === null) return JSON.stringify({ error: `skill "${args.name}" not found` });
      return JSON.stringify({ name: args.name, content });
    },
  });

  reg.register({
    name: "save_skill",
    description: "创建或更新技能（upsert）。技能用于沉淀创作过程中的领域知识和工作流模板，供后续 get_skill 加载复用。category 标注题材类型，通用技能用 '通用'。需要用户确认。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "技能名称，如 'battle_scene'、'角色_叶凡'" },
        content: { type: "string", description: "技能内容文本" },
        description: { type: "string", description: "简短描述" },
        category: { type: "string", description: "题材类别，如 '通用'、'玄幻'、'网游'。默认 '通用'" },
      },
      required: ["name", "content"],
    },
    fn: async (args: { name: string; content: string; description?: string; category?: string }) => {
      const summary = `保存技能 "${args.name}"`;
      const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
      if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
      await saveSkill(db, args.name, args.content, args.description, args.category);
      return JSON.stringify({ success: true });
    },
  });

  reg.register({
    name: "delete_skill",
    description: "删除指定技能。需要用户确认。删除后不可恢复。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "要删除的技能名称" },
      },
      required: ["name"],
    },
    fn: async (args: { name: string }) => {
      const summary = `删除技能 "${args.name}"`;
      const verdict = await gate.ask({ kind: "plan_proposed", payload: { plan: summary, summary } });
      if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
      await deleteSkill(db, args.name);
      return JSON.stringify({ success: true });
    },
  });
}
