const BASE = "/api/projects";
const BACKEND = `${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8888"}/api/projects`;

export const api = {
  async getProjects(): Promise<Array<{ id: string; name: string; targetWords: number; wordCount: number; createdAt: string }>> {
    const res = await fetch(`${BASE}`);
    return res.json();
  },
  async createProject(name: string, targetWords?: number): Promise<{ id: string; name: string; targetWords: number; wordCount: number; createdAt: string }> {
    const res = await fetch(`${BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, targetWords }),
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
    id: number; volume: number; title: string; status: string; segmentCount: number; wordCount: number; outline_id: number | null;
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
  async abort(projectId: string): Promise<void> {
    await fetch(`${BACKEND}/${projectId}/chat/abort`, { method: "DELETE" });
  },
  async getChapterSegments(projectId: string, chapterId: number): Promise<Array<{ id: number; seq: number; content: string }>> {
    const res = await fetch(`${BACKEND}/${projectId}/chapters/${chapterId}/segments`);
    return res.json();
  },
  async reorderSegments(projectId: string, chapterId: number, segmentIds: number[]): Promise<void> {
    await fetch(`${BACKEND}/${projectId}/chapters/${chapterId}/segments/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentIds }),
    });
  },
  async getStats(projectId: string): Promise<{
    wordCount: number;
    targetWords: number;
    progress: number;
    chapterCount: number;
    chapters: Array<{ id: number; title: string; volume: number; wordCount: number; segmentCount: number }>;
  }> {
    const res = await fetch(`${BASE}/${projectId}/stats`);
    return res.json();
  },
  async getOutlines(projectId: string): Promise<Array<{
    id: number; parent_id: number | null; volume: number; seq: number; title: string; summary: string; foreshadow: string; target_words: number; chapter_start: number; chapter_end: number; mood: string; metadata: string; status: string;
  }>> {
    const res = await fetch(`${BACKEND}/${projectId}/outlines`);
    return res.json();
  },
  async getKnowledgeGraph(projectId: string): Promise<{
    nodes: Array<{ id: string; type: string; label: string }>;
    edges: Array<{ source_id: string; target_id: string; type: string; source_label: string; target_label: string }>;
  }> {
    const res = await fetch(`${BACKEND}/${projectId}/knowledge/graph`);
    return res.json();
  },
};
