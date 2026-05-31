import type { DbWorker } from "../db/worker.js";
import type { ChatMessage, ToolCall } from "../../lib/reasonix-core/types.js";
import type { UsageInfo } from "../agent/loop.js";

export interface HistoryMessage {
  role: string;
  content: string;
  toolCalls: string;
  toolCallId: string;
  reasoningContent: string;
  usageJson: string;
  seq: number;
}

export async function saveMessages(
  w: DbWorker,
  sessionId: string,
  messages: readonly ChatMessage[],
  startSeq: number,
  usageMap?: ReadonlyMap<number, UsageInfo>,
): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const globalIdx = startSeq + i;
    const usage = usageMap?.get(i);
    let toolCallsJson = JSON.stringify(m.tool_calls ?? []);
    if (m.role === "tool" && m.tool_call_id) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = messages[j]!;
        if (prev.role === "assistant" && prev.tool_calls?.length) {
          const match = prev.tool_calls.find(tc => tc.id === m.tool_call_id);
          if (match) {
            toolCallsJson = JSON.stringify({ name: match.function.name, arguments: match.function.arguments });
          }
          break;
        }
      }
    }
    await w.request({
      id: 0,
      type: "run",
      sql: "INSERT INTO agent_messages (session_id, seq, role, content, tool_calls, tool_call_id, reasoning_content, usage_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        sessionId,
        globalIdx,
        m.role,
        m.content ?? "",
        toolCallsJson,
        m.tool_call_id ?? "",
        m.reasoning_content ?? "",
        usage ? JSON.stringify(usage) : "",
      ],
    });
  }
}

export async function loadHistory(
  w: DbWorker,
  sessionId: string,
): Promise<HistoryMessage[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT seq, role, content, tool_calls, tool_call_id, reasoning_content, usage_json FROM agent_messages WHERE session_id = ? ORDER BY seq ASC",
    params: [sessionId],
  });
  if (!res.ok || !res.data) return [];
  return (res.data as Array<Record<string, unknown>>).map((row) => ({
    seq: row["seq"] as number,
    role: row["role"] as string,
    content: row["content"] as string,
    toolCalls: row["tool_calls"] as string,
    toolCallId: row["tool_call_id"] as string,
    reasoningContent: row["reasoning_content"] as string,
    usageJson: (row["usage_json"] as string) ?? "",
  }));
}

export async function getNextSeq(
  w: DbWorker,
  sessionId: string,
): Promise<number> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT COALESCE(MAX(seq), -1) as maxSeq FROM agent_messages WHERE session_id = ?",
    params: [sessionId],
  });
  if (!res.ok || !res.data) return 0;
  const rows = res.data as Array<Record<string, unknown>>;
  if (rows.length === 0) return 0;
  return ((rows[0]!["maxSeq"] as number | null | undefined) ?? -1) + 1;
}

export async function createSession(
  w: DbWorker,
  sessionId: string,
  projectId: string,
  model: string,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "INSERT OR IGNORE INTO agent_sessions (id, project_id, model) VALUES (?, ?, ?)",
    params: [sessionId, projectId, model],
  });
}

export async function touchSession(
  w: DbWorker,
  sessionId: string,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "UPDATE agent_sessions SET updated_at = datetime('now') WHERE id = ?",
    params: [sessionId],
  });
}

export async function getActiveSession(
  w: DbWorker,
  projectId: string,
): Promise<{ sessionId: string; isNew: boolean }> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id FROM agent_sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1",
    params: [projectId],
  });
  if (res.ok && res.data) {
    const rows = res.data as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      return { sessionId: rows[0]!["id"] as string, isNew: false };
    }
  }
  return { sessionId: "", isNew: true };
}

export async function loadSnapshot(
  w: DbWorker,
  sessionId: string,
): Promise<ChatMessage[]> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT snapshot FROM context_snapshots WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    params: [sessionId],
  });
  if (!res.ok || !res.data) return [];
  const rows = res.data as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];
  try {
    return JSON.parse(rows[0]!["snapshot"] as string) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function saveSnapshot(
  w: DbWorker,
  projectId: string,
  sessionId: string,
  messages: readonly ChatMessage[],
  tokenCount: number,
  compressed: number,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "INSERT INTO context_snapshots (project_id, session_id, snapshot, token_count, compressed) VALUES (?, ?, ?, ?, ?)",
    params: [projectId, sessionId, JSON.stringify(messages), tokenCount, compressed],
  });
}

export async function cleanOldSnapshots(
  w: DbWorker,
  sessionId: string,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "DELETE FROM context_snapshots WHERE session_id = ? AND id NOT IN (SELECT id FROM context_snapshots WHERE session_id = ? ORDER BY id DESC LIMIT 20)",
    params: [sessionId, sessionId],
  });
}
