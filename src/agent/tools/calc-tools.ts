import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { DbWorker } from "../../db/worker.js";
import { evaluate } from "../../engine/formula.js";

export function registerCalcTools(reg: ToolRegistry, db: DbWorker): void {
  reg.register({
    name: "calculate",
    description: "使用数据库中的命名公式进行确定性数值计算。先调用 query_formulas 了解可用公式和所需参数。传入公式名和参数值，返回 {formula, result, params}。公式不存在时返回 error。不要自行心算——所有数值计算都应通过此工具完成以确保一致性。",
    parameters: {
      type: "object",
      properties: {
        formula_name: { type: "string", description: "公式名称" },
        params: { type: "object", description: "公式参数" },
      },
      required: ["formula_name", "params"],
    },
    fn: async (args: { formula_name: string; params: Record<string, number> }) => {
      const res = await db.request({
        id: 0,
        type: "query",
        sql: "SELECT template FROM formulas WHERE name = ?",
        params: [args.formula_name],
      });
      if (!res.ok || !res.data) {
        return JSON.stringify({ error: `formula "${args.formula_name}" not found` });
      }
      const rows = res.data as { template: string }[];
      const row = rows[0];
      if (!row) {
        return JSON.stringify({ error: `formula "${args.formula_name}" not found` });
      }
      const result = evaluate(row.template, args.params);
      return JSON.stringify({
        formula: args.formula_name,
        result: result.value,
        params: args.params,
      });
    },
  });

  reg.register({
    name: "calculate_batch",
    description: "批量计算多个公式，共享同一组参数。传入公式名数组和参数对象，返回每个公式的计算结果数组。适用于需要同时计算多个相关数值的场景（如同时计算伤害、防御、命中）。",
    parameters: {
      type: "object",
      properties: {
        formulas: { type: "array", items: { type: "string" }, description: "公式名称列表" },
        params: { type: "object", description: "公式参数" },
      },
      required: ["formulas", "params"],
    },
    fn: async (args: { formulas: string[]; params: Record<string, number> }) => {
      const results: Array<{ formula: string; result: number; params: Record<string, number> }> = [];
      for (const name of args.formulas) {
        const res = await db.request({
          id: 0,
          type: "query",
          sql: "SELECT template FROM formulas WHERE name = ?",
          params: [name],
        });
        if (!res.ok || !res.data) continue;
        const rows = res.data as { template: string }[];
        const row = rows[0];
        if (!row) continue;
        const result = evaluate(row.template, args.params);
        results.push({ formula: name, result: result.value, params: args.params });
      }
      return JSON.stringify(results);
    },
  });
}
