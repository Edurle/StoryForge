import { describe, expect, it } from "vitest";
import { setupTestDb, seedCharacters, seedTimeline, seedRelations } from "./helpers.js";
import { validateNumericConsistency, validateTimelineConsistency, validateCharacterConsistency } from "../validator.js";

describe("validateNumericConsistency — positive attrs", () => {
  const db = setupTestDb();

  it("returns empty array when all characters have positive numeric attrs", async () => {
    await seedCharacters(db.w, [
      { name: "叶凡", stage: "筑基九层", custom_attrs: '{"hp":1200,"spirit_power":800}' },
      { name: "苏柔", stage: "炼气八层", custom_attrs: '{"hp":600,"spirit_power":400}' },
    ]);
    const issues = await validateNumericConsistency(db.w);
    expect(issues).toEqual([]);
  });
});

describe("validateNumericConsistency — negative attr", () => {
  const db = setupTestDb();

  it("returns error issue for character with negative hp", async () => {
    await seedCharacters(db.w, [
      { name: "叶凡", stage: "筑基九层", custom_attrs: '{"hp":-100,"spirit_power":800}' },
    ]);
    const issues = await validateNumericConsistency(db.w);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("negative_attr");
    expect(issues[0]!.severity).toBe("error");
    expect(issues[0]!.message).toContain("叶凡");
    expect(issues[0]!.message).toContain("hp");
  });
});

describe("validateNumericConsistency — zero hp", () => {
  const db = setupTestDb();

  it("returns error issue for character with hp = 0", async () => {
    await seedCharacters(db.w, [
      { name: "苏柔", stage: "炼气八层", custom_attrs: '{"hp":0,"spirit_power":400}' },
    ]);
    const issues = await validateNumericConsistency(db.w);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("error");
    expect(issues[0]!.message).toContain("苏柔");
  });
});

describe("validateTimelineConsistency — correct order no cause", () => {
  const db = setupTestDb();

  it("returns empty array for events in correct causal order", async () => {
    await seedTimeline(db.w, [
      { id: "T001", time: "T+50", description: "修炼突破", characters: '["叶凡"]' },
      { id: "T002", time: "T+100", description: "天劫降临", characters: '["叶凡"]' },
    ]);
    const issues = await validateTimelineConsistency(db.w);
    expect(issues).toEqual([]);
  });
});

describe("validateTimelineConsistency — correct causal order", () => {
  const db = setupTestDb();

  it("returns empty array when cause event is before effect", async () => {
    await seedTimeline(db.w, [
      { id: "T001", time: "T+50", description: "修炼突破", characters: '["叶凡"]' },
      { id: "T002", time: "T+100", description: "天劫降临", cause_id: "T001", characters: '["叶凡"]' },
    ]);
    const issues = await validateTimelineConsistency(db.w);
    expect(issues).toEqual([]);
  });
});

describe("validateTimelineConsistency — causal violation", () => {
  const db = setupTestDb();

  it("returns causal_violation when effect time is before cause time", async () => {
    await seedTimeline(db.w, [
      { id: "T001", time: "T+100", description: "修炼突破", characters: '["叶凡"]' },
      { id: "T002", time: "T+50", description: "天劫降临", cause_id: "T001", characters: '["叶凡"]' },
    ]);
    const issues = await validateTimelineConsistency(db.w);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("causal_violation");
    expect(issues[0]!.severity).toBe("error");
    expect(issues[0]!.message).toContain("T002");
    expect(issues[0]!.message).toContain("T001");
  });
});

describe("validateCharacterConsistency — all alive", () => {
  const db = setupTestDb();

  it("returns empty array when all characters are alive and consistent", async () => {
    await seedCharacters(db.w, [
      { name: "叶凡", stage: "筑基九层", custom_attrs: '{"hp":1200}' },
      { name: "苏柔", stage: "炼气八层", custom_attrs: '{"hp":600}' },
    ]);
    await seedTimeline(db.w, [
      { id: "T001", time: "T+10", description: "修炼", characters: '["叶凡"]' },
    ]);
    await seedRelations(db.w, [
      { source: "叶凡", target: "苏柔", type: "师兄妹" },
    ]);
    const issues = await validateCharacterConsistency(db.w);
    expect(issues).toEqual([]);
  });
});

describe("validateCharacterConsistency — dead character activity", () => {
  const db = setupTestDb();

  it("returns dead_character_activity when dead character appears in timeline event", async () => {
    await seedCharacters(db.w, [
      { name: "叶凡", stage: "筑基九层", custom_attrs: '{"hp":1200}' },
    ]);
    await seedTimeline(db.w, [
      { id: "T001", time: "T+50", description: "大战", characters: '["叶凡"]' },
    ]);
    const issues = await validateCharacterConsistency(db.w, ["叶凡"]);
    const deadIssues = issues.filter(i => i.type === "dead_character_activity");
    expect(deadIssues).toHaveLength(1);
    expect(deadIssues[0]!.severity).toBe("error");
    expect(deadIssues[0]!.message).toContain("叶凡");
  });
});

describe("validateCharacterConsistency — missing character ref", () => {
  const db = setupTestDb();

  it("returns missing_character_ref when relation references nonexistent character", async () => {
    await seedCharacters(db.w, [
      { name: "叶凡", stage: "筑基九层", custom_attrs: '{"hp":1200}' },
    ]);
    await seedRelations(db.w, [
      { source: "叶凡", target: "不存在的角色", type: "敌对" },
    ]);
    const issues = await validateCharacterConsistency(db.w);
    const refIssues = issues.filter(i => i.type === "missing_character_ref");
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0]!.severity).toBe("warning");
    expect(refIssues[0]!.message).toContain("不存在的角色");
  });
});
