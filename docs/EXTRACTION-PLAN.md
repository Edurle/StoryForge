# Reasonix 核心组件提取计划

> **目标**：从 Reasonix 项目中提取可复用的核心组件，形成独立可用的 TypeScript 库，供「书灵」StoryForge 项目直接引用。

---

## 一、提取文件清单

按依赖层级从底到顶排列。所有文件复制到新项目的 `lib/reasonix-core/` 目录下，保持相对路径关系。

### Tier 0：零依赖文件（叶节点）

| # | 源文件 | 目标路径 | 行数 | 说明 |
|---|--------|----------|------|------|
| 1 | `src/types.ts` | `lib/reasonix-core/types.ts` | 67 | API 类型定义：ChatMessage, ToolCall, ToolSpec 等 |
| 2 | `src/retry.ts` | `lib/reasonix-core/retry.ts` | 123 | fetch 指数退避重试 |
| 3 | `src/core/inflight.ts` | `lib/reasonix-core/core/inflight.ts` | 52 | 运行中任务追踪 Set |
| 4 | `src/core/lru.ts` | `lib/reasonix-core/core/lru.ts` | 57 | LRU 缓存 + TTL LRU 缓存 |
| 5 | `src/tools/rate-limit.ts` | `lib/reasonix-core/tools/rate-limit.ts` | 177 | 滑动窗口速率限制器 |

### Tier 1：仅依赖 Node.js 内置模块

| # | 源文件 | 目标路径 | 行数 | 说明 |
|---|--------|----------|------|------|
| 6 | `src/env.ts` | `lib/reasonix-core/env.ts` | 26 | .env 文件加载 |
| 7 | `src/core/atomic-write.ts` | `lib/reasonix-core/core/atomic-write.ts` | ~30 | 原子文件写入 |
| 8 | `src/core/pause-gate.ts` | `lib/reasonix-core/core/pause-gate.ts` | 222 | 异步确认门控（需内联 permission-types） |
| 9 | `src/tools/read-tracker.ts` | `lib/reasonix-core/tools/read-tracker.ts` | ~40 | 文件读取追踪器 |
| 10 | `src/tools/truncated-result-saver.ts` | `lib/reasonix-core/tools/truncated-result-saver.ts` | 108 | 截断结果保存 |
| 11 | `src/repair/flatten.ts` | `lib/reasonix-core/repair/flatten.ts` | ~120 | JSON Schema 扁平化/嵌套还原 |

### Tier 1.5：需内联的小文件

| # | 源文件 | 目标路径 | 行数 | 说明 |
|---|--------|----------|------|------|
| 12 | `packages/core-utils/src/permission-types.ts` | 内联到 `pause-gate.ts` 顶部 | 25 | 判决类型定义 |

### Tier 2：组合依赖层

| # | 源文件 | 目标路径 | 行数 | 说明 | 需要改造 |
|---|--------|----------|------|------|---------|
| 13 | `src/config.ts`（精简版） | `lib/reasonix-core/config.ts` | ~120 | 仅提取 8 个核心函数 | 是（剥离大量无关代码） |
| 14 | `src/mcp/registry.ts`（精简版） | `lib/reasonix-core/utils/truncate.ts` | ~50 | 仅提取 truncateForModel | 是（剥离 MCP/tokenizer 依赖） |

### Tier 3：核心组件

| # | 源文件 | 目标路径 | 行数 | 说明 | 需要改造 |
|---|--------|----------|------|------|---------|
| 15 | `src/client.ts` | `lib/reasonix-core/client.ts` | 438 | DeepSeek API 客户端 | 微调 import 路径 |
| 16 | `src/tools.ts` | `lib/reasonix-core/tools.ts` | 509 | 工具注册表 | 微调 import 路径 |
| 17 | `src/memory/runtime.ts`（精简版） | `lib/reasonix-core/memory/runtime.ts` | ~110 | ImmutablePrefix + VolatileScratch | 是（剥离 AppendOnlyLog） |

---

## 二、每个文件的具体改造内容

### 2.1 文件 #8：`pause-gate.ts`

**改造**：删除 `import ... from "@reasonix/core-utils"` 语句，将 `permission-types.ts` 的 25 行内容直接粘贴到文件顶部。

```typescript
// 替换这行：
import type { CheckpointVerdict, ChoiceVerdict, ConfirmationChoice, PlanVerdict, RevisionVerdict } from "@reasonix/core-utils";

// 改为直接定义：
export type ConfirmationChoice =
  | { type: "deny"; denyContext?: string }
  | { type: "run_once" }
  | { type: "always_allow"; prefix: string };

export type PlanVerdict =
  | { type: "approve"; feedback?: string }
  | { type: "refine"; feedback?: string }
  | { type: "cancel"; feedback?: string };

export type CheckpointVerdict =
  | { type: "continue" }
  | { type: "revise"; feedback?: string }
  | { type: "stop" };

export type RevisionVerdict = { type: "accepted" } | { type: "rejected" } | { type: "cancelled" };

export type ChoiceVerdict =
  | { type: "pick"; optionId: string }
  | { type: "text"; text: string }
  | { type: "cancel" };
```

### 2.2 文件 #13：`config.ts`（精简版）

**改造**：只保留以下函数和类型，删除其余 1400+ 行：

**保留的接口（精简版）**：
```typescript
interface RateLimitConfig {
  rpm?: number;
}

// 最小化的 ReasonixConfig，只保留 client.ts 需要的字段
interface ReasonixConfig {
  apiKey?: string;
  baseUrl?: string;
  rateLimit?: RateLimitConfig;
}
```

**保留的函数**：
1. `defaultConfigPath()` — 原样保留
2. `readConfig()` — 简化版（删除 STRING_ARRAY_FIELDS 和 zod 校验）
3. `writeConfig()` — 原样保留
4. `resolveBaseUrlEnv()` — 原样保留
5. `loadEndpoint()` — 原样保留
6. `loadApiKey()` — 原样保留
7. `loadBaseUrl()` — 原样保留
8. `loadRateLimit()` — 原样保留
9. `isPlausibleKey()` — 原样保留
10. `saveApiKey()` — 原样保留
11. `saveBaseUrl()` — 原样保留
12. `redactKey()` — 原样保留

**精简后的完整文件**（约 120 行）：
```typescript
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atomicWriteSync } from "./core/atomic-write.js";

interface RateLimitConfig {
  rpm?: number;
}

export interface ReasonixConfig {
  apiKey?: string;
  baseUrl?: string;
  rateLimit?: RateLimitConfig;
}

interface ResolvedEndpoint {
  baseUrl: string | undefined;
  apiKey: string | undefined;
}

export function defaultConfigPath(): string {
  return join(homedir(), ".storyforge", "config.json");  // 改路径名
}

export function readConfig(path: string = defaultConfigPath()): ReasonixConfig {
  try {
    const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ReasonixConfig;
    }
  } catch {
    /* missing or malformed → empty config */
  }
  return {};
}

export function writeConfig(cfg: ReasonixConfig, path: string = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  atomicWriteSync(path, JSON.stringify(cfg, null, 2), tmp);
}

export function resolveBaseUrlEnv(): string | undefined {
  return process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_BASE_URL || undefined;
}

export function loadEndpoint(path: string = defaultConfigPath()): ResolvedEndpoint {
  const envBaseUrl = resolveBaseUrlEnv();
  if (envBaseUrl) {
    return { baseUrl: envBaseUrl, apiKey: process.env.DEEPSEEK_API_KEY };
  }
  const cfg = readConfig(path);
  if (cfg.baseUrl) {
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
  }
  return { baseUrl: undefined, apiKey: process.env.DEEPSEEK_API_KEY ?? cfg.apiKey };
}

export function loadApiKey(path: string = defaultConfigPath()): string | undefined {
  return loadEndpoint(path).apiKey;
}

export function loadBaseUrl(path: string = defaultConfigPath()): string | undefined {
  return loadEndpoint(path).baseUrl;
}

export function loadRateLimit(path: string = defaultConfigPath()): RateLimitConfig | undefined {
  const rpm = readConfig(path).rateLimit?.rpm;
  if (typeof rpm !== "number" || !Number.isInteger(rpm) || rpm <= 0) return undefined;
  return { rpm };
}

export function saveApiKey(key: string, path: string = defaultConfigPath()): void {
  const cfg = readConfig(path);
  cfg.apiKey = key.trim();
  writeConfig(cfg, path);
  if (key.trim()) process.env.DEEPSEEK_API_KEY = key.trim();
}

export function saveBaseUrl(url: string, path: string = defaultConfigPath()): void {
  const cfg = readConfig(path);
  const trimmed = url.trim();
  cfg.baseUrl = trimmed || undefined;
  writeConfig(cfg, path);
}

export function isPlausibleKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length < 16) return false;
  return !/\s/.test(trimmed);
}

export function redactKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "****";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
```

**注意**：精简版不需要 `zod` 依赖。

### 2.3 文件 #14：`truncate.ts`（从 registry.ts 提取）

**改造**：只提取 `truncateForModel` 函数及其辅助函数，不提取 `truncateForModelByTokens`（它依赖 tokenizer）。

```typescript
// lib/reasonix-core/utils/truncate.ts

export const DEFAULT_MAX_RESULT_CHARS = 32_000;
export const DEFAULT_MAX_RESULT_TOKENS = 8_000;

export function truncateForModel(s: string, maxChars: number, extraNote?: string): string {
  if (s.length <= maxChars) return s;
  const tailBudget = Math.min(1024, Math.floor(maxChars * 0.1));
  const headBudget = Math.max(0, maxChars - tailBudget);
  const head = sliceAlignedToCodepoint(s, headBudget);
  const tail = sliceSuffixAlignedToCodepoint(s, tailBudget);
  const dropped = s.length - head.length - tail.length;
  const note = extraNote ? ` — ${extraNote}` : "";
  return `${head}\n\n[…truncated ${dropped} chars…${note}]\n\n${tail}`;
}

function sliceAlignedToCodepoint(s: string, end: number): string {
  if (end <= 0) return "";
  if (end >= s.length) return s;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) return s.slice(0, end - 1);
  return s.slice(0, end);
}

function sliceSuffixAlignedToCodepoint(s: string, len: number): string {
  if (len <= 0) return "";
  if (len >= s.length) return s;
  const start = s.length - len;
  const first = s.charCodeAt(start);
  if (first >= 0xdc00 && first <= 0xdfff) return s.slice(start + 1);
  return s.slice(start);
}
```

### 2.4 文件 #15：`client.ts`

**改造**：仅修改 import 路径，无其他改动。

```typescript
// 原始：
import { loadRateLimit, resolveBaseUrlEnv } from "./config.js";
// 不变，config.js 在同级目录

// 原始：
import { type RetryOptions, fetchWithRetry } from "./retry.js";
// 不变，retry.js 在同级目录

// 原始：
import type { ChatMessage, ChatRequestOptions, RawUsage, ToolCall, ToolSpec } from "./types.js";
// 不变，types.js 在同级目录
```

**无需任何改动**，保持原样即可。

### 2.5 文件 #16：`tools.ts`

**改造**：修改 3 处 import 路径。

```typescript
// 原始：
import { truncateForModel, truncateForModelByTokens } from "./mcp/registry.js";
// 改为：
import { truncateForModel } from "./utils/truncate.js";
// 注：删除 truncateForModelByTokens 的引用（如需要可后续添加 tokenizer）

// 原始：
import { analyzeSchema, flattenSchema, nestArguments } from "./repair/flatten.js";
// 改为：
import { analyzeSchema, flattenSchema, nestArguments } from "./repair/flatten.js";
// 不变，路径一致

// 原始：
import type { PauseGate } from "./core/pause-gate.js";
// 不变
```

**额外**：删除所有 `truncateForModelByTokens` 的调用，改为 `truncateForModel`（基于字符的截断对小说场景足够）。

### 2.6 文件 #17：`memory/runtime.ts`（精简版）

**改造**：只保留 `ImmutablePrefix` 和 `VolatileScratch`，删除 `AppendOnlyLog`（它依赖 `session.ts`）。

```typescript
import { createHash } from "node:crypto";
import type { ChatMessage, ToolSpec } from "../types.js";

// ImmutablePrefix — 原样保留（90 行）
// VolatileScratch — 原样保留（12 行）
// 删除 AppendOnlyLog（它依赖 session.ts 的 readTailMessages）
```

---

## 三、最终目录结构

```
your-project/
├── lib/
│   └── reasonix-core/
│       ├── index.ts              # 统一导出入口
│       ├── types.ts              # API 类型定义
│       ├── env.ts                # .env 加载
│       ├── retry.ts              # 重试逻辑
│       ├── client.ts             # DeepSeek API 客户端
│       ├── tools.ts              # 工具注册表
│       ├── config.ts             # 配置管理（精简版）
│       ├── core/
│       │   ├── atomic-write.ts   # 原子文件写入
│       │   ├── inflight.ts       # 运行中任务追踪
│       │   ├── lru.ts            # LRU 缓存
│       │   └── pause-gate.ts     # 确认门控（含内联 permission-types）
│       ├── memory/
│       │   └── runtime.ts        # ImmutablePrefix + VolatileScratch
│       ├── repair/
│       │   └── flatten.ts        # Schema 扁平化
│       ├── tools/
│       │   ├── rate-limit.ts     # 速率限制
│       │   ├── read-tracker.ts   # 读取追踪
│       │   └── truncated-result-saver.ts
│       └── utils/
│           └── truncate.ts       # 文本截断
```

---

## 四、需要安装的外部依赖

### 必装（运行时）

| 包名 | 版本 | 用途 | 被哪个文件使用 |
|------|------|------|--------------|
| `eventsource-parser` | `^3.0.0` | SSE 流解析 | `client.ts` |

### 不需要安装

| 包名 | 原因 |
|------|------|
| `zod` | 精简版 `config.ts` 删除了 zod 校验逻辑 |
| `eventsource-parser` 以外的所有 npm 包 | 提取的组件均不依赖 |

### 安装命令

```bash
npm install eventsource-parser
# 或
pnpm add eventsource-parser
# 或
yarn add eventsource-parser
```

---

## 五、统一导出入口 `index.ts`

```typescript
// lib/reasonix-core/index.ts

// 类型
export type {
  JSONSchema,
  ToolFunctionSpec,
  ToolSpec,
  ToolCall,
  Role,
  ChatMessage,
  RawUsage,
  ChatRequestOptions,
} from "./types.js";

// 客户端
export { DeepSeekClient, Usage } from "./client.js";
export type { ChatResponse, StreamChunk, DeepSeekClientOptions } from "./client.js";

// 工具注册
export { ToolRegistry } from "./tools.js";
export type { ToolDefinition, ToolCallContext } from "./tools.js";

// 配置管理
export {
  defaultConfigPath,
  loadApiKey,
  loadBaseUrl,
  isPlausibleKey,
  redactKey,
  saveApiKey,
  saveBaseUrl,
} from "./config.js";

// 前缀管理
export { ImmutablePrefix, VolatileScratch } from "./memory/runtime.js";

// 重试
export { fetchWithRetry } from "./retry.js";
export type { RetryOptions, RetryInfo } from "./retry.js";

// Schema 工具
export { analyzeSchema, flattenSchema, nestArguments } from "./repair/flatten.js";

// 确认门控
export { PauseGate } from "./core/pause-gate.js";

// LRU 缓存
export { LruCache, TtlLruCache } from "./core/lru.js";

// 速率限制
export { ToolRateLimiter } from "./tools/rate-limit.js";

// 环境变量
export { loadDotenv } from "./env.js";

// 截断工具
export { truncateForModel, DEFAULT_MAX_RESULT_CHARS } from "./utils/truncate.js";

// 原子写入
export { atomicWriteSync } from "./core/atomic-write.js";

// 运行中追踪
export { InflightSet } from "./core/inflight.js";
```

---

## 六、在新项目中的使用示例

```typescript
import {
  DeepSeekClient,
  ToolRegistry,
  ImmutablePrefix,
  loadDotenv,
} from "./lib/reasonix-core/index.js";

loadDotenv();

// 1. 创建工具注册表
const tools = new ToolRegistry();

tools.register({
  name: "query_character",
  description: "查询角色信息",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "角色名" },
    },
    required: ["name"],
  },
  fn: async ({ name }) => {
    // 调用你的 SQLite 查询
    return JSON.stringify({ name, level: 42, hp: 1200 });
  },
  readOnly: true,
});

tools.register({
  name: "update_character",
  description: "更新角色状态",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      field: { type: "string" },
      value: { type: "string" },
    },
    required: ["name", "field", "value"],
  },
  fn: async ({ name, field, value }) => {
    return JSON.stringify({ success: true });
  },
  readOnly: false,
});

// 2. 创建客户端
const client = new DeepSeekClient();

// 3. 非流式调用
const response = await client.chat({
  model: "deepseek-v4-flash",
  messages: [
    { role: "system", content: "你是小说创作助手。" },
    { role: "user", content: "查询主角叶凡的当前状态" },
  ],
  tools: tools.specs(),
});

console.log(response.content);
console.log(response.toolCalls);  // 模型可能会调用 query_character

// 4. 流式调用
for await (const chunk of client.stream({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "写一段战斗描写" }],
})) {
  if (chunk.contentDelta) process.stdout.write(chunk.contentDelta);
  if (chunk.usage) console.log("\nCache hit:", chunk.usage.cacheHitRatio);
}

// 5. 工具调度
const result = await tools.dispatch("query_character", '{"name": "叶凡"}');
console.log(result);

// 6. 缓存前缀
const prefix = new ImmutablePrefix({
  system: "你是《剑道独尊》的专职创作助手。世界观设定：...",
  toolSpecs: tools.specs(),
});

// prefix.fingerprint 可用于监控缓存是否稳定
console.log("Prefix fingerprint:", prefix.fingerprint);
```

---

## 七、提取执行步骤（按顺序）

### Step 1：创建目录结构
```bash
mkdir -p lib/reasonix-core/{core,memory,repair,tools,utils}
```

### Step 2：复制零改造文件（11 个）
```bash
# Tier 0
cp src/types.ts                lib/reasonix-core/types.ts
cp src/retry.ts                lib/reasonix-core/retry.ts
cp src/core/inflight.ts        lib/reasonix-core/core/inflight.ts
cp src/core/lru.ts             lib/reasonix-core/core/lru.ts
cp src/tools/rate-limit.ts     lib/reasonix-core/tools/rate-limit.ts

# Tier 1
cp src/env.ts                  lib/reasonix-core/env.ts
cp src/core/atomic-write.ts    lib/reasonix-core/core/atomic-write.ts
cp src/tools/read-tracker.ts   lib/reasonix-core/tools/read-tracker.ts
cp src/tools/truncated-result-saver.ts lib/reasonix-core/tools/truncated-result-saver.ts
cp src/repair/flatten.ts       lib/reasonix-core/repair/flatten.ts
```

### Step 3：复制并微调文件（4 个）
```bash
# 客户端 — 原样复制
cp src/client.ts               lib/reasonix-core/client.ts

# 工具注册表 — 原样复制，改 import 路径
cp src/tools.ts                lib/reasonix-core/tools.ts
```

### Step 4：复制并改造文件（3 个）
```bash
# pause-gate.ts — 内联 permission-types
cp src/core/pause-gate.ts      lib/reasonix-core/core/pause-gate.ts

# memory/runtime.ts — 删除 AppendOnlyLog
cp src/memory/runtime.ts       lib/reasonix-core/memory/runtime.ts
```

### Step 5：创建精简版文件（2 个新文件）
- `lib/reasonix-core/config.ts` — 精简版（见 2.2 节）
- `lib/reasonix-core/utils/truncate.ts` — 从 registry.ts 提取（见 2.3 节）

### Step 6：创建统一入口
- `lib/reasonix-core/index.ts`（见第五节）

### Step 7：安装依赖
```bash
npm install eventsource-parser
```

### Step 8：验证编译
```bash
npx tsc --noEmit lib/reasonix-core/index.ts
```

---

## 八、风险与注意事项

1. **ESM 要求**：Reasonix 是 ESM 项目（`"type": "module"`），你的项目也需要是 ESM，或者在 tsconfig 中设置 `"module": "ESNext"` + `"moduleResolution": "bundler"`
2. **TypeScript 严格模式**：Reasonix 使用 `strict` + `noUncheckedIndexedAccess`，提取的代码同样需要这些选项
3. **Node.js 版本**：Reasonix 要求 Node ≥ 22，但提取的核心组件只需要 Node ≥ 18（fetch API）
4. **config 路径**：精简版 config 将默认路径从 `~/.reasonix/config.json` 改为 `~/.storyforge/config.json`，避免冲突
5. **truncated-result-saver.ts**：路径中引用了 `.reasonix` 目录，可选择性改为 `.storyforge`
6. **AppendOnlyLog 未提取**：它依赖 `session.ts`（300+ 行），而书灵有自己的 SQLite 数据层。如需要可以自行实现
7. **CacheFirstLoop 未提取**：这是 Reasonix 的 Agent 主循环，书灵需要自己的五阶段引擎。上面提取的组件足够构建你自己的 Agent 循环

---

## 九、总结

| 指标 | 数量 |
|------|------|
| 提取文件总数 | 17 个 |
| 原样复制 | 11 个 |
| 改 import 路径 | 2 个 |
| 精简/改造 | 4 个 |
| 需要安装的 npm 包 | 1 个（`eventsource-parser`） |
| 总代码行数（估计） | ~1500 行 |
| Reasonix 原项目总行数 | ~100,000+ 行 |
| 提取比例 | ~1.5% |
