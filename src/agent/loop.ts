import type { ChatMessage, ToolCall } from "../../lib/reasonix-core/types.js";
import type { ChatResponse } from "../../lib/reasonix-core/client.js";
import type { ToolRegistry } from "../../lib/reasonix-core/tools.js";
import { ImmutablePrefix } from "../../lib/reasonix-core/memory/runtime.js";

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  costYuan?: number;
}

export function calcCost(usage: UsageInfo, model: string): number {
  const cacheHitPerM = model.includes("pro") ? 0.025 : 0.02;
  const cacheMissPerM = model.includes("pro") ? 3 : 1;
  const outputPerM = model.includes("pro") ? 6 : 2;
  const hit = (usage.cacheHitTokens / 1_000_000) * cacheHitPerM;
  const miss = (usage.cacheMissTokens / 1_000_000) * cacheMissPerM;
  const out = (usage.completionTokens / 1_000_000) * outputPerM;
  return hit + miss + out;
}

export interface StreamDeltaEvent {
  type: "reasoning_delta" | "content_delta";
  content: string;
}

export interface CompressUsage {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

export type EngineEvent =
  | { type: "assistant"; content: string; reasoningContent?: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; result: string }
  | { type: "usage"; usage: UsageInfo }
  | { type: "done"; content: string }
  | { type: "error"; error: Error }
  | { type: "aborted" }
  | { type: "compressed"; beforeTokens: number; afterTokens: number; summaryLevels: number; compressUsage: CompressUsage };

const COMPRESS_THRESHOLD = 200_000;
const KEEP_RECENT_TURNS = 8;

function collectTurnBoundaries(messages: readonly ChatMessage[]): number[] {
  const boundaries: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "user") boundaries.push(i);
  }
  return boundaries;
}

function messagesToText(messages: readonly ChatMessage[]): string {
  return messages.map(m => {
    if (m.role === "tool") return `[tool:${m.tool_call_id ?? ""}] ${m.content}`;
    if (m.role === "assistant" && m.tool_calls?.length) {
      const calls = m.tool_calls.map(tc => `${tc.function.name}(${tc.function.arguments})`).join("; ");
      return `[assistant+tools] ${m.content ?? ""}\n[calls] ${calls}`;
    }
    return `[${m.role}] ${m.content}`;
  }).join("\n\n");
}

export interface TurnOptions {
  model?: string;
  thinking?: "enabled" | "disabled";
  reasoningEffort?: "high" | "max";
  onDelta?: (event: StreamDeltaEvent) => void;
}

export interface StoryForgeLoopDeps {
  client: { chat(opts: any): Promise<ChatResponse> };
  tools: ToolRegistry;
  prefix: ImmutablePrefix;
  maxIter?: number;
  initialMessages?: ChatMessage[];
}

export class StoryForgeLoop {
  private readonly client: StoryForgeLoopDeps["client"];
  private readonly tools: ToolRegistry;
  private readonly prefix: ImmutablePrefix;
  private readonly maxIter: number;
  private readonly abortController = new AbortController();
  private readonly messages: ChatMessage[];
  private readonly contextMessages: ChatMessage[];
  private _lastPromptTokens = 0;

  constructor(deps: StoryForgeLoopDeps) {
    this.client = deps.client;
    this.tools = deps.tools;
    this.prefix = deps.prefix;
    this.maxIter = deps.maxIter ?? 50;
    const init = deps.initialMessages ? [...deps.initialMessages] : [];
    this.messages = [...init];
    this.contextMessages = [...init];
  }

  async *runTurn(userInput: string, opts?: TurnOptions): AsyncGenerator<EngineEvent> {
    const model = opts?.model ?? "deepseek-chat";
    const userMsg: ChatMessage = { role: "user", content: userInput };
    this.messages.push(userMsg);
    this.contextMessages.push(userMsg);

    for (let iter = 0; iter < this.maxIter; iter++) {
      if (this.abortController.signal.aborted) {
        yield { type: "aborted" };
        return;
      }

      let response: ChatResponse;
      try {
        const llmMessages = [...this.prefix.toMessages(), ...this.contextMessages];
        console.log(`[Loop] Sending ${llmMessages.length} messages to LLM (model=${model}, context=${this.contextMessages.length} msgs, display=${this.messages.length} msgs, prefix=${this.prefix.toMessages().length} msgs)`);
        response = await this.client.chat({
          model,
          messages: llmMessages,
          tools: this.prefix.tools(),
          thinking: opts?.thinking,
          reasoningEffort: opts?.reasoningEffort,
          onDelta: opts?.onDelta,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          yield { type: "aborted" };
          return;
        }
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
        return;
      }

      this._lastPromptTokens = response.usage.promptTokens;

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.content,
        reasoning_content: response.reasoningContent,
      };
      if (response.toolCalls.length > 0) {
        assistantMsg.tool_calls = response.toolCalls;
      }
      this.messages.push(assistantMsg);
      this.contextMessages.push(assistantMsg);

      yield {
        type: "usage",
        usage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          cacheHitTokens: response.usage.promptCacheHitTokens,
          cacheMissTokens: response.usage.promptCacheMissTokens,
        },
      };

      yield {
        type: "assistant",
        content: response.content,
        reasoningContent: response.reasoningContent ?? undefined,
      };

      if (response.toolCalls.length === 0) {
        if (this._lastPromptTokens > COMPRESS_THRESHOLD) {
          const evt = await this.compressMessages(model);
          if (evt) yield evt;
        }
        yield { type: "done", content: response.content };
        return;
      }

      for (const call of response.toolCalls) {
        yield { type: "tool_call", call };
        const result = await this.tools.dispatch(
          call.function.name,
          call.function.arguments,
          { signal: this.abortController.signal },
        );
        const toolMsg: ChatMessage = {
          role: "tool",
          tool_call_id: call.id,
          content: result,
        };
        this.messages.push(toolMsg);
        this.contextMessages.push(toolMsg);
        yield { type: "tool_result", call, result };
      }
    }

    yield { type: "done", content: "" };
  }

  private async compressMessages(model: string): Promise<EngineEvent | null> {
    const beforeTokens = this._lastPromptTokens;
    const boundaries = collectTurnBoundaries(this.contextMessages);
    if (boundaries.length <= KEEP_RECENT_TURNS) return null;

    const recentStart = boundaries[boundaries.length - KEEP_RECENT_TURNS]!;
    if (recentStart <= 2) return null;

    const oldMessages = this.contextMessages.slice(0, recentStart);
    const recentMessages = this.contextMessages.slice(recentStart);

    const midPoint = Math.floor(oldMessages.length / 2);
    const ancient = oldMessages.slice(0, midPoint);
    const middle = oldMessages.slice(midPoint);

    const summaries: string[] = [];
    let compressPrompt = 0;
    let compressCompletion = 0;
    let compressCacheHit = 0;
    let compressCacheMiss = 0;

    if (ancient.length > 0) {
      const r = await this.generateSummary(
        messagesToText(ancient),
        "请将以下对话历史压缩为一段简短摘要（500字以内），保留关键事件、决策、角色状态变化和重要数值。忽略工具调用的技术细节，只保留结果。",
        model,
      );
      summaries.push(`[前情提要·早期]\n${r.content}`);
      compressPrompt += r.usage.promptTokens;
      compressCompletion += r.usage.completionTokens;
      compressCacheHit += r.usage.promptCacheHitTokens;
      compressCacheMiss += r.usage.promptCacheMissTokens;
    }

    if (middle.length > 0) {
      const r = await this.generateSummary(
        messagesToText(middle),
        "请将以下对话历史压缩为详细摘要（2000字以内），保留重要细节、数值变化、因果关系、角色状态。忽略工具调用的技术细节，只保留结果。",
        model,
      );
      summaries.push(`[前情提要·近期]\n${r.content}`);
      compressPrompt += r.usage.promptTokens;
      compressCompletion += r.usage.completionTokens;
      compressCacheHit += r.usage.promptCacheHitTokens;
      compressCacheMiss += r.usage.promptCacheMissTokens;
    }

    const summaryContent = summaries.join("\n\n");
    const compressed: ChatMessage[] = [
      { role: "user", content: `[系统自动压缩的上下文摘要]\n\n${summaryContent}` },
      { role: "assistant", content: "已了解前情提要，我会基于以上上下文继续创作。" },
      ...recentMessages,
    ];

    this.contextMessages.length = 0;
    this.contextMessages.push(...compressed);

    const summaryLevels = (ancient.length > 0 ? 1 : 0) + (middle.length > 0 ? 1 : 0);
    return {
      type: "compressed",
      beforeTokens,
      afterTokens: compressCompletion,
      summaryLevels,
      compressUsage: {
        promptTokens: compressPrompt,
        completionTokens: compressCompletion,
        cacheHitTokens: compressCacheHit,
        cacheMissTokens: compressCacheMiss,
      },
    };
  }

  private async generateSummary(
    text: string,
    instruction: string,
    model: string,
  ): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; promptCacheHitTokens: number; promptCacheMissTokens: number } }> {
    const empty = { content: "[摘要生成失败]", usage: { promptTokens: 0, completionTokens: 0, promptCacheHitTokens: 0, promptCacheMissTokens: 0 } };
    try {
      const resp = await this.client.chat({
        model,
        messages: [
          { role: "system", content: "你是一个对话摘要助手。根据用户提供的对话历史，生成简洁准确的摘要。" },
          { role: "user", content: `${instruction}\n\n---\n\n${text}` },
        ],
      });
      return {
        content: resp.content || "",
        usage: {
          promptTokens: resp.usage.promptTokens,
          completionTokens: resp.usage.completionTokens,
          promptCacheHitTokens: resp.usage.promptCacheHitTokens,
          promptCacheMissTokens: resp.usage.promptCacheMissTokens,
        },
      };
    } catch {
      return empty;
    }
  }

  getMessages(): readonly ChatMessage[] {
    return this.messages;
  }

  getContextMessages(): readonly ChatMessage[] {
    return this.contextMessages;
  }

  get messageCount(): number {
    return this.messages.length;
  }

  get lastPromptTokenCount(): number {
    return this._lastPromptTokens;
  }

  abort(): void {
    this.abortController.abort();
  }
}
