import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { DbWorker } from "../../db/worker.js";

export function registerQueryTools(reg: ToolRegistry, db: DbWorker): void {
  reg.register({
    name: "project_status",
    description: "查询项目状态概览。返回所有数据表的行计数。新会话开始时建议先调用此工具了解项目规模。",
    parameters: {
      type: "object",
      properties: {},
    },
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
  });
}
