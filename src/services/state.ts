import type { DbWorker } from "../db/worker.js";

export interface EntityRef {
  type: string;
  id: string;
}

export async function createSnapshot(
  w: DbWorker,
  description: string,
  affectedEntities: EntityRef[],
): Promise<number> {
  const insertRes = await w.request({
    id: 0,
    type: "query",
    sql: "INSERT INTO snapshots (description) VALUES (?) RETURNING id",
    params: [description],
  });
  if (!insertRes.ok || !insertRes.data) {
    throw new Error(`Failed to create snapshot: ${insertRes.error}`);
  }
  const snapshotId = (insertRes.data as Array<{ id: number }>)[0]!.id;

  for (const entity of affectedEntities) {
    let attrsJson = "{}";

    if (entity.type === "character") {
      const res = await w.request({
        id: 0,
        type: "query",
        sql: "SELECT custom_attrs FROM characters WHERE name = ?",
        params: [entity.id],
      });
      if (!res.ok) throw new Error(`Failed to query character: ${res.error}`);
      const rows = res.data as Array<{ custom_attrs: string }>;
      if (rows.length > 0) {
        attrsJson = rows[0]!.custom_attrs;
      }
    }

    const entRes = await w.request({
      id: 0,
      type: "run",
      sql: "INSERT INTO snapshot_entities (snapshot_id, entity_type, entity_id, attrs_json) VALUES (?, ?, ?, ?)",
      params: [snapshotId, entity.type, entity.id, attrsJson],
    });
    if (!entRes.ok) {
      throw new Error(`Failed to insert snapshot entity: ${entRes.error}`);
    }
  }

  return snapshotId;
}

export async function rollbackToSnapshot(
  w: DbWorker,
  snapshotId: number,
): Promise<void> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT entity_type, entity_id, attrs_json FROM snapshot_entities WHERE snapshot_id = ?",
    params: [snapshotId],
  });
  if (!res.ok) {
    throw new Error(`Failed to query snapshot entities: ${res.error}`);
  }

  const entities = res.data as Array<{
    entity_type: string;
    entity_id: string;
    attrs_json: string;
  }>;
  if (entities.length === 0) return;

  const sqls: string[] = [];
  for (const entity of entities) {
    const escapedAttrs = entity.attrs_json.replace(/'/g, "''");
    const escapedId = entity.entity_id.replace(/'/g, "''");

    if (entity.entity_type === "character") {
      sqls.push(
        `UPDATE characters SET custom_attrs = '${escapedAttrs}' WHERE name = '${escapedId}'`,
      );
    }
  }

  if (sqls.length > 0) {
    const batchRes = await w.request({ id: 0, type: "batch", sql: sqls });
    if (!batchRes.ok) {
      throw new Error(`Failed to rollback snapshot: ${batchRes.error}`);
    }
  }
}

export async function listSnapshots(
  w: DbWorker,
): Promise<Array<{ id: number; description: string; created_at: string }>> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id, description, created_at FROM snapshots ORDER BY id DESC",
  });
  if (!res.ok) {
    throw new Error(`Failed to list snapshots: ${res.error}`);
  }
  return res.data as Array<{ id: number; description: string; created_at: string }>;
}
