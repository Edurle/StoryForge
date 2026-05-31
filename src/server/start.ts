import { createApp, type ChatModelOptions } from "./index.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { createDbWorker } from "../db/worker.js";
import { StoryForgeLoop, type StreamDeltaEvent } from "../agent/loop.js";
import type { ChatMessage, ToolCall } from "../../lib/reasonix-core/types.js";
import type { ReasoningEffort } from "../../lib/reasonix-core/config.js";
import { createToolRegistry } from "../agent/tools/index.js";
import { ImmutablePrefix } from "../../lib/reasonix-core/memory/runtime.js";
import { PauseGate } from "../../lib/reasonix-core/core/pause-gate.js";
import { loadEndpoint } from "../../lib/reasonix-core/config.js";
import { loadDotenv } from "../../lib/reasonix-core/env.js";
import { recordUsage } from "../services/usage.js";
import { DeepSeekClient, Usage } from "../../lib/reasonix-core/client.js";
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

const dsClient = new DeepSeekClient({ apiKey: API_KEY, baseUrl: BASE_URL });

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../data");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const workers = new Map<string, ReturnType<typeof createDbWorker>>();
const gate = new PauseGate();

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

  let onDeltaFn: ((event: StreamDeltaEvent) => void) | undefined;

  const loop = new StoryForgeLoop({
    client: {
      async chat(opts: any) {
        const thinking = chatOpts.thinking === "enabled" ? "enabled" as const : "disabled" as const;
        const reasoningEffort = chatOpts.reasoningEffort as ReasoningEffort;
        const stream = dsClient.stream({
          model: opts.model ?? chatOpts.model,
          messages: opts.messages,
          tools: opts.tools,
          thinking,
          reasoningEffort,
        });

        let content = "";
        let reasoningContent = "";
        const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
        let streamUsage: Usage | undefined;

        for await (const chunk of stream) {
          if (chunk.reasoningDelta) {
            reasoningContent += chunk.reasoningDelta;
            onDeltaFn?.({ type: "reasoning_delta", content: chunk.reasoningDelta });
          }
          if (chunk.contentDelta) {
            content += chunk.contentDelta;
            onDeltaFn?.({ type: "content_delta", content: chunk.contentDelta });
          }
          if (chunk.toolCallDelta) {
            const idx = chunk.toolCallDelta.index;
            if (chunk.toolCallDelta.id) {
              toolCallMap.set(idx, {
                id: chunk.toolCallDelta.id,
                name: chunk.toolCallDelta.name ?? "",
                args: chunk.toolCallDelta.argumentsDelta ?? "",
              });
            } else if (toolCallMap.has(idx) && chunk.toolCallDelta.argumentsDelta) {
              toolCallMap.get(idx)!.args += chunk.toolCallDelta.argumentsDelta;
            }
          }
          if (chunk.usage) streamUsage = chunk.usage;
        }

        const toolCalls: ToolCall[] = [...toolCallMap.values()].map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        }));

        const usage = streamUsage ?? new Usage();
        recordUsage(db, "default", {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          cacheHitTokens: usage.promptCacheHitTokens,
          cacheMissTokens: usage.promptCacheMissTokens,
          model: chatOpts.model,
        }).catch(() => {});

        return {
          content,
          reasoningContent: reasoningContent || null,
          toolCalls,
          usage,
          raw: {},
        };
      },
      onDelta: undefined as ((event: StreamDeltaEvent) => void) | undefined,
    },
    tools,
    prefix,
    model: chatOpts.model,
    initialMessages,
  });
  return Object.assign(loop, {
    sessionId,
    setOnDelta(cb: ((event: StreamDeltaEvent) => void) | undefined) { onDeltaFn = cb; },
  });
}

const projectsDb = createDbWorker(resolve(dataDir, "projects.db"));

async function createAppWithDeps() {
  return createApp({
    getDbWorker,
    createLoop,
    projectsDb,
    gate,
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
