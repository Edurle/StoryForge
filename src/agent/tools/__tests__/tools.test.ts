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
  it("registers all 19 tools", () => {
    expect(reg.size).toBe(19);
  });

  it("specs returns all with type function and non-empty name", () => {
    const specs = reg.specs();
    expect(specs.length).toBe(19);
    for (const spec of specs) {
      expect(spec.type).toBe("function");
      expect(spec.function.name).toBeTruthy();
    }
  });
});

describe("A-level Query Tools", () => {
  it("query_character with seeded data returns character JSON", async () => {
    const result = await reg.dispatch("character", { action: "query", name: "叶凡" });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("叶凡");
    expect(parsed.stage).toBe("筑基九层");
    expect(parsed.attrs.hp).toBe(1200);
  });

  it("query_characters with no filter returns all 3 characters", async () => {
    const result = await reg.dispatch("character", { action: "list" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(3);
    const names = parsed.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(["叶凡", "苏柔", "魔尊"]);
  });

  it("query_setting with seeded constant returns content", async () => {
    const result = await reg.dispatch("setting", { action: "query", key: "world_rules" });
    const parsed = JSON.parse(result);
    expect(parsed.topic).toBe("world_rules");
    expect(parsed.content).toBe("修仙界通用规则");
  });

  it("query_timeline with range returns filtered events", async () => {
    const result = await reg.dispatch("timeline", { action: "query", from: "T+0", to: "T+50" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("T001");
  });

  it("query_relations for 叶凡 returns 2 relations", async () => {
    const result = await reg.dispatch("character", { action: "relations", name: "叶凡" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(2);
  });

  it("query_formulas returns damage formula", async () => {
    const result = await reg.dispatch("formula", { action: "list" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("damage");
  });

  it("query_project_status returns counts", async () => {
    const result = await reg.dispatch("project_status", {});
    const parsed = JSON.parse(result);
    expect(parsed.characters).toBe(3);
    expect(parsed.timeline_events).toBe(2);
    expect(parsed.formulas).toBe(1);
  });
});

describe("A-level Skill Tools", () => {
  it("skill get with seeded skill returns content", async () => {
    const result = await reg.dispatch("skill", { action: "get", name: "battle" });
    const parsed = JSON.parse(result);
    expect(parsed.content).toContain("战斗场景创作指南");
  });

  it("skill get with nonexistent returns error JSON", async () => {
    const result = await reg.dispatch("skill", { action: "get", name: "nonexistent" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeTruthy();
  });

  it("skill list returns seeded skills", async () => {
    const result = await reg.dispatch("skill", { action: "list" });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    const names = parsed.map((s: { name: string }) => s.name);
    expect(names).toContain("battle");
    expect(names).toContain("power_system");
  });
});

describe("B-level Skill Gate Tools", () => {
  it("skill save creates a new skill (gate approves)", async () => {
    const result = await reg.dispatch("skill", {
      action: "save",
      name: "new_skill",
      content: "test content",
      description: "a test skill",
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const verify = await reg.dispatch("skill", { action: "get", name: "new_skill" });
    const v = JSON.parse(verify);
    expect(v.content).toBe("test content");
  });

  it("skill save with category", async () => {
    const result = await reg.dispatch("skill", {
      action: "save",
      name: "xuanhuan_skill",
      content: "玄幻内容",
      description: "玄幻技能",
      category: "玄幻",
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const list = await reg.dispatch("skill", { action: "list", category: "玄幻" });
    const skills = JSON.parse(list);
    expect(skills.some((s: { name: string }) => s.name === "xuanhuan_skill")).toBe(true);
  });

  it("skill delete removes a skill (gate approves)", async () => {
    await reg.dispatch("skill", { action: "save", name: "to_delete", content: "bye" });
    const result = await reg.dispatch("skill", { action: "delete", name: "to_delete" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const verify = await reg.dispatch("skill", { action: "get", name: "to_delete" });
    const v = JSON.parse(verify);
    expect(v.error).toBeTruthy();
  });

  it("skill save cancel returns cancelled true", async () => {
    const g = new PauseGate();
    g.on((req) => {
      g.resolve(req.id, { type: "cancel" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    const result = await r.dispatch("skill", { action: "save", name: "cancelled_skill", content: "nope" });
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
  it("character edit triggers gate.ask with kind plan_proposed", async () => {
    const captured: unknown[] = [];
    const g = new PauseGate();
    g.on((req) => {
      captured.push(req);
      g.resolve(req.id, { type: "approve" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    await r.dispatch("character", { action: "edit", name: "叶凡", stage: "金丹" });

    expect(captured.length).toBe(1);
    expect((captured[0] as { kind: string }).kind).toBe("plan_proposed");
  });

  it("character edit approve succeeds and updates db", async () => {
    const result = await reg.dispatch("character", { action: "edit", name: "叶凡", stage: "金丹" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const verify = await reg.dispatch("character", { action: "query", name: "叶凡" });
    const v = JSON.parse(verify);
    expect(v.stage).toBe("金丹");
  });

  it("character edit cancel returns cancelled true", async () => {
    const g = new PauseGate();
    g.on((req) => {
      g.resolve(req.id, { type: "cancel" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    const result = await r.dispatch("character", { action: "edit", name: "叶凡", stage: "化神" });
    const parsed = JSON.parse(result);
    expect(parsed.cancelled).toBe(true);
  });
});

describe("C-level Gate Tools", () => {
  it("snapshot create triggers gate.ask with kind plan_checkpoint", async () => {
    const captured: unknown[] = [];
    const g = new PauseGate();
    g.on((req) => {
      captured.push(req);
      g.resolve(req.id, { type: "continue" });
    });
    const r = createToolRegistry({ db: testDb.w, gate: g });

    await r.dispatch("snapshot", {
      action: "create",
      description: "test",
      entities: [{ type: "character", id: "叶凡" }],
    });

    expect(captured.length).toBe(1);
    expect((captured[0] as { kind: string }).kind).toBe("plan_checkpoint");
  });

  it("snapshot create on continue creates snapshot", async () => {
    const result = await reg.dispatch("snapshot", {
      action: "create",
      description: "after edit",
      entities: [{ type: "character", id: "叶凡" }],
    });
    const parsed = JSON.parse(result);
    expect(typeof parsed.snapshot_id).toBe("number");
  });

  it("snapshot rollback triggers gate and executes on continue", async () => {
    const snap = await reg.dispatch("snapshot", {
      action: "create",
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

    const result = await r.dispatch("snapshot", { action: "rollback", snapshot_id });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    expect(captured.length).toBe(1);
    expect((captured[0] as { kind: string }).kind).toBe("plan_checkpoint");
  });
});
