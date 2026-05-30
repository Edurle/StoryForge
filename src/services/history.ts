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
  usageMap?: ReadonlyMap<number, UsageInfo>,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "INSERT OR IGNORE INTO agent_sessions (id, project_id, model) VALUES (?, '', '')",
    params: [sessionId],
  });

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const usage = usageMap?.get(i);
    await w.request({
      id: 0,
      type: "run",
      sql: "INSERT INTO agent_messages (session_id, seq, role, content, tool_calls, tool_call_id, reasoning_content, usage_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        sessionId,
        i,
        m.role,
        m.content ?? "",
        JSON.stringify(m.tool_calls ?? []),
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

export async function getLatestSessionId(
  w: DbWorker,
): Promise<string | null> {
  const res = await w.request({
    id: 0,
    type: "query",
    sql: "SELECT id FROM agent_sessions ORDER BY updated_at DESC LIMIT 1",
    params: [],
  });
  if (!res.ok || !res.data) return null;
  const rows = res.data as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  return rows[0]!["id"] as string;
}

export async function createSession(
  w: DbWorker,
  sessionId: string,
  model: string,
): Promise<void> {
  await w.request({
    id: 0,
    type: "run",
    sql: "INSERT INTO agent_sessions (id, project_id, model) VALUES (?, '', ?)",
    params: [sessionId, model],
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

export async function loadHistoryAsMessages(
  w: DbWorker,
  sessionId: string,
): Promise<ChatMessage[]> {
  const rows = await loadHistory(w, sessionId);
  return rows.map((row): ChatMessage => {
    const msg: ChatMessage = { role: row.role as ChatMessage["role"], content: row.content };
    const toolCalls = JSON.parse(row.toolCalls) as ToolCall[];
    if (toolCalls.length > 0) msg.tool_calls = toolCalls;
    if (row.toolCallId) msg.tool_call_id = row.toolCallId;
    if (row.reasoningContent) msg.reasoning_content = row.reasoningContent;
    return msg;
  });
}
