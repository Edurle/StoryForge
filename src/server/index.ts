import express from "express";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { DbWorker } from "../db/worker.js";
import type { StoryForgeLoop } from "../agent/loop.js";
import type { UsageInfo } from "../agent/loop.js";
import { calcCost } from "../agent/loop.js";
import type { StreamDeltaEvent } from "../agent/loop.js";
import type { PauseGate } from "../../lib/reasonix-core/core/pause-gate.js";
import { errorHandler } from "./middleware/error.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { getUsageSummary, getCompressUsageSummary } from "../services/usage.js";
import { recordUsage } from "../services/usage.js";
import { loadHistory, saveMessages, saveSnapshot, cleanOldSnapshots, getNextSeq, touchSession } from "../services/history.js";

export interface ServerDeps {
  getDbWorker: (projectId: string) => DbWorker;
  getOrCreateLoop: (projectId: string) => Promise<{ loop: StoryForgeLoop; sessionId: string }>;
  projectsDb: DbWorker;
  gate: PauseGate;
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
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });
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

    let { loop, sessionId } = await deps.getOrCreateLoop(projectId);
    const seqBefore = loop.messageCount;
    let pendingUsage: UsageInfo | undefined;
    const usageMap = new Map<number, UsageInfo>();
    let compressUsageInfo: { promptTokens: number; completionTokens: number; cacheHitTokens: number; cacheMissTokens: number } | undefined;
    let wasCompressed = false;

    const offGate = deps.gate.on((gateReq) => {
      res.write(`event: gate_request\ndata: ${JSON.stringify({ id: gateReq.id, kind: gateReq.kind, payload: gateReq.payload })}\n\n`);
    });

    try {
      for await (const event of loop.runTurn(message, {
        model,
        thinking: thinking === "enabled" ? "enabled" : "disabled",
        reasoningEffort: reasoningEffort as "high" | "max" | undefined,
        onDelta: (delta: StreamDeltaEvent) => {
          res.write(`event: ${delta.type}\ndata: ${JSON.stringify({ content: delta.content })}\n\n`);
        },
      })) {
        if (event.type === "usage") {
          pendingUsage = { ...event.usage, costYuan: calcCost(event.usage, model) };
          res.write(`event: usage\ndata: ${JSON.stringify(pendingUsage)}\n\n`);
        } else if (event.type === "assistant") {
          const msgIdx = loop.getMessages().length - 1;
          if (pendingUsage) {
            usageMap.set(msgIdx, pendingUsage);
            pendingUsage = undefined;
          }
          res.write(`event: assistant\ndata: ${JSON.stringify({ content: event.content, reasoningContent: event.reasoningContent })}\n\n`);
        } else if (event.type === "tool_call") {
          res.write(`event: tool_call\ndata: ${JSON.stringify({ name: event.call.function.name, args: event.call.function.arguments })}\n\n`);
        } else if (event.type === "tool_result") {
          res.write(`event: tool_result\ndata: ${JSON.stringify({ name: event.call.function.name, result: event.result })}\n\n`);
        } else if (event.type === "compressed") {
          compressUsageInfo = event.compressUsage;
          wasCompressed = true;
          res.write(`event: compressed\ndata: ${JSON.stringify({ beforeTokens: event.beforeTokens, afterTokens: event.afterTokens, summaryLevels: event.summaryLevels })}\n\n`);
        } else if (event.type === "done") {
          res.write(`event: done\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === "error") {
          res.write(`event: error\ndata: ${JSON.stringify({ error: event.error.message })}\n\n`);
        }
      }
    } finally {
      offGate();
      const db = deps.getDbWorker(projectId);
      const allMessages = loop.getMessages();
      const newMessages = allMessages.slice(seqBefore);
      const startSeq = await getNextSeq(db, sessionId);

      saveMessages(db, sessionId, newMessages, startSeq, usageMap).catch(() => {});
      saveSnapshot(db, projectId, sessionId, allMessages, loop.lastPromptTokenCount, wasCompressed ? 1 : 0).catch(() => {});
      cleanOldSnapshots(db, sessionId).catch(() => {});
      touchSession(db, sessionId).catch(() => {});
      if (compressUsageInfo) {
        recordUsage(db, sessionId, {
          promptTokens: compressUsageInfo.promptTokens,
          completionTokens: compressUsageInfo.completionTokens,
          cacheHitTokens: compressUsageInfo.cacheHitTokens,
          cacheMissTokens: compressUsageInfo.cacheMissTokens,
          model,
        }, "compress").catch(() => {});
      }
      if (pendingUsage) {
        recordUsage(db, sessionId, {
          promptTokens: pendingUsage.promptTokens,
          completionTokens: pendingUsage.completionTokens,
          cacheHitTokens: pendingUsage.cacheHitTokens,
          cacheMissTokens: pendingUsage.cacheMissTokens,
          model,
        }).catch(() => {});
      }
      res.end();
    }
  });

  app.post("/api/projects/:projectId/gate/:requestId/resolve", (req, res) => {
    const requestId = parseInt((req.params as Record<string, string | undefined>).requestId!, 10);
    if (isNaN(requestId)) {
      res.status(400).json({ error: "invalid requestId" });
      return;
    }
    deps.gate.resolve(requestId, req.body);
    res.json({ ok: true });
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

  app.get("/api/projects/:projectId/compress-usage", async (req: Request, res: Response) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const db = deps.getDbWorker(projectId);
    const summary = await getCompressUsageSummary(db);
    res.json(summary);
  });

  app.get("/api/projects/:projectId/history", async (req: Request, res: Response) => {
    const projectId = (req.params as Record<string, string | undefined>).projectId!;
    const { sessionId } = await deps.getOrCreateLoop(projectId);
    const db = deps.getDbWorker(projectId);
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
