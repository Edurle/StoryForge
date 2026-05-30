import { describe, expect, it } from "vitest";
import { setupTestDb, seedCharacters, seedTimeline, seedSettings, seedRelations, seedFormulas, STANDARD_CHARS, STANDARD_TIMELINE, STANDARD_RELATIONS, STANDARD_FORMULAS } from "./helpers.js";
import { queryCharacter, queryCharacters, querySetting, queryTimeline, queryRelations, queryFormulas } from "../knowledge.js";

describe("knowledge — queryCharacter", () => {
  const db = setupTestDb();

  it("returns character with parsed attrs", async () => {
    await seedCharacters(db.w, STANDARD_CHARS);
    const ch = await queryCharacter(db.w, "叶凡");
    expect(ch).not.toBeNull();
    expect(ch!.name).toBe("叶凡");
    expect(ch!.stage).toBe("筑基九层");
    expect(ch!.attrs).toEqual({ hp: 1200, spirit_power: 800, location: "天柱峰" });
  });

  it("returns null for nonexistent character", async () => {
    const ch = await queryCharacter(db.w, "不存在的角色");
    expect(ch).toBeNull();
  });
});

describe("knowledge — queryCharacters", () => {
  const db = setupTestDb();

  it("returns all characters with no filter", async () => {
    await seedCharacters(db.w, STANDARD_CHARS);
    const list = await queryCharacters(db.w);
    expect(list).toHaveLength(3);
    const names = list.map(c => c.name).sort();
    expect(names).toEqual(["叶凡", "苏柔", "魔尊"].sort());
  });

  it("filters by stage", async () => {
    const list = await queryCharacters(db.w, { stage: "筑基九层" });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("叶凡");
  });
});

describe("knowledge — querySetting", () => {
  const db = setupTestDb();

  it("returns content from global_constants", async () => {
    await seedSettings(db.w, [
      { topic: "world_rules", content: "灵气复苏，修仙为尊" },
    ]);
    const s = await querySetting(db.w, "world_rules");
    expect(s).not.toBeNull();
    expect(s!.topic).toBe("world_rules");
    expect(s!.content).toBe("灵气复苏，修仙为尊");
  });

  it("returns null for nonexistent topic", async () => {
    const s = await querySetting(db.w, "nonexistent");
    expect(s).toBeNull();
  });
});

describe("knowledge — queryTimeline (information security)", () => {
  const db = setupTestDb();

  it("returns only events within range [T+0, T+50], excludes T+100", async () => {
    await seedTimeline(db.w, STANDARD_TIMELINE);
    const events = await queryTimeline(db.w, { from: "T+0", to: "T+50" });
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe("T001");
    expect(events[0]!.time).toBe("T+1");
    expect(events[0]!.description).toBe("天柱峰试炼");
    expect(events[0]!.characters).toEqual(["叶凡", "苏柔"]);
  });

  it("returns both events within wide range [T+0, T+200]", async () => {
    const events = await queryTimeline(db.w, { from: "T+0", to: "T+200" });
    expect(events).toHaveLength(2);
    const ids = events.map(e => e.id).sort();
    expect(ids).toEqual(["T001", "T002"]);
  });

  it("returns empty for range with no events", async () => {
    const events = await queryTimeline(db.w, { from: "T+500", to: "T+600" });
    expect(events).toHaveLength(0);
  });
});

describe("knowledge — queryRelations (information security)", () => {
  const db = setupTestDb();

  it("returns only direct relations for character, never transitive", async () => {
    await seedRelations(db.w, STANDARD_RELATIONS);
    await seedRelations(db.w, [{ source: "苏柔", target: "魔尊", type: "同门" }]);
    const rels = await queryRelations(db.w, "叶凡");
    expect(rels).toHaveLength(2);
    const targets = rels.map(r => r.target).sort();
    expect(targets).toEqual(["苏柔", "魔尊"].sort());
  });

  it("returns only direct depth-1 relations even if chain exists", async () => {
    const rels = await queryRelations(db.w, "苏柔");
    expect(rels).toHaveLength(1);
    expect(rels[0]!.target).toBe("魔尊");
    expect(rels[0]!.type).toBe("同门");
  });

  it("returns empty for character with no relations", async () => {
    const rels = await queryRelations(db.w, "魔尊");
    expect(rels).toHaveLength(0);
  });
});

describe("knowledge — queryFormulas", () => {
  const db = setupTestDb();

  it("returns all formulas", async () => {
    await seedFormulas(db.w, STANDARD_FORMULAS);
    const list = await queryFormulas(db.w);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("damage");
    expect(list[0]!.template).toBe("skill_base * path_mult * hit_mod * (1 - target_resist)");
    expect(list[0]!.vars).toBe("skill_base,path_mult,hit_mod,target_resist");
  });
});
