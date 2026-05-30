import type { ChatMessage, ToolCall } from "../../lib/reasonix-core/types.js";
import type { ChatResponse } from "../../lib/reasonix-core/client.js";
import type { ToolRegistry } from "../../lib/reasonix-core/tools.js";
import { ImmutablePrefix } from "../../lib/reasonix-core/memory/runtime.js";

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

export interface StreamDeltaEvent {
  type: "reasoning_delta" | "content_delta";
  content: string;
}

export type EngineEvent =
  | { type: "assistant"; content: string; reasoningContent?: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; result: string }
  | { type: "usage"; usage: UsageInfo }
  | { type: "done"; content: string }
  | { type: "error"; error: Error }
  | { type: "aborted" };

export interface StoryForgeLoopDeps {
  client: {
    chat(opts: any): Promise<ChatResponse>;
    onDelta?: (event: StreamDeltaEvent) => void;
  };
  tools: ToolRegistry;
  prefix: ImmutablePrefix;
  maxIter?: number;
  model?: string;
  initialMessages?: ChatMessage[];
}

export class StoryForgeLoop {
  private readonly client: StoryForgeLoopDeps["client"];
  private readonly tools: ToolRegistry;
  private readonly prefix: ImmutablePrefix;
  private readonly maxIter: number;
  private readonly model: string;
  private readonly abortController = new AbortController();
  private readonly messages: ChatMessage[];

  constructor(deps: StoryForgeLoopDeps) {
    this.client = deps.client;
    this.tools = deps.tools;
    this.prefix = deps.prefix;
    this.maxIter = deps.maxIter ?? 50;
    this.model = deps.model ?? "deepseek-chat";
    this.messages = deps.initialMessages ? [...deps.initialMessages] : [];
  }

  async *runTurn(userInput: string): AsyncGenerator<EngineEvent> {
    this.messages.push({ role: "user", content: userInput });

    for (let iter = 0; iter < this.maxIter; iter++) {
      if (this.abortController.signal.aborted) {
        yield { type: "aborted" };
        return;
      }

      let response: ChatResponse;
      try {
        response = await this.client.chat({
          model: this.model,
          messages: [...this.prefix.toMessages(), ...this.messages],
          tools: this.prefix.tools(),
        });
      } catch (err) {
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
        return;
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.content,
        reasoning_content: response.reasoningContent,
      };
      if (response.toolCalls.length > 0) {
        assistantMsg.tool_calls = response.toolCalls;
      }
      this.messages.push(assistantMsg);

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
        this.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
        yield { type: "tool_result", call, result };
      }
    }

    yield { type: "done", content: "" };
  }

  getMessages(): readonly ChatMessage[] {
    return this.messages;
  }

  abort(): void {
    this.abortController.abort();
  }
}
