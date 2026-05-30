# DeepSeek API 完整调用指南

> 基于 DeepSeek 官方 API 文档 + Reasonix 项目实战整理。
> 涵盖：基础对话、流式输出、思考模式、Function Calling（工具调用）、Strict 模式、缓存机制、错误处理。

---

## 目录

1. [快速开始](#1-快速开始)
2. [API 基础配置](#2-api-基础配置)
3. [基础对话（非流式）](#3-基础对话非流式)
4. [流式输出（SSE）](#4-流式输出sse)
5. [思考模式（Reasoning）](#5-思考模式reasoning)
6. [Function Calling / 工具调用](#6-function-calling--工具调用)
7. [思考模式 + 工具调用（进阶）](#7-思考模式--工具调用进阶)
8. [Strict 模式（Beta）](#8-strict-模式beta)
9. [JSON 模式](#9-json-模式)
10. [前缀缓存（Prefix Cache）](#10-前缀缓存prefix-cache)
11. [多轮对话上下文拼接](#11-多轮对话上下文拼接)
12. [完整参数参考](#12-完整参数参考)
13. [错误处理与重试](#13-错误处理与重试)
14. [TypeScript/Node.js 库级调用（Reasonix 方式）](#14-typescriptnodejs-库级调用reasonix-方式)
15. [常见问题 FAQ](#15-常见问题-faq)

---

## 1. 快速开始

### 1.1 获取 API Key

前往 [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 申请 API Key。

### 1.2 核心连接信息

| 参数 | 值 |
|---|---|
| **Base URL (OpenAI 格式)** | `https://api.deepseek.com` |
| **Base URL (Anthropic 格式)** | `https://api.deepseek.com/anthropic` |
| **Endpoint** | `POST /chat/completions` |
| **认证方式** | `Authorization: Bearer <YOUR_API_KEY>` |
| **可用模型** | `deepseek-v4-flash`、`deepseek-v4-pro` |

> **注意**: `deepseek-chat` 和 `deepseek-reasoner` 将于 **2026/07/24 弃用**。前者映射到 `deepseek-v4-flash` 的非思考模式，后者映射到思考模式。

### 1.3 Hello World（curl）

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'
```

### 1.4 Hello World（Python + OpenAI SDK）

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com",
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
)

print(response.choices[0].message.content)
```

### 1.5 Hello World（Node.js + fetch）

```javascript
const response = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
  body: JSON.stringify({
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

---

## 2. API 基础配置

### 2.1 环境变量

```bash
# .env 文件
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
# DEEPSEEK_API_BASE_URL 是 DEEPSEEK_BASE_URL 的别名，也支持
```

### 2.2 模型选择

| 模型 | 说明 |
|---|---|
| `deepseek-v4-flash` | 通用模型，速度快，成本低。默认模型。 |
| `deepseek-v4-pro` | 高性能模型，适合复杂推理和 Agent 场景。 |

### 2.3 兼容性

DeepSeek API 兼容 OpenAI API 格式。你可以：
- 直接使用 **OpenAI SDK**（Python/Node.js），只需修改 `base_url`
- 使用 **Anthropic SDK**，base_url 设为 `https://api.deepseek.com/anthropic`
- 使用任何兼容 OpenAI API 的工具（如 Cursor、Aider、Reasonix 等）

---

## 3. 基础对话（非流式）

### 3.1 单轮对话

```python
from openai import OpenAI

client = OpenAI(api_key="<key>", base_url="https://api.deepseek.com")

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "In one sentence, what is prompt caching?"},
    ],
)

print(response.choices[0].message.content)
# 输出: Prompt caching is a technique where previously computed...
```

### 3.2 多轮对话

```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is 2+2?"},
]

# 第一轮
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=messages,
)
assistant_msg = response.choices[0].message.content
print(f"Assistant: {assistant_msg}")

# 将 assistant 回复加入上下文
messages.append({"role": "assistant", "content": assistant_msg})
messages.append({"role": "user", "content": "And what is 2+3?"})

# 第二轮
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=messages,
)
print(f"Assistant: {response.choices[0].message.content}")
```

### 3.3 带 usage 统计

```python
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello"}],
)

usage = response.usage
print(f"Prompt tokens: {usage.prompt_tokens}")
print(f"Completion tokens: {usage.completion_tokens}")
print(f"Total tokens: {usage.total_tokens}")
print(f"Cache hit tokens: {usage.prompt_cache_hit_tokens}")
print(f"Cache miss tokens: {usage.prompt_cache_miss_tokens}")
```

---

## 4. 流式输出（SSE）

设置 `stream: true`，API 将以 Server-Sent Events (SSE) 形式逐 token 返回。

### 4.1 Python 流式

```python
stream = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Write a haiku about programming."}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)
# 最后一个 chunk 包含 usage 信息
```

### 4.2 Node.js 原生 fetch 流式

```javascript
const response = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Accept: "text/event-stream",
  },
  body: JSON.stringify({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Hello" }],
    stream: true,
    stream_options: { include_usage: true },
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  // 解析 SSE 事件：每行以 "data: " 开头
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const json = JSON.parse(line.slice(6));
    const delta = json.choices?.[0]?.delta;
    if (delta?.content) process.stdout.write(delta.content);
  }
}
```

### 4.3 流式输出中获取 usage

在流式请求中设置 `stream_options: { include_usage: true }`，最后一个 SSE 块将包含完整 usage：

```python
stream = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True,
    stream_options={"include_usage": True},
)

for chunk in stream:
    if chunk.usage:
        print(f"\nTotal tokens: {chunk.usage.total_tokens}")
```

---

## 5. 思考模式（Reasoning）

DeepSeek V4 模型支持思考模式：在输出最终回答前，先输出思维链（Chain of Thought）内容。

### 5.1 启用思考模式

```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "9.11 and 9.8, which is greater?"}],
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}},
)

reasoning = response.choices[0].message.reasoning_content
content = response.choices[0].message.content

print(f"思维链: {reasoning}")
print(f"最终回答: {content}")
```

### 5.2 控制参数

| 参数 | 格式 | 说明 |
|---|---|---|
| 思考模式开关 | `extra_body={"thinking": {"type": "enabled"/"disabled"}}` | 默认 `enabled` |
| 思考强度 | `reasoning_effort="high"/"max"` | 默认 `high`。`low`/`medium` 映射为 `high`，`xhigh` 映射为 `max` |

### 5.3 关闭思考模式

```python
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={"thinking": {"type": "disabled"}},
)
```

### 5.4 注意事项

- 思考模式下 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 参数**不生效**（不会报错，但被忽略）
- `reasoning_content` 字段仅思考模式可用
- 非工具调用的多轮对话中，之前的 `reasoning_content` 无需回传
- **工具调用的多轮对话中，必须回传 `reasoning_content`**，否则 API 返回 400

---

## 6. Function Calling / 工具调用

Function Calling 让模型能够调用你定义的外部函数/工具，从而实现 Agent 能力。

### 6.1 工作流程

```
用户提问 → 模型决定调用工具 → 返回 tool_calls → 你执行工具 → 返回结果 → 模型生成最终回答
```

### 6.2 完整示例：天气查询（Python）

```python
import json
from openai import OpenAI

client = OpenAI(api_key="<key>", base_url="https://api.deepseek.com")

# 1. 定义工具
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location, the user should supply a location first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    }
                },
                "required": ["location"],
            },
        },
    },
]

# 2. 第一次调用 — 用户提问
messages = [{"role": "user", "content": "How's the weather in Hangzhou?"}]
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=messages,
    tools=tools,
)

message = response.choices[0].message

# 3. 检查模型是否返回了 tool_calls
if message.tool_calls:
    # 将 assistant 消息（含 tool_calls）加入上下文
    messages.append(message)

    # 4. 执行工具并返回结果
    for tool_call in message.tool_calls:
        function_name = tool_call.function.name
        function_args = json.loads(tool_call.function.arguments)

        print(f"模型请求调用: {function_name}({function_args})")

        # 你自己的函数实现
        result = "24°C, Cloudy"  # 这里替换成真正的天气API调用

        # 将工具结果加入上下文
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result,
        })

    # 5. 第二次调用 — 带上工具结果
    response = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=messages,
        tools=tools,
    )
    print(f"最终回答: {response.choices[0].message.content}")
```

### 6.3 完整示例：天气查询（curl）

```bash
# 第一次调用：模型返回 tool_call
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {"role": "user", "content": "How is the weather in Hangzhou?"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather of a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "City name"}
          },
          "required": ["location"]
        }
      }
    }]
  }'

# 模型返回 (response.choices[0].message):
# {
#   "role": "assistant",
#   "content": null,
#   "tool_calls": [{
#     "id": "call_0_xxx",
#     "type": "function",
#     "function": {
#       "name": "get_weather",
#       "arguments": "{\"location\": \"Hangzhou\"}"
#     }
#   }]
# }

# 第二次调用：带上工具结果
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {"role": "user", "content": "How is the weather in Hangzhou?"},
      {"role": "assistant", "content": null, "tool_calls": [{
        "id": "call_0_xxx",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\": \"Hangzhou\"}"
        }
      }]},
      {"role": "tool", "tool_call_id": "call_0_xxx", "content": "24°C, Cloudy"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather of a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "City name"}
          },
          "required": ["location"]
        }
      }
    }]
  }'
```

### 6.4 多工具定义

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"},
                },
                "required": ["location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_date",
            "description": "Get the current date.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Evaluate a mathematical expression.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "Math expression to evaluate"},
                },
                "required": ["expression"],
            },
        },
    },
]
```

### 6.5 tool_choice 参数

控制模型调用工具的行为：

```python
# 模型自行决定是否调用工具（默认）
response = client.chat.completions.create(..., tools=tools, tool_choice="auto")

# 禁止模型调用工具
response = client.chat.completions.create(..., tools=tools, tool_choice="none")

# 强制模型必须调用工具
response = client.chat.completions.create(..., tools=tools, tool_choice="required")

# 强制调用特定工具
response = client.chat.completions.create(
    ...,
    tools=tools,
    tool_choice={"type": "function", "function": {"name": "get_weather"}},
)
```

### 6.6 流式工具调用

```python
stream = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "What is the weather in Beijing?"}],
    tools=tools,
    stream=True,
)

tool_calls_acc = {}

for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.tool_calls:
        for tc in delta.tool_calls:
            idx = tc.index
            if idx not in tool_calls_acc:
                tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
            if tc.id:
                tool_calls_acc[idx]["id"] = tc.id
            if tc.function:
                if tc.function.name:
                    tool_calls_acc[idx]["name"] = tc.function.name
                if tc.function.arguments:
                    tool_calls_acc[idx]["arguments"] += tc.function.arguments

# tool_calls_acc 现在包含完整的工具调用信息
for idx, tc in tool_calls_acc.items():
    print(f"Tool call: {tc['name']}({tc['arguments']})")
```

---

## 7. 思考模式 + 工具调用（进阶）

思考模式下进行工具调用时，**必须完整回传 `reasoning_content`**，否则 API 返回 400 错误。

### 7.1 完整示例（Python）

```python
import os
import json
from openai import OpenAI
from datetime import datetime

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_date",
            "description": "Get the current date",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location, the user should supply the location and date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "The city name"},
                    "date": {"type": "string", "description": "The date in format YYYY-mm-dd"},
                },
                "required": ["location", "date"],
            },
        },
    },
]

def get_date_mock():
    return datetime.now().strftime("%Y-%m-%d")

def get_weather_mock(location, date):
    return "Cloudy 7~13°C"

TOOL_CALL_MAP = {
    "get_date": get_date_mock,
    "get_weather": get_weather_mock,
}

def run_turn(turn, messages):
    sub_turn = 1
    while True:
        response = client.chat.completions.create(
            model="deepseek-v4-pro",
            messages=messages,
            tools=tools,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}},
        )
        # 关键：直接 append 整个 message 对象，包含 reasoning_content
        messages.append(response.choices[0].message)

        reasoning_content = response.choices[0].message.reasoning_content
        content = response.choices[0].message.content
        tool_calls = response.choices[0].message.tool_calls

        print(f"Turn {turn}.{sub_turn}")
        print(f"  reasoning: {reasoning_content}")
        print(f"  content: {content}")
        print(f"  tool_calls: {tool_calls}")

        if tool_calls is None:
            break

        for tool in tool_calls:
            tool_function = TOOL_CALL_MAP[tool.function.name]
            tool_result = tool_function(**json.loads(tool.function.arguments))
            print(f"  tool result for {tool.function.name}: {tool_result}")
            messages.append({
                "role": "tool",
                "tool_call_id": tool.id,
                "content": tool_result,
            })
        sub_turn += 1
    print()

# 用户提问
messages = [{"role": "user", "content": "How's the weather in Hangzhou tomorrow?"}]
run_turn(1, messages)

# 用户追问
messages.append({"role": "user", "content": "How about Guangzhou?"})
run_turn(2, messages)
```

### 7.2 关键规则

1. **思考模式 + 有工具调用**：后续所有请求必须回传 `reasoning_content`
2. **思考模式 + 无工具调用**：`reasoning_content` 不需要回传（会被忽略）
3. 使用 `messages.append(response.choices[0].message)` 是最简单的方式，自动携带所有字段

### 7.3 对应的 messages 拼接（等价写法）

```python
# 简洁写法
messages.append(response.choices[0].message)

# 等价展开写法
messages.append({
    "role": "assistant",
    "content": response.choices[0].message.content,
    "reasoning_content": response.choices[0].message.reasoning_content,
    "tool_calls": response.choices[0].message.tool_calls,
})
```

---

## 8. Strict 模式（Beta）

Strict 模式确保模型严格遵循 Function 的 JSON Schema 格式输出。

### 8.1 启用方式

1. 使用 `base_url="https://api.deepseek.com/beta"`
2. 在 `tools` 参数中为每个 `function` 设置 `"strict": true`
3. `parameters` 必须设置 `"additionalProperties": false`
4. 所有 `object` 的属性必须列在 `required` 中

```python
client = OpenAI(
    api_key="<key>",
    base_url="https://api.deepseek.com/beta",  # 注意使用 /beta 端点
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "strict": True,  # 启用 strict 模式
            "description": "Get weather of a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    }
                },
                "required": ["location"],
                "additionalProperties": False,  # strict 模式必需
            },
        },
    },
]
```

### 8.2 支持的 JSON Schema 类型

| 类型 | 特殊参数 |
|---|---|
| `object` | 所有属性必须 `required`，必须 `additionalProperties: false` |
| `string` | 支持 `pattern`（正则）、`format`（email/hostname/ipv4/ipv6/uuid） |
| `number`/`integer` | 支持 `const`、`default`、`minimum`、`maximum`、`exclusiveMinimum/Maximum`、`multipleOf` |
| `array` | 不支持 `minItems`、`maxItems` |
| `enum` | 限定枚举值 |
| `anyOf` | 多种格式匹配 |

### 8.3 复杂 Schema 示例

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "create_order",
            "strict": True,
            "description": "Create a new order",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_email": {
                        "type": "string",
                        "description": "Customer email",
                        "format": "email",
                    },
                    "items": {
                        "type": "array",
                        "description": "List of items",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "quantity": {"type": "integer", "minimum": 1},
                            },
                            "required": ["name", "quantity"],
                            "additionalProperties": False,
                        },
                    },
                    "priority": {
                        "type": "string",
                        "description": "Order priority",
                        "enum": ["low", "medium", "high"],
                    },
                },
                "required": ["customer_email", "items", "priority"],
                "additionalProperties": False,
            },
        },
    },
]
```

---

## 9. JSON 模式

强制模型输出有效 JSON：

```python
response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "system", "content": "Output a JSON object with 'name' and 'age' fields."},
        {"role": "user", "content": "Tell me about Alice who is 30."},
    ],
    response_format={"type": "json_object"},
)

import json
data = json.loads(response.choices[0].message.content)
print(data)  # {"name": "Alice", "age": 30}
```

> **注意**: 使用 JSON 模式时，必须通过 system 或 user 消息明确指示模型生成 JSON。

---

## 10. 前缀缓存（Prefix Cache）

DeepSeek API 自动提供前缀缓存，无需额外配置。缓存命中时 token 成本大幅降低。

### 10.1 工作原理

- 当多个请求的前缀（system + 之前对话历史）相同时，自动复用已计算的 KV Cache
- 缓存命中的 token 价格更低（通常为原价的 10%~14%）
- 无需代码修改，API 自动处理

### 10.2 通过 Usage 监控缓存命中率

```python
usage = response.usage
total_prompt = usage.prompt_tokens
cache_hit = usage.prompt_cache_hit_tokens
cache_miss = usage.prompt_cache_miss_tokens

hit_rate = cache_hit / total_prompt * 100 if total_prompt > 0 else 0
print(f"缓存命中率: {hit_rate:.1f}%")
```

### 10.3 优化策略

1. **保持前缀不变**：将 system prompt 放在 messages 最前面，不要每次修改
2. **追加而非重写**：多轮对话中追加新消息，不要重构整个 messages 列表
3. **减少消息变动**：避免编辑历史消息内容

### 10.4 Reasonix 的缓存工程化实践

Reasonix 项目（本项目）围绕前缀缓存做了深度优化：

- **ImmutablePrefix**：system prompt + tool specs 构成不可变前缀，整个会话期间保持字节稳定
- **AppendOnlyLog**：消息只追加不修改，保证前缀不被破坏
- **Session 持久化**：会话写入 JSONL 文件，重启后恢复同一前缀
- 实测缓存命中率可达 **99.82%**（[案例](./benchmarks/real-world-cache/README.md)）

---

## 11. 多轮对话上下文拼接

### 11.1 标准拼接（非思考模式）

```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Python?"},
    {"role": "assistant", "content": "Python is a programming language..."},
    {"role": "user", "content": "What about Java?"},
]
```

### 11.2 思考模式拼接

**无工具调用的轮次**：`reasoning_content` 不需要回传（被忽略）

```python
messages = [
    {"role": "user", "content": "9.11 and 9.8, which is greater?"},
    {"role": "assistant", "content": "9.11 > 9.8", "reasoning_content": "..."},
    # 上面的 reasoning_content 会被 API 忽略，可以省略
    {"role": "user", "content": "How about 9.11 and 9.9?"},
]
```

**有工具调用的轮次**：`reasoning_content` **必须回传**

```python
messages = [
    {"role": "user", "content": "What is the weather?"},
    {"role": "assistant", "content": "", "reasoning_content": "...", "tool_calls": [...]},
    # ↑ reasoning_content 必须保留
    {"role": "tool", "tool_call_id": "call_0_xxx", "content": "24°C"},
    {"role": "assistant", "content": "The weather is 24°C", "reasoning_content": "..."},
    # ↑ 这里的 reasoning_content 也必须保留
    {"role": "user", "content": "What about tomorrow?"},
]
```

---

## 12. 完整参数参考

### Request Body

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | **是** | `deepseek-v4-flash` 或 `deepseek-v4-pro` |
| `messages` | array | **是** | 消息列表，至少 1 条 |
| `thinking` | object | 否 | `{"type": "enabled"/"disabled"}`，默认 `enabled`。通过 `extra_body` 传入 |
| `reasoning_effort` | string | 否 | `"high"` 或 `"max"`，默认 `"high"` |
| `max_tokens` | integer | 否 | 最大生成 token 数 |
| `temperature` | number | 否 | 0-2，默认 1。思考模式下无效 |
| `top_p` | number | 否 | 0-1，默认 1。思考模式下无效 |
| `stream` | boolean | 否 | 是否流式输出 |
| `stream_options` | object | 否 | `{"include_usage": true}` 在流式最后返回 usage |
| `tools` | array | 否 | 工具定义列表，最多 128 个 |
| `tool_choice` | string/object | 否 | `"none"`/`"auto"`/`"required"`/`{"type":"function","function":{"name":"xxx"}}` |
| `response_format` | object | 否 | `{"type": "json_object"}` 强制 JSON 输出 |
| `stop` | string/array | 否 | 停止生成的字符串，最多 16 个 |
| `logprobs` | boolean | 否 | 是否返回对数概率 |
| `top_logprobs` | integer | 否 | 0-20，返回 top N token 的对数概率 |
| `user_id` | string | 否 | 用户标识，用于限速隔离和缓存隔离 |

### Response Body

| 字段 | 说明 |
|---|---|
| `id` | 请求唯一 ID |
| `choices[].message.content` | 模型回答内容 |
| `choices[].message.reasoning_content` | 思维链内容（思考模式） |
| `choices[].message.tool_calls` | 工具调用列表 |
| `choices[].finish_reason` | 停止原因：`stop`/`length`/`tool_calls`/`content_filter`/`insufficient_system_resource` |
| `usage.prompt_tokens` | 输入 token 总数 |
| `usage.completion_tokens` | 输出 token 数 |
| `usage.total_tokens` | 总 token 数 |
| `usage.prompt_cache_hit_tokens` | 缓存命中 token 数 |
| `usage.prompt_cache_miss_tokens` | 缓存未命中 token 数 |
| `usage.completion_tokens_details.reasoning_tokens` | 思维链 token 数 |

### Message Types

```jsonc
// System 消息
{"role": "system", "content": "You are a helpful assistant."}

// User 消息
{"role": "user", "content": "Hello!"}

// Assistant 消息（无工具调用）
{"role": "assistant", "content": "Hi there!"}

// Assistant 消息（有工具调用）
{
  "role": "assistant",
  "content": null,
  "tool_calls": [{
    "id": "call_0_xxx",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\": \"Hangzhou\"}"
    }
  }]
}

// Assistant 消息（思考模式 + 工具调用）
{
  "role": "assistant",
  "content": "",
  "reasoning_content": "The user wants to know the weather...",
  "tool_calls": [{
    "id": "call_0_xxx",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\": \"Hangzhou\"}"
    }
  }]
}

// Tool 结果消息
{
  "role": "tool",
  "tool_call_id": "call_0_xxx",
  "content": "24°C, Cloudy"
}
```

---

## 13. 错误处理与重试

### 13.1 常见 HTTP 状态码

| 状态码 | 含义 | 处理建议 |
|---|---|---|
| 400 | 请求格式错误 | 检查参数格式、messages 拼接 |
| 401 | API Key 无效 | 检查 Key 是否正确 |
| 429 | 速率限制 | 指数退避重试 |
| 500/502/503 | 服务端错误 | 重试，DeepSeek 偶尔过载 |

### 13.2 Python 错误处理

```python
from openai import APIError, APIConnectionError, RateLimitError

try:
    response = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=[{"role": "user", "content": "Hello"}],
    )
except RateLimitError as e:
    print(f"Rate limited: {e}")
    # 等待后重试
except APIConnectionError as e:
    print(f"Connection error: {e}")
except APIError as e:
    print(f"API error: {e.status_code} - {e.message}")
```

### 13.3 带重试的请求（参考 Reasonix 实现）

```python
import time

def call_with_retry(client, max_retries=3, **kwargs):
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(**kwargs)
        except RateLimitError:
            wait = 2 ** attempt  # 指数退避
            print(f"Rate limited, retrying in {wait}s...")
            time.sleep(wait)
        except APIError as e:
            if e.status_code >= 500:
                wait = 2 ** attempt
                print(f"Server error {e.status_code}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
    raise Exception(f"Failed after {max_retries} retries")
```

### 13.4 超时设置

DeepSeek 的负载均衡器可能保持连接最长 10 分钟（队列等待）。建议设置 **11 分钟超时**：

```python
from httpx import Timeout

client = OpenAI(
    api_key="<key>",
    base_url="https://api.deepseek.com",
    timeout=Timeout(660.0, connect=30.0),  # 11 分钟总超时
)
```

---

## 14. TypeScript/Node.js 库级调用（Reasonix 方式）

本项目（Reasonix）提供了封装好的 DeepSeek 客户端库，支持完整的 Agent 循环。

### 14.1 安装

```bash
npm install reasonix
```

### 14.2 基础对话

```typescript
import { DeepSeekClient, CacheFirstLoop, ImmutablePrefix, loadDotenv } from "reasonix";

loadDotenv(); // 加载 .env 文件中的 DEEPSEEK_API_KEY

async function main() {
  const client = new DeepSeekClient();
  const prefix = new ImmutablePrefix({ system: "You are a concise assistant." });
  const loop = new CacheFirstLoop({ client, prefix, stream: false });

  const answer = await loop.run("In one sentence, what is prompt caching?");
  console.log(answer);
  console.log(loop.stats.summary());
}

main().catch(console.error);
```

### 14.3 带工具调用的对话

```typescript
import {
  DeepSeekClient,
  CacheFirstLoop,
  ImmutablePrefix,
  ToolRegistry,
  loadDotenv,
} from "reasonix";

loadDotenv();

const tools = new ToolRegistry();

// 注册一个加法工具
tools.register<{ a: number; b: number }, number>({
  name: "add",
  description: "Add two integers.",
  parameters: {
    type: "object",
    properties: {
      a: { type: "integer" },
      b: { type: "integer" },
    },
    required: ["a", "b"],
  },
  fn: ({ a, b }) => a + b,
});

async function main() {
  const client = new DeepSeekClient();
  const prefix = new ImmutablePrefix({
    system: "You are a calculator assistant. Use the `add` tool for addition.",
    toolSpecs: tools.specs(),
  });
  const loop = new CacheFirstLoop({ client, prefix, tools });

  const answer = await loop.run("What is 17 + 25?");
  console.log("answer:", answer);
  console.log("stats:", loop.stats.summary());
}

main().catch(console.error);
```

### 14.4 直接使用 DeepSeekClient

```typescript
import { DeepSeekClient, loadDotenv } from "reasonix";

loadDotenv();

async function main() {
  const client = new DeepSeekClient();

  // 非流式调用
  const response = await client.chat({
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ],
  });

  console.log(response.content);         // 文本回答
  console.log(response.reasoningContent); // 思维链（思考模式）
  console.log(response.toolCalls);       // 工具调用列表
  console.log(response.usage);           // Token 用量

  // 流式调用
  for await (const chunk of client.stream({
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Write a poem." }],
  })) {
    if (chunk.contentDelta) process.stdout.write(chunk.contentDelta);
    if (chunk.reasoningDelta) process.stderr.write(chunk.reasoningDelta);
    if (chunk.toolCallDelta) {
      console.log("Tool call:", chunk.toolCallDelta);
    }
    if (chunk.usage) {
      console.log("\nUsage:", chunk.usage);
    }
  }
}

main().catch(console.error);
```

### 14.5 客户端配置

```typescript
const client = new DeepSeekClient({
  apiKey: "sk-xxx",               // 或通过 DEEPSEEK_API_KEY 环境变量
  baseUrl: "https://api.deepseek.com",  // 或自定义端点
  timeoutMs: 660_000,             // 11 分钟超时
  rateLimit: { rpm: 30 },         // 每分钟请求限制
  retry: { maxAttempts: 3 },      // 重试次数
});
```

### 14.6 查询余额和模型列表

```typescript
// 查询余额
const balance = await client.getBalance();
if (balance) {
  console.log("Available:", balance.balance_infos);
}

// 列出可用模型
const models = await client.listModels();
if (models) {
  for (const m of models.data) {
    console.log(m.id, m.owned_by);
  }
}
```

---

## 15. 常见问题 FAQ

### Q: deepseek-chat 和 deepseek-reasoner 还能用吗？

能用，但将于 **2026/07/24 弃用**。`deepseek-chat` 对应 `deepseek-v4-flash` 的非思考模式，`deepseek-reasoner` 对应思考模式。建议尽快迁移到 `deepseek-v4-flash` 和 `deepseek-v4-pro`。

### Q: 思考模式下 temperature 等参数不生效怎么办？

这是正常行为。思考模式下 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 被静默忽略，设置不会报错但无效。

### Q: 工具调用时 400 报错？

最常见的原因是思考模式下没有回传 `reasoning_content`。确保：
1. 有工具调用的 assistant 消息携带 `reasoning_content`
2. 后续所有请求中该字段保持不变

### Q: 如何获取缓存命中率？

查看 `usage` 字段中的 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`。命中率 = `cache_hit / (cache_hit + cache_miss) * 100%`。

### Q: 最大 token 数是多少？

`max_tokens` 参数控制输出 token 数上限。具体模型上下文窗口请参考 DeepSeek 官方最新文档。

### Q: 支持并发请求吗？

支持，但受 API 速率限制。可通过 `user_id` 参数实现用户级隔离和调度隔离。

### Q: 流式输出中 tool_calls 如何拼接？

流式模式下 `tool_calls` 是增量的。每个 chunk 的 `delta.tool_calls[0]` 包含：
- `index`：工具调用的索引
- `id`：首次出现时携带完整 ID
- `function.name`：首次出现时携带函数名
- `function.arguments`：增量 JSON 字符串，需要拼接

### Q: Reasonix 和直接调用 API 有什么区别？

Reasonix 是围绕 DeepSeek 前缀缓存深度优化的 Agent 框架，提供了：
- 工具调用修复（Repair Pipeline）
- 上下文压缩（Context Fold）
- 会话持久化和恢复
- 成本控制（Budget Guard）
- 完整的文件系统/Shell/MCP 工具集

纯 API 调用适合简单场景，Agent 场景推荐使用 Reasonix 等框架。

---

## 参考链接

- [DeepSeek API 官方文档](https://api-docs.deepseek.com/)
- [Function Calling 指南](https://api-docs.deepseek.com/zh-cn/guides/function_calling)
- [思考模式指南](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)
- [API Key 申请](https://platform.deepseek.com/api_keys)
- [Reasonix 配置指南](https://esengine.github.io/DeepSeek-Reasonix/configuration.html?lang=zh)
- [Reasonix 架构文档](./docs/ARCHITECTURE.md)
