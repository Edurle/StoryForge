import type { DbWorker } from "../db/worker.js";

export interface ValidationIssue {
  type: string;
  severity: "error" | "warning";
  message: string;
}

export async function validateNumericConsistency(w: DbWorker): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name, custom_attrs FROM characters",
  });
  if (!res.ok || !res.data) return issues;

  const rows = res.data as { name: string; custom_attrs: string }[];
  for (const row of rows) {
    const attrs = JSON.parse(row.custom_attrs) as Record<string, unknown>;
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === "number" && value <= 0) {
        issues.push({
          type: "negative_attr",
          severity: "error",
          message: `角色 "${row.name}" 的属性 "${key}" 值为 ${value}（应为正数）`,
        });
      }
    }
  }

  return issues;
}

export async function validateTimelineConsistency(w: DbWorker): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id, time, cause_id FROM timeline_events",
  });
  if (!res.ok || !res.data) return issues;

  const rows = res.data as { id: string; time: string; cause_id: string | null }[];
  const eventMap = new Map<string, string>();
  for (const row of rows) {
    eventMap.set(row.id, row.time);
  }

  for (const row of rows) {
    if (!row.cause_id) continue;
    const causeTime = eventMap.get(row.cause_id);
    if (!causeTime) continue;

    const effectNum = parseTime(row.time);
    const causeNum = parseTime(causeTime);
    if (effectNum < causeNum) {
      issues.push({
        type: "causal_violation",
        severity: "error",
        message: `事件 "${row.id}"（${row.time}）由 "${row.cause_id}"（${causeTime}）引发，但时间顺序颠倒`,
      });
    }
  }

  return issues;
}

export async function validateCharacterConsistency(
  w: DbWorker,
  deadCharacters?: string[],
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  if (deadCharacters && deadCharacters.length > 0) {
    const deadSet = new Set(deadCharacters);
    const res = await w.request({
      id: 0,
      type: "query",
      sql: "SELECT id, characters FROM timeline_events",
    });
    if (res.ok && res.data) {
      const rows = res.data as { id: string; characters: string }[];
      for (const row of rows) {
        const chars = JSON.parse(row.characters) as string[];
        for (const ch of chars) {
          if (deadSet.has(ch)) {
            issues.push({
              type: "dead_character_activity",
              severity: "error",
              message: `已死亡角色 "${ch}" 仍出现在时间线事件 "${row.id}" 中`,
            });
          }
        }
      }
    }
  }

  const charRes = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT name FROM characters",
  });
  const charNames = new Set<string>();
  if (charRes.ok && charRes.data) {
    const rows = charRes.data as { name: string }[];
    for (const row of rows) {
      charNames.add(row.name);
    }
  }

  const relRes = await w.request({
    id: 0,
    type: "query",
    sql: `SELECT r.source_id, r.target_id FROM kg_relations r JOIN kg_nodes n ON r.source_id = n.id WHERE n.type = 'character' AND r.target_id NOT IN (SELECT name FROM characters)`,
  });
  if (relRes.ok && relRes.data) {
    const rows = relRes.data as { source_id: string; target_id: string }[];
    const reported = new Set<string>();
    for (const row of rows) {
      if (!reported.has(row.target_id)) {
        reported.add(row.target_id);
        issues.push({
          type: "missing_character_ref",
          severity: "warning",
          message: `关系引用了不存在的角色 "${row.target_id}"`,
        });
      }
    }
  }

  return issues;
}

function parseTime(time: string): number {
  const match = /^T\+(\d+)$/.exec(time);
  if (match) return parseInt(match[1]!, 10);
  return 0;
}
