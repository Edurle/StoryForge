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
  it("registers at least 19 tools", () => {
    expect(reg.size).toBeGreaterThanOrEqual(19);
  });

  it("specs returns all with type function and non-empty name", () => {
    const specs = reg.specs();
    expect(specs.length).toBeGreaterThanOrEqual(19);
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

describe("Create returns ID", () => {
  it("chapter create returns id", async () => {
    const result = await reg.dispatch("chapter", { action: "create", title: "ID测试章", volume: 1 });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(typeof parsed.id).toBe("number");
  });

  it("segment create returns id and auto seq", async () => {
    const chRes = await reg.dispatch("chapter", { action: "create", title: "Seq测试章" });
    const ch = JSON.parse(chRes);
    const s1 = await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "第一段" });
    const p1 = JSON.parse(s1);
    expect(p1.success).toBe(true);
    expect(typeof p1.id).toBe("number");
    expect(p1.seq).toBe(0);
    const s2 = await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "第二段" });
    const p2 = JSON.parse(s2);
    expect(p2.seq).toBe(1);
  });

  it("character create returns name", async () => {
    const result = await reg.dispatch("character", { action: "create", name: "ID测试角色" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe("ID测试角色");
  });
});

describe("List, Query and Insert actions", () => {
  it("chapter list returns array with id", async () => {
    const result = await reg.dispatch("chapter", { action: "list" });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("title");
  });

  it("chapter query returns detail with segments", async () => {
    const list = JSON.parse(await reg.dispatch("chapter", { action: "list" }));
    const first = list[0];
    const result = JSON.parse(await reg.dispatch("chapter", { action: "query", id: first.id }));
    expect(result.id).toBe(first.id);
    expect(Array.isArray(result.segments)).toBe(true);
  });

  it("segment list requires chapter_id", async () => {
    const result = JSON.parse(await reg.dispatch("segment", { action: "list" }));
    expect(result.error).toBeTruthy();
  });

  it("segment list by chapter_id returns ordered", async () => {
    const ch = JSON.parse(await reg.dispatch("chapter", { action: "create", title: "有序章" }));
    await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "段A" });
    await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "段B" });
    const result = JSON.parse(await reg.dispatch("segment", { action: "list", chapter_id: ch.id }));
    expect(result.length).toBe(2);
    expect(result[0].seq).toBeLessThan(result[1].seq);
  });

  it("segment insert shifts subsequent seq", async () => {
    const ch = JSON.parse(await reg.dispatch("chapter", { action: "create", title: "插入章" }));
    const s1 = JSON.parse(await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "原段1" }));
    const s2 = JSON.parse(await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "原段2" }));
    const inserted = JSON.parse(await reg.dispatch("segment", { action: "insert", chapter_id: ch.id, after_id: s1.id, content: "插入段" }));
    expect(inserted.success).toBe(true);
    const list = JSON.parse(await reg.dispatch("segment", { action: "list", chapter_id: ch.id }));
    expect(list.length).toBe(3);
    const byId = (id: number) => list.find((s: { id: number }) => s.id === id);
    expect(byId(s1.id).seq).toBe(0);
    expect(byId(inserted.id).seq).toBe(1);
    expect(byId(s2.id).seq).toBe(2);
  });

  it("segment query returns full detail", async () => {
    const ch = JSON.parse(await reg.dispatch("chapter", { action: "create", title: "详情章" }));
    const seg = JSON.parse(await reg.dispatch("segment", { action: "create", chapter_id: ch.id, content: "详细内容" }));
    const result = JSON.parse(await reg.dispatch("segment", { action: "query", id: seg.id }));
    expect(result.content).toBe("详细内容");
    expect(result).toHaveProperty("characters");
  });

  it("outline list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("outline", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("outline create and query returns detail", async () => {
    const created = JSON.parse(await reg.dispatch("outline", { action: "create", title: "测试大纲" }));
    expect(created.success).toBe(true);
    expect(typeof created.id).toBe("number");
    const detail = JSON.parse(await reg.dispatch("outline", { action: "query", id: created.id }));
    expect(detail.title).toBe("测试大纲");
    expect(detail).toHaveProperty("summary");
  });

  it("script list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("script", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("script create and query returns detail", async () => {
    const created = JSON.parse(await reg.dispatch("script", { action: "create", scene_id: "test_scene_1", content: "测试脚本" }));
    expect(created.success).toBe(true);
    expect(typeof created.id).toBe("number");
    const detail = JSON.parse(await reg.dispatch("script", { action: "query", scene_id: "test_scene_1" }));
    expect(detail.content).toBe("测试脚本");
  });
});

describe("List query completion", () => {
  it("timeline list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("timeline", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("item create and query", async () => {
    await reg.dispatch("item", { action: "create", name: "测试剑", type: "武器" });
    const list = JSON.parse(await reg.dispatch("item", { action: "list" }));
    expect(Array.isArray(list)).toBe(true);
    const detail = JSON.parse(await reg.dispatch("item", { action: "query", name: "测试剑" }));
    expect(detail.name).toBe("测试剑");
    expect(detail.type).toBe("武器");
  });

  it("faction create and query", async () => {
    await reg.dispatch("faction", { action: "create", name: "测试宗" });
    const list = JSON.parse(await reg.dispatch("faction", { action: "list" }));
    expect(Array.isArray(list)).toBe(true);
    const detail = JSON.parse(await reg.dispatch("faction", { action: "query", name: "测试宗" }));
    expect(detail.name).toBe("测试宗");
  });

  it("location create and query", async () => {
    await reg.dispatch("location", { action: "create", name: "测试山" });
    const list = JSON.parse(await reg.dispatch("location", { action: "list" }));
    expect(Array.isArray(list)).toBe(true);
    const detail = JSON.parse(await reg.dispatch("location", { action: "query", name: "测试山" }));
    expect(detail.name).toBe("测试山");
  });

  it("setting list returns array", async () => {
    const result = JSON.parse(await reg.dispatch("setting", { action: "list" }));
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Knowledge graph auto-sync and query", () => {
  it("character create auto-creates kg_node", async () => {
    await reg.dispatch("character", { action: "create", name: "图谱角色" });
    const nodes = JSON.parse(await reg.dispatch("kg", { action: "list_nodes" }));
    const found = nodes.find((n: { id: string }) => n.id === "图谱角色");
    expect(found).toBeTruthy();
    expect(found.type).toBe("character");
  });

  it("item create auto-creates kg_node", async () => {
    await reg.dispatch("item", { action: "create", name: "图谱物品", type: "道具" });
    const nodes = JSON.parse(await reg.dispatch("kg", { action: "list_nodes" }));
    const found = nodes.find((n: { id: string }) => n.id === "图谱物品");
    expect(found).toBeTruthy();
    expect(found.type).toBe("item");
  });

  it("kg list_nodes with type filter", async () => {
    const result = JSON.parse(await reg.dispatch("kg", { action: "list_nodes", type: "character" }));
    expect(Array.isArray(result)).toBe(true);
    for (const n of result) {
      expect(n.type).toBe("character");
    }
  });

  it("kg list_relations returns array", async () => {
    const result = JSON.parse(await reg.dispatch("kg", { action: "list_relations" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("kg query_node returns detail with relations", async () => {
    await reg.dispatch("kg", { action: "create_relation", source_id: "图谱角色", target_id: "图谱物品", type: "持有" });
    const result = JSON.parse(await reg.dispatch("kg", { action: "query_node", id: "图谱角色" }));
    expect(result.id).toBe("图谱角色");
    expect(Array.isArray(result.outgoing)).toBe(true);
    expect(Array.isArray(result.incoming)).toBe(true);
    const holdRel = result.outgoing.find((r: { type: string }) => r.type === "持有");
    expect(holdRel).toBeTruthy();
    expect(holdRel.related_id).toBe("图谱物品");
  });
});
