import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { DbWorker } from "../../db/worker.js";

export async function computeWordCount(db: DbWorker): Promise<number> {
  const res = await db.request({
    id: 0,
    type: "query",
    sql: "SELECT COALESCE(SUM(LENGTH(content) - LENGTH(REPLACE(content, ' ', ''))), 0) AS wc FROM segments",
  });
  const rows = (res as { data?: Array<{ wc: number }> }).data;
  return rows?.[0]?.wc ?? 0;
}

export function registerQueryTools(reg: ToolRegistry, db: DbWorker): void {
  reg.register({
    name: "project_status",
    description: "查询项目状态概览。返回所有数据表的行计数、总字数、目标字数和完本进度百分比。新会话开始时建议先调用此工具了解项目规模。",
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
      const wordCount = await computeWordCount(db);
      counts["total_word_count"] = wordCount;

      const result: Record<string, unknown> = { ...counts };

      const mileRes = await db.request({
        id: 0,
        type: "query",
        sql: "SELECT id, title, target_words, status FROM outlines WHERE target_words > 0 ORDER BY target_words ASC",
      });
      if (mileRes.ok && mileRes.data) {
        result["milestones"] = (mileRes.data as { id: number; title: string; target_words: number; status: string }[]).map(m => ({
          id: m.id,
          title: m.title,
          targetWords: m.target_words,
          status: m.status,
          reached: wordCount >= m.target_words,
        }));
      }

      const posRes = await db.request({
        id: 0, type: "query",
        sql: "SELECT value FROM global_constants WHERE key = 'current_position'",
      });
      if (posRes.ok && posRes.data) {
        const rows = posRes.data as { value: string }[];
        if (rows[0]) {
          try { result["current_position"] = JSON.parse(rows[0].value); } catch {}
        }
      }

      return JSON.stringify(result);
    },
  });
}
