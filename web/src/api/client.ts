const BASE = "/api/projects";
const BACKEND = `${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8888"}/api/projects`;

export const api = {
  async getProjects(): Promise<Array<{ id: string; name: string; createdAt: string }>> {
    const res = await fetch(`${BASE}`);
    return res.json();
  },
  async createProject(name: string): Promise<{ id: string; name: string; createdAt: string }> {
    const res = await fetch(`${BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.json();
  },
  async deleteProject(id: string): Promise<void> {
    await fetch(`${BASE}/${id}`, { method: "DELETE" });
  },
  async getSystemPrompt(projectId: string): Promise<{ prompt: string }> {
    const res = await fetch(`${BASE}/${projectId}/system-prompt`);
    return res.json();
  },
  async getUsage(projectId: string): Promise<{
    totalCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCacheHitTokens: number;
    totalCostYuan: number;
  }> {
    const res = await fetch(`${BASE}/${projectId}/usage`);
    return res.json();
  },
  async getCompressUsage(projectId: string): Promise<{
    totalCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCacheHitTokens: number;
    totalCostYuan: number;
  }> {
    const res = await fetch(`${BASE}/${projectId}/compress-usage`);
    return res.json();
  },
  async getHistory(projectId: string): Promise<Array<{
    seq: number;
    role: string;
    content: string;
    toolCalls: string;
    toolCallId: string;
    reasoningContent: string;
    usageJson: string;
  }>> {
    const res = await fetch(`${BASE}/${projectId}/history`);
    return res.json();
  },
  chat(
    projectId: string,
    message: string,
    onEvent: (event: { type: string; data: unknown }) => void,
    opts?: { model?: string; thinking?: string; reasoning_effort?: string },
  ): AbortController {
    const ctrl = new AbortController();
    fetch(`${BACKEND}/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        model: opts?.model,
        thinking: opts?.thinking,
        reasoning_effort: opts?.reasoning_effort,
      }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;
          for (const part of parts) {
            if (!part.trim()) continue;
            const lines = part.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) data = line.slice(6);
            }
            onEvent({ type: eventType, data: JSON.parse(data) });
          }
        }
      })
      .catch(() => {});
    return ctrl;
  },
  async resolveGate(projectId: string, requestId: number, verdict: Record<string, unknown>): Promise<void> {
    await fetch(`${BACKEND}/${projectId}/gate/${requestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verdict),
    });
  },
  async getKnowledge<T = unknown>(projectId: string, entity: string): Promise<T> {
    const res = await fetch(`${BACKEND}/${projectId}/knowledge/${entity}`);
    return res.json();
  },
  async getChapters(projectId: string): Promise<Array<{
    id: number; volume: number; title: string; status: string; segmentCount: number;
  }>> {
    const res = await fetch(`${BACKEND}/${projectId}/chapters`);
    return res.json();
  },
  async getChapterContent(projectId: string, chapterId: number): Promise<{ chapterId: number; content: string }> {
    const res = await fetch(`${BACKEND}/${projectId}/chapters/${chapterId}/content`);
    return res.json();
  },
  getExportUrl(projectId: string): string {
    return `${BACKEND}/${projectId}/export`;
  },
};
