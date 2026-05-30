import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers.js";
import { loadSkill, saveSkill, listSkills, deleteSkill } from "../skills.js";

describe("skills — save then load", () => {
  const db = setupTestDb();

  it("save then load returns content", async () => {
    await saveSkill(db.w, "battle", "## 战斗指南\n1. 查角色");
    const content = await loadSkill(db.w, "battle");
    expect(content).toBe("## 战斗指南\n1. 查角色");
  });

  it("load nonexistent returns null", async () => {
    const content = await loadSkill(db.w, "nonexistent");
    expect(content).toBeNull();
  });

  it("list returns all saved skills", async () => {
    await saveSkill(db.w, "battle", "content1");
    await saveSkill(db.w, "power_system", "content2");
    const list = await listSkills(db.w);
    expect(list).toHaveLength(2);
    const names = list.map(s => s.name).sort();
    expect(names).toEqual(["battle", "power_system"]);
  });

  it("delete then load returns null", async () => {
    await saveSkill(db.w, "battle", "content");
    await deleteSkill(db.w, "battle");
    const content = await loadSkill(db.w, "battle");
    expect(content).toBeNull();
  });

  it("save overwrites existing skill (upsert)", async () => {
    await saveSkill(db.w, "battle", "v1");
    await saveSkill(db.w, "battle", "v2");
    const content = await loadSkill(db.w, "battle");
    expect(content).toBe("v2");
  });

  it("save with optional description", async () => {
    await saveSkill(db.w, "battle", "content", "战斗场景指南");
    const list = await listSkills(db.w);
    expect(list[0]!.description).toBe("战斗场景指南");
  });

  it("save skill with category", async () => {
    await saveSkill(db.w, "xuanhuan_skill", "content", "desc", "玄幻");
    const list = await listSkills(db.w);
    const skill = list.find(s => s.name === "xuanhuan_skill");
    expect(skill).toBeDefined();
    expect(skill!.category).toBe("玄幻");
  });

  it("save skill without category defaults to 通用", async () => {
    await saveSkill(db.w, "default_cat", "content");
    const list = await listSkills(db.w);
    const skill = list.find(s => s.name === "default_cat");
    expect(skill).toBeDefined();
    expect(skill!.category).toBe("通用");
  });

  it("listSkills with category filter only returns matching skills", async () => {
    await saveSkill(db.w, "filter_a", "c1", "d1", "玄幻");
    await saveSkill(db.w, "filter_b", "c2", "d2", "网游");
    await saveSkill(db.w, "filter_c", "c3", "d3");

    const xuanhuan = await listSkills(db.w, "玄幻");
    expect(xuanhuan.every(s => s.category === "玄幻")).toBe(true);
    expect(xuanhuan.some(s => s.name === "filter_a")).toBe(true);
    expect(xuanhuan.some(s => s.name === "filter_b")).toBe(false);

    const tongyong = await listSkills(db.w, "通用");
    expect(tongyong.every(s => s.category === "通用")).toBe(true);
  });
});
