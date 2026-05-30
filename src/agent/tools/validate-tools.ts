import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { DbWorker } from "../../db/worker.js";
import {
  validateNumericConsistency,
  validateTimelineConsistency,
  validateCharacterConsistency,
} from "../../services/validator.js";

export function registerValidateTools(reg: ToolRegistry, db: DbWorker): void {
  reg.register({
    name: "validate_consistency",
    description: "运行全部三项一致性验证：(1) 数值验证——检查角色属性是否有负值或零值；(2) 时间线验证——检查事件因果是否倒置（果在因之前）；(3) 角色验证——检查已死亡角色是否仍出现在后续事件中，关系是否引用了不存在的角色。dead_characters 参数传入已确认死亡的角色名列表。返回 {issues[]} 数组，空数组表示无问题。",
    parameters: {
      type: "object",
      properties: {
        dead_characters: {
          type: "array",
          items: { type: "string" },
          description: "已死亡角色列表",
        },
      },
    },
    fn: async (args: { dead_characters?: string[] }) => {
      const [numeric, timeline, character] = await Promise.all([
        validateNumericConsistency(db),
        validateTimelineConsistency(db),
        validateCharacterConsistency(db, args.dead_characters),
      ]);
      return JSON.stringify({ issues: [...numeric, ...timeline, ...character] });
    },
  });

  reg.register({
    name: "validate_timeline",
    description: "仅验证时间线因果一致性。检查每个有 cause_id 的事件，确认原因事件的时间不晚于结果事件。返回 {issues[]} 数组。",
    parameters: {
      type: "object",
      properties: {},
    },
    fn: async () => {
      const issues = await validateTimelineConsistency(db);
      return JSON.stringify({ issues });
    },
  });
}
