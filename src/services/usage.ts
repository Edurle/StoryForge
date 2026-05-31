import type { DbWorker } from "../db/worker.js";

export interface UsageRecord {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  model: string;
}

export async function recordUsage(
  w: DbWorker,
  sessionId: string,
  usage: UsageRecord,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "INSERT INTO api_usage (session_id, prompt_tokens, completion_tokens, cache_hit_tokens, cache_miss_tokens, model) VALUES (?, ?, ?, ?, ?, ?)",
    params: [sessionId, usage.promptTokens, usage.completionTokens, usage.cacheHitTokens, usage.cacheMissTokens, usage.model],
  });
}

export async function getUsageSummary(
  w: DbWorker,
): Promise<{
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCacheHitTokens: number;
  totalCostYuan: number;
}> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: `SELECT COUNT(*) as totalCalls,
           COALESCE(SUM(prompt_tokens), 0) as totalPromptTokens,
           COALESCE(SUM(completion_tokens), 0) as totalCompletionTokens,
           COALESCE(SUM(cache_hit_tokens), 0) as totalCacheHitTokens,
           COALESCE(SUM(
             cache_hit_tokens * CASE WHEN model LIKE '%pro%' THEN 0.000000025 ELSE 0.00000002 END
             + cache_miss_tokens * CASE WHEN model LIKE '%pro%' THEN 0.000003 ELSE 0.000001 END
             + completion_tokens * CASE WHEN model LIKE '%pro%' THEN 0.000006 ELSE 0.000002 END
           ), 0) as totalCostYuan
         FROM api_usage`,
  });
  if (!res.ok || !res.data) return { totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCacheHitTokens: 0, totalCostYuan: 0 };
  const row = (res.data as Array<Record<string, number>>)[0];
  if (!row) return { totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCacheHitTokens: 0, totalCostYuan: 0 };
  return {
    totalCalls: row["totalCalls"] ?? 0,
    totalPromptTokens: row["totalPromptTokens"] ?? 0,
    totalCompletionTokens: row["totalCompletionTokens"] ?? 0,
    totalCacheHitTokens: row["totalCacheHitTokens"] ?? 0,
    totalCostYuan: row["totalCostYuan"] ?? 0,
  };
}
