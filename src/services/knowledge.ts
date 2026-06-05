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
  tag: string;
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
    sql: "SELECT key, value, tag FROM global_constants WHERE key = ?",
    params: [topic],
  });
  if (!res.ok || !res.data) return null;
  const rows = res.data as { key: string; value: string; tag: string }[];
  const row = rows[0];
  if (!row) return null;
  return { topic: row.key, content: row.value, tag: row.tag };
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

export interface ItemResult {
  name: string;
  type: string;
  attrs: Record<string, unknown>;
}

export async function queryItems(w: DbWorker): Promise<ItemResult[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name, type, custom_attrs FROM items ORDER BY name",
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { name: string; type: string; custom_attrs: string }[];
  return rows.map(row => ({
    name: row.name,
    type: row.type,
    attrs: JSON.parse(row.custom_attrs) as Record<string, unknown>,
  }));
}

export interface FactionResult {
  name: string;
  description: string;
  attrs: Record<string, unknown>;
}

export async function queryFactions(w: DbWorker): Promise<FactionResult[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name, description, custom_attrs FROM factions ORDER BY name",
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { name: string; description: string; custom_attrs: string }[];
  return rows.map(row => ({
    name: row.name,
    description: row.description,
    attrs: JSON.parse(row.custom_attrs) as Record<string, unknown>,
  }));
}

export interface LocationResult {
  name: string;
  description: string;
  attrs: Record<string, unknown>;
}

export async function queryLocations(w: DbWorker): Promise<LocationResult[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name, description, custom_attrs FROM locations ORDER BY name",
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { name: string; description: string; custom_attrs: string }[];
  return rows.map(row => ({
    name: row.name,
    description: row.description,
    attrs: JSON.parse(row.custom_attrs) as Record<string, unknown>,
  }));
}

export async function queryAllSettings(w: DbWorker): Promise<SettingResult[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT key, value, tag FROM global_constants ORDER BY tag, key",
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { key: string; value: string; tag: string }[];
  return rows.map(row => ({ topic: row.key, content: row.value, tag: row.tag }));
}

export async function queryAllTimeline(w: DbWorker): Promise<TimelineEvent[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id, time, description, characters FROM timeline_events ORDER BY time",
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

export interface ChapterSummary {
  id: number;
  volume: number;
  title: string;
  status: string;
  segmentCount: number;
}

export async function queryChapters(w: DbWorker): Promise<ChapterSummary[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: `SELECT c.id, c.volume, c.title, c.status, COUNT(s.id) AS segment_count
      FROM chapters c LEFT JOIN segments s ON s.chapter_id = c.id
      GROUP BY c.id ORDER BY c.volume, c.id`,
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as { id: number; volume: number; title: string; status: string; segment_count: number }[];
  return rows.map(row => ({
    id: row.id,
    volume: row.volume,
    title: row.title,
    status: row.status,
    segmentCount: row.segment_count,
  }));
}

export async function queryChapterSegments(w: DbWorker, chapterId: number): Promise<Array<{ id: number; seq: number; content: string }>> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id, seq, content FROM segments WHERE chapter_id = ? ORDER BY seq, id",
    params: [chapterId],
  });
  if (!res.ok || !res.data) return [];
  return res.data as Array<{ id: number; seq: number; content: string }>;
}

export async function reorderSegments(w: DbWorker, chapterId: number, orderedIds: number[]): Promise<void> {
  const stmts = orderedIds.map((id, idx) =>
    w.request({ id: 0, type: "run", sql: "UPDATE segments SET seq = ? WHERE id = ? AND chapter_id = ?", params: [idx, id, chapterId] })
  );
  await Promise.all(stmts);
}

export async function queryChapterContent(w: DbWorker, chapterId: number): Promise<string> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT content FROM segments WHERE chapter_id = ? ORDER BY seq, id",
    params: [chapterId],
  });
  if (!res.ok || !res.data) return "";
  const rows = res.data as { content: string }[];
  return rows.map(row => row.content).join("\n\n");
}

export interface KgNodeRow {
  id: string;
  type: string;
  label: string;
}

export interface KgRelationRow {
  source_id: string;
  target_id: string;
  type: string;
  source_label: string;
  target_label: string;
}

export async function queryKgNodes(w: DbWorker): Promise<KgNodeRow[]> {
  const res = await w.request({
    id: 0, type: "query",
    sql: "SELECT id, type, label FROM kg_nodes ORDER BY type, label",
  });
  if (!res.ok || !res.data) return [];
  return res.data as KgNodeRow[];
}

export async function queryKgRelations(w: DbWorker): Promise<KgRelationRow[]> {
  const res = await w.request({
    id: 0, type: "query",
    sql: "SELECT r.source_id, r.target_id, r.type, n1.label AS source_label, n2.label AS target_label FROM kg_relations r LEFT JOIN kg_nodes n1 ON r.source_id = n1.id LEFT JOIN kg_nodes n2 ON r.target_id = n2.id ORDER BY r.type",
  });
  if (!res.ok || !res.data) return [];
  return res.data as KgRelationRow[];
}

export async function queryKgGraph(w: DbWorker): Promise<{ nodes: KgNodeRow[]; edges: KgRelationRow[] }> {
  const [nodes, edges] = await Promise.all([queryKgNodes(w), queryKgRelations(w)]);
  return { nodes, edges };
}
