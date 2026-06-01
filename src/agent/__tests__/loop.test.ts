import { describe, it, expect, vi } from "vitest";
import { Usage } from "../../../lib/reasonix-core/client.js";
import type { ChatResponse } from "../../../lib/reasonix-core/client.js";
import type { ToolCall } from "../../../lib/reasonix-core/types.js";
import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import { ImmutablePrefix } from "../../../lib/reasonix-core/memory/runtime.js";
import { StoryForgeLoop } from "../loop.js";

function createMocks() {
  const chatMock = vi.fn();
  const client = { chat: chatMock as (opts: any) => Promise<ChatResponse> };
  const tools = new ToolRegistry();
  const prefix = new ImmutablePrefix({ system: "你是书灵创作助手。" });
  return { chatMock, client, tools, prefix };
}

function fakeUsage(): Usage {
  return new Usage(0, 0, 0, 0, 0);
}

function fakeResponse(
  overrides: Partial<{ content: string; reasoningContent: string | null; toolCalls: ToolCall[] }>,
): ChatResponse {
  return {
    content: overrides.content ?? "",
    reasoningContent: overrides.reasoningContent ?? null,
    toolCalls: overrides.toolCalls ?? [],
    usage: fakeUsage(),
    raw: {},
  };
}

function makeToolCall(id: string, name: string, args: string): ToolCall {
  return { id, type: "function", function: { name, arguments: args } };
}

async function collectEvents(loop: StoryForgeLoop, input: string) {
  const events: any[] = [];
  for await (const event of loop.runTurn(input)) {
    events.push(event);
  }
  return events;
}

describe("StoryForgeLoop", () => {
  it("simple conversation with no tool calls yields assistant then done", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    chatMock.mockResolvedValue(
      fakeResponse({ content: "你好！我是书灵。" }),
    );

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const events = await collectEvents(loop, "你好");

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      type: "usage",
      usage: { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0 },
    });
    expect(events[1]).toEqual({
      type: "assistant",
      content: "你好！我是书灵。",
      reasoningContent: undefined,
    });
    expect(events[2]).toEqual({ type: "done", content: "你好！我是书灵。" });
  });

  it("single tool call then final answer", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    tools.register({
      name: "query_character",
      fn: async () => JSON.stringify({ name: "叶凡", stage: "筑基九层" }),
    });

    const tc = makeToolCall("tc1", "query_character", '{"name":"叶凡"}');

    chatMock
      .mockResolvedValueOnce(fakeResponse({ content: "", toolCalls: [tc] }))
      .mockResolvedValueOnce(fakeResponse({ content: "叶凡当前处于筑基九层" }));

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const events = await collectEvents(loop, "叶凡什么境界？");

    expect(events).toHaveLength(7);
    expect(events[0].type).toBe("usage");
    expect(events[1].type).toBe("assistant");
    expect(events[2]).toEqual({ type: "tool_call", call: tc });
    expect(events[3].type).toBe("tool_result");
    expect(events[3].call).toBe(tc);
    expect(events[3].result).toContain("叶凡");
    expect(events[4].type).toBe("usage");
    expect(events[5].type).toBe("assistant");
    expect(events[5].content).toBe("叶凡当前处于筑基九层");
    expect(events[6]).toEqual({ type: "done", content: "叶凡当前处于筑基九层" });
  });

  it("multiple tool calls in one response", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    tools.register({
      name: "query_character",
      fn: async () => JSON.stringify({ name: "叶凡", stage: "筑基九层" }),
    });
    tools.register({
      name: "query_setting",
      fn: async () => JSON.stringify({ location: "天南" }),
    });

    const tc1 = makeToolCall("tc1", "query_character", '{"name":"叶凡"}');
    const tc2 = makeToolCall("tc2", "query_setting", '{"location":"天南"}');

    chatMock
      .mockResolvedValueOnce(fakeResponse({ content: "", toolCalls: [tc1, tc2] }))
      .mockResolvedValueOnce(fakeResponse({ content: "叶凡在天南，筑基九层。" }));

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const events = await collectEvents(loop, "介绍一下叶凡和天南");

    const toolCallEvents = events.filter((e: any) => e.type === "tool_call");
    const toolResultEvents = events.filter((e: any) => e.type === "tool_result");
    const usageEvents = events.filter((e: any) => e.type === "usage");
    expect(toolCallEvents).toHaveLength(2);
    expect(toolResultEvents).toHaveLength(2);
    expect(usageEvents).toHaveLength(2);
    expect(events[events.length - 1]).toEqual({ type: "done", content: "叶凡在天南，筑基九层。" });
  });

  it("stops after maxIter iterations with empty done", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    tools.register({
      name: "query_character",
      fn: async () => "{}",
    });

    const tc = makeToolCall("tc1", "query_character", "{}");

    chatMock.mockResolvedValue(
      fakeResponse({ content: "", toolCalls: [tc] }),
    );

    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 2 });
    const events = await collectEvents(loop, "test");

    const doneEvents = events.filter((e: any) => e.type === "done");
    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0]).toEqual({ type: "done", content: "" });

    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it("yields aborted when abort is called", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    tools.register({
      name: "query_character",
      fn: async () => JSON.stringify({ name: "叶凡" }),
    });

    const tc = makeToolCall("tc1", "query_character", '{"name":"叶凡"}');
    let resolveChat: () => void;
    const pendingChat = new Promise<void>((r) => { resolveChat = r; });

    chatMock.mockImplementationOnce(() => fakeResponse({ content: "", toolCalls: [tc] }));
    chatMock.mockImplementationOnce(() => new Promise((r) => {
      pendingChat.then(() => r(fakeResponse({ content: "", toolCalls: [tc] })));
    }));

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const gen = loop.runTurn("test");

    for (let i = 0; i < 4; i++) await gen.next();

    const pending = gen.next();
    loop.abort();
    resolveChat!();
    await pending;

    await gen.next();
    await gen.next();
    await gen.next();

    const aborted = await gen.next();
    expect(aborted.value.type).toBe("aborted");

    const final = await gen.next();
    expect(final.done).toBe(true);
  });

  it("yields aborted when client.chat throws AbortError", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    chatMock.mockRejectedValue(abortErr);

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const events = await collectEvents(loop, "test");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("aborted");
    const errorEvents = events.filter((e: any) => e.type === "error");
    expect(errorEvents).toHaveLength(0);
  });

  it("yields error event on API failure and terminates", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    chatMock.mockRejectedValue(new Error("API timeout"));

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const events = await collectEvents(loop, "test");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0].error).toBeInstanceOf(Error);
    expect(events[0].error.message).toBe("API timeout");
  });

  it("runTurn passes model opts to client.chat", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    chatMock.mockResolvedValue(fakeResponse({ content: "ok" }));

    const loop = new StoryForgeLoop({ client, tools, prefix });
    const events: any[] = [];
    for await (const event of loop.runTurn("test", {
      model: "deepseek-v4-pro",
      thinking: "enabled",
      reasoningEffort: "max",
    })) {
      events.push(event);
    }

    expect(chatMock).toHaveBeenCalledTimes(1);
    const callOpts = chatMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callOpts["model"]).toBe("deepseek-v4-pro");
    expect(callOpts["thinking"]).toBe("enabled");
    expect(callOpts["reasoningEffort"]).toBe("max");
  });

  it("messageCount and lastPromptTokenCount track state", async () => {
    const { chatMock, client, tools, prefix } = createMocks();

    chatMock.mockResolvedValue(fakeResponse({ content: "ok" }));

    const loop = new StoryForgeLoop({ client, tools, prefix });
    expect(loop.messageCount).toBe(0);

    for await (const _ of loop.runTurn("test")) { /* drain */ }

    expect(loop.messageCount).toBe(2);
  });
});
