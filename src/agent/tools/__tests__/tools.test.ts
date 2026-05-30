import { describe, it, expect, beforeAll } from "vitest";
import { ToolRegistry } from "../../../../lib/reasonix-core/tools.js";
import { PauseGate } from "../../../../lib/reasonix-core/core/pause-gate.js";
import { createToolRegistry } from "../index.js";
import {
  setupTestDb,
  seedCharacters,
  seedTimeline,
  seedRelations,
  seedFormulas,
  seedSkills,
  seedSettings,
  STANDARD_CHARS,
  STANDARD_TIMELINE,
  STANDARD_RELATIONS,
  STANDARD_FORMULAS,
  STANDARD_SKILLS,
} from "../../../services/__tests__/helpers.js";

const testDb = setupTestDb();

let reg: ToolRegistry;
let gate: PauseGate;

beforeAll(async () => {
  const w = testDb.w;
  await seedCharacters(w, STANDARD_CHARS);
  await seedTimeline(w, STANDARD_TIMELINE);
  await seedRelations(w, STANDARD_RELATIONS);
  await seedFormulas(w, STANDARD_FORMULAS);
  await seedSkills(w, STANDARD_SKILLS);
  await seedSettings(w, [{ topic: "world_rules", content: "修仙界通用规则" }]);

  gate = new PauseGate();
  gate.on((req) => {
    if (req.kind === "plan_proposed") {
      gate.resolve(req.id, { type: "approve" });
    } else if (req.kind === "plan_checkpoint") {
      gate.resolve(req.id, { type: "continue" });
    }
  });

  reg = createToolRegistry({ db: w, gate });
});

describe("M8 Tool Registration", () => {
  it("registers all 22 tools", () => {
    expect(reg.size).toBe(22);
  });

  it("specs returns all with type function and non-empty name", () => {
    const specs = reg.specs();
    expect(specs.length).toBe(22);
    for (const spec of specs) {
      expect(spec.type).toBe("function");
      expect(spec.function.name).toBeTruthy();
    }
  });
});

describe("A-level Query Tools", () => {
  it("query_character with seeded data returns character JSON", async () => {
    const result = await reg.dispatch("query_character", { name: "叶凡" });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("叶凡");
    expect(parsed.stage).toBe("筑基九层");
    expect(parsed.attrs.hp).toBe(1200);
  });

  it("query_characters with no filter returns all 3 characters", async () => {
    const result = await reg.dispatch("query_characters", {});
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(3);
    const names = parsed.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(["叶凡", "苏柔", "魔尊"]);
  });

  it("query_setting with seeded constant returns content", async () => {
    const result = await reg.dispatch("query_setting", { topic: "world_rules" });
    const parsed = JSON.parse(result);
    expect(parsed.topic).toBe("world_rules");
    expect(parsed.content).toBe("修仙界通用规则");
  });

  it("query_timeline with range returns filtered events", async () => {
    const result = await reg.dispatch("query_timeline", { from: "T+0", to: "T+50" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("T001");
  });

  it("query_relations for 叶凡 returns 2 relations", async () => {
    const result = await reg.dispatch("query_relations", { character: "叶凡" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(2);
  });

  it("query_formulas returns damage formula", async () => {
    const result = await reg.dispatch("query_formulas", {});
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("damage");
  });

  it("query_project_status returns counts", async () => {
    const result = await reg.dispatch("query_project_status", {});
    const parsed = JSON.parse(result);
    expect(parsed.characters).toBe(3);
    expect(parsed.timeline_events).toBe(2);
    expect(parsed.formulas).toBe(1);
  });
});

describe("A-level Skill Tools", () => {
  it("get_skill with seeded skill returns content", async () => {
    const result = await reg.dispatch("get_skill", { name: "battle" });
    const parsed = JSON.parse(result);
    expect(parsed.content).toContain("战斗场景创作指南");
  });

  it("get_skill with nonexistent returns error JSON", async () => {
    const result = await reg.dispatch("get_skill", { name: "nonexistent" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeTruthy();
  });

  it("list_skills returns seeded skills", async () => {
    const result = await reg.dispatch("list_skills", {});
    const parsed = JSON.parse(result);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    const names = parsed.map((s: { name: string }) => s.name);
    expect(names).toContain("battle");
    expect(names).toContain("power_system");
  });
});

describe("B-level Skill Gate Tools", () => {
  it("save_skill creates a new skill (gate approves)", async () => {
    const result = await reg.dispatch("save_skill", {
      name: "new_skill",
      content: "test content",
      description: "a test skill",
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const verify = await reg.dispatch("get_skill", { name: "new_skill" });
    const v = JSON.parse(verify);
    expect(v.content).toBe("test content");
  });

  it("save_skill with category", async () => {
    const result = await reg.dispatch("save_skill", {
      name: "xuanhuan_skill",
      content: "玄幻内容",
      description: "玄幻技能",
      category: "玄幻",
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const list = await reg.dispatch("list_skills", { category: "玄幻" });
    const skills = JSON.parse(list);
    expect(skills.some((s: { name: string }) => s.name === "xuanhuan_skill")).toBe(true);
  });

  it("delete_skill removes a skill (gate approves)", async () => {
    await reg.dispatch("save_skill", { name: "to_delete", content: "bye" });
    const result = await reg.dispatch("delete_skill", { name: "to_delete" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const verify = await reg.dispatch("get_skill", { name: "to_delete" });
    const v = JSON.parse(verify);
    expect(v.error).toBeTruthy();
  });

  it("save_skill cancel returns cancelled true", async () => {
    const g = new PauseGate();
    g.on((req) => {
      g.resolve(req.id, { type: "cancel" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    const result = await r.dispatch("save_skill", { name: "cancelled_skill", content: "nope" });
    const parsed = JSON.parse(result);
    expect(parsed.cancelled).toBe(true);
  });
});

describe("A-level Calc Tools", () => {
  it("calculate with damage formula returns correct result", async () => {
    const result = await reg.dispatch("calculate", {
      formula_name: "damage",
      params: { skill_base: 100, path_mult: 1.5, hit_mod: 1.0, target_resist: 0.2 },
    });
    const parsed = JSON.parse(result);
    expect(parsed.formula).toBe("damage");
    expect(parsed.result).toBeCloseTo(120, 5);
  });

  it("calculate_batch returns multiple results", async () => {
    const result = await reg.dispatch("calculate_batch", {
      formulas: ["damage"],
      params: { skill_base: 200, path_mult: 1.0, hit_mod: 1.0, target_resist: 0 },
    });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(1);
    expect(parsed[0].result).toBeCloseTo(200, 5);
  });
});

describe("A-level Validate Tools", () => {
  it("validate_consistency with consistent data returns empty issues", async () => {
    const result = await reg.dispatch("validate_consistency", {});
    const parsed = JSON.parse(result);
    expect(parsed.issues).toEqual([]);
  });

  it("validate_timeline returns result", async () => {
    const result = await reg.dispatch("validate_timeline", {});
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.issues)).toBe(true);
  });
});

describe("B-level Gate Tools", () => {
  it("edit_character triggers gate.ask with kind plan_proposed", async () => {
    const captured: unknown[] = [];
    const g = new PauseGate();
    g.on((req) => {
      captured.push(req);
      g.resolve(req.id, { type: "approve" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    await r.dispatch("edit_character", { name: "叶凡", stage: "金丹" });

    expect(captured.length).toBe(1);
    expect((captured[0] as { kind: string }).kind).toBe("plan_proposed");
  });

  it("edit_character approve succeeds and updates db", async () => {
    const result = await reg.dispatch("edit_character", { name: "叶凡", stage: "金丹" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const verify = await reg.dispatch("query_character", { name: "叶凡" });
    const v = JSON.parse(verify);
    expect(v.stage).toBe("金丹");
  });

  it("edit_character cancel returns cancelled true", async () => {
    const g = new PauseGate();
    g.on((req) => {
      g.resolve(req.id, { type: "cancel" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    const result = await r.dispatch("edit_character", { name: "叶凡", stage: "化神" });
    const parsed = JSON.parse(result);
    expect(parsed.cancelled).toBe(true);
  });
});

describe("C-level Gate Tools", () => {
  it("confirm_checkpoint triggers gate.ask with kind plan_checkpoint", async () => {
    const captured: unknown[] = [];
    const g = new PauseGate();
    g.on((req) => {
      captured.push(req);
      g.resolve(req.id, { type: "continue" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    await r.dispatch("confirm_checkpoint", {
      description: "test",
      entities: [{ type: "character", id: "叶凡" }],
    });

    expect(captured.length).toBe(1);
    expect((captured[0] as { kind: string }).kind).toBe("plan_checkpoint");
  });

  it("confirm_checkpoint on continue creates snapshot", async () => {
    const result = await reg.dispatch("confirm_checkpoint", {
      description: "after edit",
      entities: [{ type: "character", id: "叶凡" }],
    });
    const parsed = JSON.parse(result);
    expect(typeof parsed.snapshot_id).toBe("number");
  });

  it("rollback triggers gate and executes on continue", async () => {
    const snap = await reg.dispatch("confirm_checkpoint", {
      description: "pre-rollback",
      entities: [{ type: "character", id: "叶凡" }],
    });
    const { snapshot_id } = JSON.parse(snap);

    const captured: unknown[] = [];
    const g = new PauseGate();
    g.on((req) => {
      captured.push(req);
      g.resolve(req.id, { type: "continue" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    const result = await r.dispatch("rollback", { snapshot_id });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    expect(captured.length).toBe(1);
    expect((captured[0] as { kind: string }).kind).toBe("plan_checkpoint");
  });
});
