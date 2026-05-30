import type { DbWorker } from "../db/worker.js";

export interface CharacterResult {
  name: string;
  stage: string;
  attrs: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  time: string;
  description: string;
  characters: string[];
}

export interface RelationResult {
  target: string;
  type: string;
}

export interface SettingResult {
  topic: string;
  content: string;
}

export interface FormulaResult {
  name: string;
  template: string;
  vars: string;
}

export async function queryCharacter(w: DbWorker, name: string): Promise<CharacterResult | null> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name, stage, custom_attrs FROM characters WHERE name = ?",
    params: [name],
  });
  if (!res.ok || !res.data) return null;
  const rows = res.data as { name: string; stage: string; custom_attrs: string }[];
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    stage: row.stage,
    attrs: JSON.parse(row.custom_attrs) as Record<string, unknown>,
  };
}

export async function queryCharacters(w: DbWorker, filter?: { stage: string }): Promise<CharacterResult[]> {
  let sql = "SELECT name, stage, custom_attrs FROM characters";
  const params: unknown[] = [];
  if (filter) {
    sql += " WHERE stage = ?";
    params.push(filter.stage);
  }
  sql += " ORDER BY name";
  const res = await w.request({ id: 0, type: "query", sql, params });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { name: string; stage: string; custom_attrs: string }[];
  return rows.map(row => ({
    name: row.name,
    stage: row.stage,
    attrs: JSON.parse(row.custom_attrs) as Record<string, unknown>,
  }));
}

export async function querySetting(w: DbWorker, topic: string): Promise<SettingResult | null> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT key, value FROM global_constants WHERE key = ?",
    params: [topic],
  });
  if (!res.ok || !res.data) return null;
  const rows = res.data as { key: string; value: string }[];
  const row = rows[0];
  if (!row) return null;
  return { topic: row.key, content: row.value };
}

export async function queryTimeline(w: DbWorker, range: { from: string; to: string }): Promise<TimelineEvent[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id, time, description, characters FROM timeline_events WHERE CAST(SUBSTR(time, 3) AS INTEGER) >= CAST(SUBSTR(?, 3) AS INTEGER) AND CAST(SUBSTR(time, 3) AS INTEGER) <= CAST(SUBSTR(?, 3) AS INTEGER) ORDER BY time",
    params: [range.from, range.to],
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { id: string; time: string; description: string; characters: string }[];
  return rows.map(row => ({
    id: row.id,
    time: row.time,
    description: row.description,
    characters: JSON.parse(row.characters) as string[],
  }));
}

export async function queryRelations(w: DbWorker, character: string): Promise<RelationResult[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT target_id, type FROM kg_relations WHERE source_id = ?",
    params: [character],
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { target_id: string; type: string }[];
  return rows.map(row => ({
    target: row.target_id,
    type: row.type,
  }));
}

export async function queryFormulas(w: DbWorker): Promise<FormulaResult[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name, template, vars FROM formulas ORDER BY name",
  });
  if (!res.ok || !res.data) return [];
  return res.data as FormulaResult[];
}
