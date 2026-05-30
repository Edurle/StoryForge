import type { DbWorker } from "../db/worker.js";

export async function loadSkill(w: DbWorker, name: string): Promise<string | null> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT content FROM skills WHERE name = ?",
    params: [name],
  });
  if (!res.ok || !res.data) return null;
  const rows = res.data as { content: string }[];
  return rows[0]?.content ?? null;
}

export async function saveSkill(w: DbWorker, name: string, content: string, description?: string, category?: string): Promise<void> {
  const desc = description ?? "";
  const cat = category ?? "通用";
  await w.request({
    id: 0,
    type: "run",
    sql: `INSERT INTO skills (name, content, description, category) VALUES (?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET content = excluded.content, description = excluded.description, category = excluded.category, updated_at = datetime('now')`,
    params: [name, content, desc, cat],
  });
}

export async function listSkills(w: DbWorker, category?: string): Promise<{ name: string; description: string; category: string }[]> {
  let sql = "SELECT name, description, category FROM skills";
  const params: unknown[] = [];
  if (category) {
    sql += " WHERE category = ?";
    params.push(category);
  }
  sql += " ORDER BY name";
  const res = await w.request({ id: 0, type: "query", sql, params });
  if (!res.ok || !res.data) return [];
  return res.data as { name: string; description: string; category: string }[];
}

export async function deleteSkill(w: DbWorker, name: string): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "DELETE FROM skills WHERE name = ?",
    params: [name],
  });
}
