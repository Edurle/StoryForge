import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { createDbWorker, type DbWorker } from "../../db/worker.js";

export function setupTestDb() {
  let worker: DbWorker;
  let dbPath: string;

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), "sf-svc-"));
    dbPath = join(dir, "test.db");
    worker = createDbWorker(dbPath);
  });

  afterAll(() => {
    worker.close();
    try { rmSync(join(dbPath, ".."), { recursive: true, force: true }); } catch {}
  });

  return {
    get w() { return worker; },
  };
}

export async function seedSkills(w: DbWorker, skills: { name: string; content: string; category?: string }[]) {
  for (const s of skills) {
    await w.request({ id: 0, type: "run", sql: "INSERT INTO skills (name, content, category) VALUES (?, ?, ?)", params: [s.name, s.content, s.category ?? "通用"] });
  }
}

export async function seedCharacters(w: DbWorker, chars: { name: string; stage: string; custom_attrs?: string }[]) {
  for (const c of chars) {
    await w.request({
      id: 0, type: "run",
      sql: "INSERT INTO characters (name, stage, custom_attrs) VALUES (?, ?, ?)",
      params: [c.name, c.stage, c.custom_attrs ?? "{}"],
    });
  }
}

export async function seedTimeline(w: DbWorker, events: { id: string; time: string; description: string; cause_id?: string | null; characters?: string }[]) {
  for (const e of events) {
    await w.request({
      id: 0, type: "run",
      sql: "INSERT INTO timeline_events (id, time, description, cause_id, characters) VALUES (?, ?, ?, ?, ?)",
      params: [e.id, e.time, e.description, e.cause_id ?? null, e.characters ?? "[]"],
    });
  }
}

export async function seedSettings(w: DbWorker, settings: { topic: string; content: string }[]) {
  for (const s of settings) {
    await w.request({
      id: 0, type: "run",
      sql: "INSERT INTO global_constants (key, value) VALUES (?, ?)",
      params: [s.topic, s.content],
    });
  }
}

export async function seedRelations(w: DbWorker, rels: { source: string; target: string; type: string }[]) {
  for (const r of rels) {
    await w.request({
      id: 0, type: "run",
      sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'character', ?)",
      params: [r.source, r.source],
    });
    await w.request({
      id: 0, type: "run",
      sql: "INSERT OR IGNORE INTO kg_nodes (id, type, label) VALUES (?, 'character', ?)",
      params: [r.target, r.target],
    });
    await w.request({
      id: 0, type: "run",
      sql: "INSERT INTO kg_relations (source_id, target_id, type) VALUES (?, ?, ?)",
      params: [r.source, r.target, r.type],
    });
  }
}

export async function seedFormulas(w: DbWorker, formulas: { name: string; template: string; vars: string }[]) {
  for (const f of formulas) {
    await w.request({
      id: 0, type: "run",
      sql: "INSERT INTO formulas (name, template, vars) VALUES (?, ?, ?)",
      params: [f.name, f.template, f.vars],
    });
  }
}

export const STANDARD_CHARS = [
  { name: "叶凡", stage: "筑基九层", custom_attrs: JSON.stringify({ hp: 1200, spirit_power: 800, location: "天柱峰" }) },
  { name: "苏柔", stage: "炼气八层", custom_attrs: JSON.stringify({ hp: 600, spirit_power: 400, location: "青云门" }) },
  { name: "魔尊", stage: "元婴初期", custom_attrs: JSON.stringify({ hp: 5000, spirit_power: 3000, location: "魔渊" }) },
];

export const STANDARD_TIMELINE = [
  { id: "T001", time: "T+1", description: "天柱峰试炼", characters: '["叶凡","苏柔"]' },
  { id: "T002", time: "T+100", description: "天劫降临", cause_id: null, characters: '["叶凡"]' },
];

export const STANDARD_RELATIONS = [
  { source: "叶凡", target: "苏柔", type: "师兄妹" },
  { source: "叶凡", target: "魔尊", type: "敌对" },
];

export const STANDARD_FORMULAS = [
  { name: "damage", template: "skill_base * path_mult * hit_mod * (1 - target_resist)", vars: "skill_base,path_mult,hit_mod,target_resist" },
];

export const STANDARD_SKILLS = [
  { name: "battle", content: "## 战斗场景创作指南\n1. 查角色 2. 查公式 3. calculate 4. 写正文" },
  { name: "power_system", content: "## 力量体系\ndamage = skill_base * path_mult * (1 - resist)" },
];
