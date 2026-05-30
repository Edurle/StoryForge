import { createApp, type ChatModelOptions } from "./index.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { createDbWorker } from "../db/worker.js";
import { StoryForgeLoop } from "../agent/loop.js";
import type { ChatMessage } from "../../lib/reasonix-core/types.js";
import { createToolRegistry } from "../agent/tools/index.js";
import { ImmutablePrefix } from "../../lib/reasonix-core/memory/runtime.js";
import { PauseGate } from "../../lib/reasonix-core/core/pause-gate.js";
import { loadEndpoint } from "../../lib/reasonix-core/config.js";
import { loadDotenv } from "../../lib/reasonix-core/env.js";
import { recordUsage } from "../services/usage.js";
import { Usage } from "../../lib/reasonix-core/client.js";
import { createSession, touchSession, getLatestSessionId, loadHistoryAsMessages } from "../services/history.js";
import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

loadDotenv();

const endpoint = loadEndpoint();
if (!endpoint.apiKey) {
  console.error("Error: API Key not configured.");
  console.error("Run: npm run setup-key <your-api-key>");
  console.error("Or edit ~/.storyforge/config.json");
  process.exit(1);
}

const BASE_URL = endpoint.baseUrl ?? "https://api.deepseek.com";
const API_KEY = endpoint.apiKey;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../data");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const workers = new Map<string, ReturnType<typeof createDbWorker>>();
const gate = new PauseGate();

gate.on((req) => {
  console.log(`[PauseGate] ${req.kind}: ${JSON.stringify(req.payload)}`);
  if (req.kind === "plan_proposed") {
    gate.resolve(req.id, { type: "approve" });
  } else if (req.kind === "plan_checkpoint") {
    gate.resolve(req.id, { type: "continue" });
  }
});

function getDbWorker(projectId: string) {
  const existing = workers.get(projectId);
  if (existing) return existing;
  const dbPath = resolve(dataDir, `${projectId}.db`);
  console.log(`[DB] Opening ${dbPath}`);
  const w = createDbWorker(dbPath);
  workers.set(projectId, w);
  return w;
}

async function createLoop(projectId: string, chatOpts: ChatModelOptions) {
  const db = getDbWorker(projectId);
  const tools = createToolRegistry({ db, gate });
  const prefix = new ImmutablePrefix({
    system: SYSTEM_PROMPT,
    toolSpecs: tools.specs(),
  });

  let initialMessages: ChatMessage[] = [];
  const prevSessionId = await getLatestSessionId(db);
  if (prevSessionId) {
    initialMessages = await loadHistoryAsMessages(db, prevSessionId);
  }

  const sessionId = randomUUID();
  await createSession(db, sessionId, chatOpts.model);
  await touchSession(db, sessionId);

  const loop = new StoryForgeLoop({
    client: {
      async chat(opts: any) {
        const body: Record<string, unknown> = {
          model: opts.model ?? chatOpts.model,
          messages: opts.messages,
          tools: opts.tools,
        };
        if (chatOpts.thinking === "enabled") {
          body.thinking = { type: "enabled" };
          body.reasoning_effort = chatOpts.reasoningEffort;
        } else {
          body.thinking = { type: "disabled" };
        }
        const resp = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          throw new Error(`DeepSeek API error: ${resp.status} ${await resp.text()}`);
        }
        const data: any = await resp.json();
        const choice = data.choices?.[0]?.message ?? {};
        const usage = Usage.fromApi(data.usage);
        recordUsage(db, "default", {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          cacheHitTokens: usage.promptCacheHitTokens,
          cacheMissTokens: usage.promptCacheMissTokens,
          model: chatOpts.model,
        }).catch(() => {});
        return {
          content: choice.content ?? "",
          reasoningContent: choice.reasoning_content ?? null,
          toolCalls: choice.tool_calls ?? [],
          usage,
          raw: data,
        };
      },
    },
    tools,
    prefix,
    model: chatOpts.model,
    initialMessages,
  });
  return Object.assign(loop, { sessionId });
}

const projectsDb = createDbWorker(resolve(dataDir, "projects.db"));

async function createAppWithDeps() {
  return createApp({
    getDbWorker,
    createLoop,
    projectsDb,
  });
}

const app = await createAppWithDeps();
const port = parseInt(process.env.PORT ?? "8888", 10);

const server = app.listen(port, () => {
  console.log(`\n  书灵 StoryForge server running at http://localhost:${port}\n`);
});

function shutdown() {
  console.log("\n[Shutdown] Closing all DB workers...");
  server.close(() => {
    for (const w of workers.values()) w.close();
    projectsDb.close();
    console.log("[Shutdown] All DB workers closed. Exiting.");
    process.exit(0);
  });
  setTimeout(() => {
    console.log("[Shutdown] Forced exit after 5s timeout.");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
