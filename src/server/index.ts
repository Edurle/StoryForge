import express from "express";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { DbWorker } from "../db/worker.js";
import type { StoryForgeLoop } from "../agent/loop.js";
import type { UsageInfo } from "../agent/loop.js";
import { errorHandler } from "./middleware/error.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { getUsageSummary } from "../services/usage.js";
import { loadHistory, getLatestSessionId, saveMessages } from "../services/history.js";

export interface ChatModelOptions {
  model: string;
  thinking: string;
  reasoningEffort: string;
}

export interface ServerDeps {
  getDbWorker: (projectId: string) => DbWorker;
  createLoop: (projectId: string, opts: ChatModelOptions) => Promise<StoryForgeLoop & { sessionId: string }>;
  projectsDb: DbWorker;
}

export async function resetProjects(deps: ServerDeps): Promise<void> {
  await deps.projectsDb.request({
    id: 0,
    type: "run",
    sql: "DELETE FROM projects",
    params: [],
  });
}

export async function createApp(deps: ServerDeps): Promise<express.Express> {
  const app = express();
  app.use(express.json());

  const projects = new Map<string, { id: string; name: string; createdAt: string }>();

  const loadRes = await deps.projectsDb.request({
    id: 0,
    type: "query",
    sql: "SELECT id, name, created_at FROM projects ORDER BY created_at ASC",
    params: [],
  });
  if (loadRes.ok && loadRes.data) {
    for (const row of loadRes.data as Array<Record<string, string>>) {
      projects.set(row["id"]!, { id: row["id"]!, name: row["name"]!, createdAt: row["created_at"]! });
    }
  }

  app.get("/api/projects", (_req, res) => {
    res.json([...projects.values()]);
  });

  app.post("/api/projects", async (req, res) => {
    const name = req.body.name as string | undefined;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const id = randomUUID();
    const project = { id, name, createdAt: new Date().toISOString() };
    await deps.projectsDb.request({
      id: 0,
      type: "run",
      sql: "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
      params: [id, name, project.createdAt],
    });
    projects.set(id, project);
    res.status(201).json(project);
  });

  app.get("/api/projects/:id", (req, res) => {
    const id = (req.params as Record<string, string | undefined>).id!;
    const project = projects.get(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  app.delete("/api/projects/:id", async (req, res) => {
    const id = (req.params as Record<string, string | undefined>).id!;
    const project = projects.get(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await deps.projectsDb.request({
      id: 0,
      type: "run",
      sql: "DELETE FROM projects WHERE id = ?",
      params: [id],
    });
    projects.delete(id);
    res.status(204).end();
  });

  app.post("/api/projects/:projectId/chat", async (req, res) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const message = req.body.message as string | undefined;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const model = (req.body.model as string | undefined) ?? "deepseek-v4-flash";
    const thinking = (req.body.thinking as string | undefined) ?? "enabled";
    const reasoningEffort = (req.body.reasoning_effort as string | undefined) ?? "high";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const loop = await deps.createLoop(projectId, { model, thinking, reasoningEffort });
    let pendingUsage: UsageInfo | undefined;
    const usageMap = new Map<number, UsageInfo>();

    try {
      for await (const event of loop.runTurn(message)) {
        if (event.type === "usage") {
          pendingUsage = event.usage;
          res.write(`event: usage\ndata: ${JSON.stringify(event.usage)}\n\n`);
        } else if (event.type === "assistant") {
          const msgIdx = loop.getMessages().length - 1;
          if (pendingUsage) {
            usageMap.set(msgIdx, pendingUsage);
            pendingUsage = undefined;
          }
          res.write(`event: assistant\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === "tool_call") {
          res.write(`event: tool_call\ndata: ${JSON.stringify({ name: event.call.function.name, args: event.call.function.arguments })}\n\n`);
        } else if (event.type === "tool_result") {
          res.write(`event: tool_result\ndata: ${JSON.stringify({ name: event.call.function.name, result: event.result })}\n\n`);
        } else if (event.type === "done") {
          res.write(`event: done\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === "error") {
          res.write(`event: error\ndata: ${JSON.stringify({ error: event.error.message })}\n\n`);
        }
      }
    } finally {
      const db = deps.getDbWorker(projectId);
      saveMessages(db, loop.sessionId, loop.getMessages(), usageMap).catch(() => {});
      res.end();
    }
  });

  app.get("/api/projects/:projectId/system-prompt", (_req: Request, res: Response) => {
    res.json({ prompt: SYSTEM_PROMPT });
  });

  app.get("/api/projects/:projectId/usage", async (req: Request, res: Response) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const db = deps.getDbWorker(projectId);
    const summary = await getUsageSummary(db);
    res.json(summary);
  });

  app.get("/api/projects/:projectId/history", async (req: Request, res: Response) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const db = deps.getDbWorker(projectId);
    const sessionId = await getLatestSessionId(db);
    if (!sessionId) {
      res.json([]);
      return;
    }
    const messages = await loadHistory(db, sessionId);
    res.json(messages);
  });

  app.get("/api/projects/:projectId/tree", (_req, res) => {
    res.json([]);
  });

  app.get("/api/projects/:projectId/content/{*path}", (_req, res) => {
    res.status(404).json({ error: "Content not found" });
  });

  app.use(errorHandler);
  return app;
}
