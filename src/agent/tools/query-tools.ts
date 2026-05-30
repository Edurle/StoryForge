import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { DbWorker } from "../../db/worker.js";
import {
  queryCharacter,
  queryCharacters,
  querySetting,
  queryTimeline,
  queryRelations,
  queryFormulas,
} from "../../services/knowledge.js";

export function registerQueryTools(reg: ToolRegistry, db: DbWorker): void {
  reg.register({
    name: "query_character",
    description: "查询单个角色的详细信息。返回 {name, stage, attrs}，其中 attrs 是包含所有自定义属性（如 hp、spirit_power、location 等）的 JSON 对象。角色不存在时返回 null。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "角色名" },
      },
      required: ["name"],
    },
    fn: async (args: { name: string }) => {
      const result = await queryCharacter(db, args.name);
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "query_characters",
    description: "查询角色列表，可按修炼阶段筛选。返回数组，每项包含 {name, stage, attrs}。不传 stage 则返回全部角色。",
    parameters: {
      type: "object",
      properties: {
        stage: { type: "string", description: "修炼阶段筛选" },
      },
    },
    fn: async (args: { stage?: string }) => {
      const filter = args.stage ? { stage: args.stage } : undefined;
      const result = await queryCharacters(db, filter);
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "query_setting",
    description: "查询世界观设定。从 global_constants 表中按 topic（key）查询。返回 {topic, content} 或 null。",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "设定主题" },
      },
      required: ["topic"],
    },
    fn: async (args: { topic: string }) => {
      const result = await querySetting(db, args.topic);
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "query_timeline",
    description: "查询时间线事件。时间是 'T+N' 格式（如 T+0 到 T+100 表示第0到第100个时间单位）。返回 {id, time, description, characters[]} 数组，按时间排序。只返回指定范围内的事件。",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "起始时间" },
        to: { type: "string", description: "结束时间" },
      },
      required: ["from", "to"],
    },
    fn: async (args: { from: string; to: string }) => {
      const result = await queryTimeline(db, { from: args.from, to: args.to });
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "query_relations",
    description: "查询指定角色的直接社会关系。返回 {target, type}[] 数组。仅返回深度为1的直接关系，不包含间接/传递关系。",
    parameters: {
      type: "object",
      properties: {
        character: { type: "string", description: "角色名" },
      },
      required: ["character"],
    },
    fn: async (args: { character: string }) => {
      const result = await queryRelations(db, args.character);
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "query_formulas",
    description: "查询数据库中所有可用的计算公式。返回 {name, template, vars}[] 数组。template 是表达式模板，vars 是逗号分隔的变量名列表。用 calculate 工具执行计算。",
    parameters: {
      type: "object",
      properties: {},
    },
    fn: async () => {
      const result = await queryFormulas(db);
      return JSON.stringify(result);
    },
  });

  reg.register({
    name: "query_project_status",
    description: "查询项目状态概览。返回 {characters, timeline_events, formulas} 的计数。新会话开始时建议先调用此工具了解项目规模。",
    parameters: {
      type: "object",
      properties: {},
    },
    fn: async () => {
      const [charRes, tlRes, formulaRes] = await Promise.all([
        db.request({ id: 0, type: "query", sql: "SELECT COUNT(*) as count FROM characters" }),
        db.request({ id: 0, type: "query", sql: "SELECT COUNT(*) as count FROM timeline_events" }),
        db.request({ id: 0, type: "query", sql: "SELECT COUNT(*) as count FROM formulas" }),
      ]);
      const count = (res: unknown) =>
        (res as { data?: Array<{ count: number }> }).data?.[0]?.count ?? 0;
      return JSON.stringify({
        characters: count(charRes),
        timeline_events: count(tlRes),
        formulas: count(formulaRes),
      });
    },
  });
}
