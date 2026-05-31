import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { DbWorker } from "../../db/worker.js";

export function registerQueryTools(reg: ToolRegistry, db: DbWorker): void {
  reg.register({
    name: "project_status",
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
