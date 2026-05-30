# 「书灵」StoryForge 创作引擎设计报告

**版本**：3.2  
**定位**：Agent 主导全流程的超长篇网文创作系统，采用极简 Skill-Tool 驱动架构，运行时仅保留纯 ReAct 循环  
**核心理念**：对话即创作，Agent 自主决策流程，工具赋予能力，人类只在十字路口掌舵

---

## 一、项目概述

### 1.1 项目背景

长篇网文创作（千万字级别）面临设定一致性、创作效率和 AI 协作深度三大核心难题。现有工具多为单次问答式，缺乏对完整创作流程的深度支持。「书灵」旨在将 AI 从被动工具升级为主动协作者，覆盖从世界观构筑到章节成文的全流程。

### 1.2 核心目标

1. **知识管理**：结构化存储世界观、角色、技能、势力、时间线等所有创作要素
2. **智能规划**：Agent 自主完成从叙事大纲到微观脚本的多层级任务拆解与执行
3. **辅助创作**：基于结构化脚本和实时状态进行文本生成与修改
4. **自动校验**：在关键节点自动检查数值一致性、角色状态连续性、时间线合理性
5. **多题材迁移**：通过配置驱动，支持玄幻、都市、言情、灵异等多种题材

### 1.3 设计原则

- **本地优先**：所有数据存储在本地 SQLite 数据库，无需云端服务
- **异步安全**：所有数据库访问通过 Worker 线程异步化，彻底消除阻塞，保障流式交互
- **配置驱动**：题材差异通过配置文件和模板实现，无需修改核心代码
- **动静分离**：system prompt 在会话期间永远不变，动态数据通过工具查询返回进入消息流，最大化前缀缓存命中率
- **人工掌舵**：Agent 自主决策流程并通过工具查询获取所需信息，仅在不可逆写入或关键分叉时暂停等待用户确认
- **事务一致**：所有状态变更在用户确认后一次性原子提交，并生成世界状态快照，支持回滚
- **极简运行时**：Agent 运行时仅保留纯 ReAct 循环，不设外层编排；所有创作域智能通过 skills（按需加载的指令文本）和 tools（查询/写入/校验工具）赋予 Agent
- **成熟复用**：运行时的底层能力（API 客户端、工具注册、前缀缓存、重试机制）复用经生产验证的 Reasonix 核心组件

---

## 二、系统架构总览

### 2.1 技术选型

| 层级 | 技术 | 说明 |
|:---|:---|:---|
| **前端** | Vue 3 + Vite | 组合式 API，IDE 式三栏布局，编辑器采用虚拟滚动支撑千万字级文档 |
| **路由** | Vue Router 4 | SPA 路由管理 |
| **状态管理** | Pinia | 轻量状态管理，维护当前项目、布局模式等全局状态 |
| **编辑器** | Tiptap (Vue 3 版) | 富文本编辑，支持 Markdown，结合分片加载与虚拟 DOM 优化大文档性能 |
| **可视化** | vis-network / ECharts | 知识图谱 / 时间线可视化 |
| **后端** | Express.js | REST API + SSE 流式输出，托管前端构建产物 |
| **数据库** | SQLite（通过异步 Worker 线程访问） | 每个项目一个独立文件，主线程通过消息队列请求，Worker 内同步执行，彻底避免阻塞 |
| **Agent 核心** | Reasonix 提取组件 (`lib/reasonix-core/`) | 复用 DeepSeek API 客户端、工具注册表、缓存前缀管理、重试机制、确认门控等底层组件 |
| **AI 服务** | DeepSeek API | 支持 Function Calling、JSON 结构化输出、极长上下文及自动前缀缓存 |
| **运行方式** | 浏览器访问 localhost | 纯本地网页应用 |

### 2.2 分层架构

| 层级 | 职责 | 核心组件 |
|:---|:---|:---|
| **交互层** | 用户界面与操作 | IDE 式三栏界面、虚拟滚动编辑器、可视化组件、对话指挥台 |
| **业务层** | 创作数据管理 | 知识检索服务、时间线管理、卡片生成器、状态事务管理器 |
| **Agent 层** | 智能规划与执行 | `StoryForgeLoop`（纯 ReAct 循环）+ Skills 加载器 + 全量创作工具集 |
| **基础设施层** | 通用能力与持久化 | `DeepSeekClient`、`fetchWithRetry`、`PauseGate`、`ToolRateLimiter`、SQLite Worker 线程、FTS5 全文检索、状态快照与版本管理 |

### 2.3 项目结构

每个小说项目对应一个独立的 SQLite 数据库文件，存储在 `data/` 目录下。前端通过路由参数识别项目，后端根据项目 ID 分配对应的 Worker 线程处理所有数据库操作。项目间数据完全隔离，支持自由备份和迁移。

### 2.4 组件复用策略

底层组件从 [Reasonix](https://github.com/esengine/DeepSeek-Reasonix) 提取，复制到 `lib/reasonix-core/` 目录，作为书灵内部库使用，不依赖 npm 包。

`CacheFirstLoop`（`src/loop.ts`，~1100 行 + 11 个辅助文件）**不直接提取**——它与 Reasonix 的 `ContextManager`、`ToolCallRepair`、Hook 系统、Session JSONL、`ReadTracker`、steer 等专有模块深度耦合。书灵从中提取核心 ReAct 循环模式，自建精简的 `StoryForgeLoop`（~200 行）。

**提取的组件清单：**

| 组件 | 源文件 | 职责 | 在书灵中的角色 |
|:---|:---|:---|:---|
| `DeepSeekClient` | `client.ts` | DeepSeek API 非流式/流式调用，SSE 解析，usage 统计与缓存命中率计算 | Agent 与 DeepSeek 通信的唯一入口 |
| `Usage` | `client.ts` | 封装 prompt_tokens、cache_hit/miss 等统计字段 | 缓存效果监控与成本追踪 |
| `ToolRegistry` | `tools.ts` | 工具注册、Schema 扁平化、调度分发、拦截器、速率限制 | 所有创作工具的注册与调用中枢 |
| `ImmutablePrefix` | `memory/runtime.ts` | 稳定系统前缀 + 工具规格列表 + fingerprint 计算 | 永不变的 system prompt 管理，保证前缀缓存命中率 |
| `PauseGate` | `core/pause-gate.ts` | 异步确认门控 | 实现 A/B/C 三级人工确认模型的核心机制 |
| `fetchWithRetry` | `retry.ts` | 指数退避 + 抖动 + Retry-After 头解析，4 次重试 | API 调用层的容错保障 |
| `ToolRateLimiter` | `tools/rate-limit.ts` | 滑动窗口速率限制，支持全局与单工具两级配额 | 防止 Agent 工具调用循环耗尽 API 预算 |
| `flattenSchema` / `nestArguments` | `repair/flatten.ts` | 深层 JSON Schema 扁平化 → 嵌套还原 | 确保复杂工具参数 Schema 不被模型丢失 |
| `truncateForModel` | `utils/truncate.ts` | 基于 UTF-16 对齐的文本截断 | 工具返回结果超长时的安全裁剪 |
| `atomicWriteSync` | `core/atomic-write.ts` | 原子文件写入（写临时文件 → rename） | 配置文件持久化 |
| `loadDotenv` | `env.ts` | .env 文件加载 | 开发环境 API Key 管理 |

**自建组件清单：**

| 组件 | 职责 | 形态 |
|:---|:---|:---|
| **StoryForgeLoop** | 从 `CacheFirstLoop.step()` 提取核心 ReAct 循环模式的精简运行时（~200 行），保留核心能力（循环、流式、取消、迭代上限、消息逐条持久化） | 运行时核心 |
| **Skill 存储与加载器** | 管理技能指令文本的存储，通过 `get_skill(name)` 工具按需返回给 Agent | 工具 + 数据库存储 |
| **知识检索服务** | 从 SQLite 检索角色、设定、时间线数据，为查询工具提供后端 | 查询工具后端 |
| **数值计算引擎** | 伤害/成长/代价等确定性计算，生成时注入标记 | 工具（`battle_simulate` 等） |
| **校验服务** | 数值一致性、时间线逻辑、角色状态连续性等确定性校验 | 工具（`validate_consistency` 等） |
| **状态管理器** | SQLite 事务、快照、版本管理 | 工具后端 |
| **SQLite Worker 线程** | 异步化所有数据库操作，主线程通过消息队列请求 | 基础设施 |

**外部依赖（仅 1 个 npm 包）：**

| 包名 | 版本 | 用途 |
|:---|:---|:---|
| `eventsource-parser` | `^3.0.0` | SSE 流解析，被 `DeepSeekClient` 使用 |

---

## 三、Agent 运行时设计

### 3.1 设计理念

Agent 运行时采用**极简 Skill-Tool 驱动**架构：运行时本身只是一个纯 ReAct 循环，不包含任何外层编排逻辑。Agent 的所有创作智能来自三个方面：

1. **System Prompt**（永不变）：定义 Agent 的角色、核心能力和行为原则
2. **Skills**（按需加载）：通过 `get_skill(name)` 工具获取的技能指令文本，指导 Agent 如何完成特定类型的任务
3. **Tools**（全量注册）：所有创作工具始终可用，Agent 自主决定调用哪些工具

五阶段的流程约束是**软约束**：system prompt 告诉 Agent 五阶段方法论，工具在前置条件不满足时返回错误提示，Agent 自己决定如何响应。

### 3.2 StoryForgeLoop

`StoryForgeLoop` 是书灵自建的精简运行时，从 `CacheFirstLoop.step()` 提取核心模式：

**为什么不能直接提取 `CacheFirstLoop`**：

| 耦合模块 | 行数（估） | 书灵需要 |
|:---|:---|:---|
| 核心 ReAct 循环 | ~200 | **需要** |
| `ToolRegistry.dispatch` + 结果追加 | ~100 | **需要** |
| `AbortController` / 取消处理 | ~80 | **需要** |
| 流式响应 | ~150 | **需要** |
| `reasoning_content` 处理 | ~30 | **需要** |
| 预算管理与告警 | ~40 | 可选 |
| 迭代上限 + 强制摘要 | ~30 | 可选 |
| 消息修复（oversized args 截断） | ~60 | 可选 |
| `ToolCallRepair`（风暴检测、重复调用防护） | ~80 | **不需要** |
| `ContextManager` / 历史折叠 | ~120 | **不需要** |
| Session 持久化（JSONL 读写） | ~100 | **不需要** |
| Hooks（`PreToolUse` / `PostToolUse`） | ~60 | **不需要** |
| Mid-turn steer | ~40 | **不需要** |
| `ReadTracker`（文件编辑门控） | ~20 | **不需要** |

解耦 `CacheFirstLoop` 涉及十余个内部模块的剥离，工作量远大于从核心模式写一个干净版本。

**运行时组件结构**：

```
StoryForgeLoop
├── DeepSeekClient       — API 通信（提取，直接复用）
├── ToolRegistry         — 工具注册与调度（提取，直接复用）
├── ImmutablePrefix      — 永不变的 system prompt（提取，直接复用）
├── PauseGate            — 确认门控（提取，直接复用）
├── ToolRateLimiter      — 速率限制（提取，直接复用）
├── fetchWithRetry       — 重试容错（提取，直接复用）
└── 自建逻辑
    ├── ReAct 循环（while has_tool_calls → chat → dispatch → append）
    ├── AbortController 集成
    ├── 流式响应支持（复用 DeepSeekClient.stream）
    ├── reasoning_content 处理
    ├── 迭代上限保护
    └── 消息逐条持久化到 SQLite
```

**核心工作循环**：

```typescript
class StoryForgeLoop {
  private client: DeepSeekClient;
  private tools: ToolRegistry;
  private prefix: ImmutablePrefix;
  private messages: ChatMessage[] = [];
  private abortController = new AbortController();

  async *runTurn(userInput: string): AsyncGenerator<EngineEvent> {
    this.appendMessage({ role: "user", content: userInput });

    for (let iter = 0; iter < this.maxIter; iter++) {
      if (this.abortController.signal.aborted) break;

      const response = await this.client.chat({
        model: this.model,
        messages: [...this.prefix.toMessages(), ...this.messages],
        tools: this.prefix.tools(),
      });

      this.appendMessage(response.content);

      if (response.toolCalls.length === 0) {
        yield { type: "done", content: response.content };
        return;
      }

      for (const call of response.toolCalls) {
        const result = await this.tools.dispatch(
          call.function.name,
          call.function.arguments,
          { signal: this.abortController.signal }
        );
        this.appendMessage({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
        yield { type: "tool_result", call, result };
      }
    }
  }

  private appendMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.sqliteWorker.post({
      type: "append_message",
      sessionId: this.sessionId,
      message: serializeMessage(message),
    });
  }
}
```

### 3.3 System Prompt（永不变）

System prompt 在整个会话期间**永远不变**，最大化 DeepSeek 前缀缓存命中率：

```
你是「书灵」创作引擎，服务于长篇网文创作。

## 你的核心能力

你拥有一系列工具来查询信息、编辑设定、生成文本。你需要主动使用这些工具来获取你需要的上下文，而不是等待信息被提供给你。

## 五阶段创作方法论（软约束）

你被设计为遵循五阶段创作流程：设定→大纲→时间线→脚本→成文。这是一个经过验证的最佳实践，但你可以根据实际情况灵活调整。当你发现前置条件未满足时（如尝试写正文但大纲未完成），你应该先补完前置工作。

## 工具使用原则

- 先查后写：在修改任何内容前，先用查询工具了解当前状态
- 主动获取技能：遇到不熟悉的任务类型时，调用 get_skill() 获取详细操作指南
- 数值由引擎计算：涉及伤害、成长等数值时，调用数值计算工具，用 {{类型:值}} 标记写入文本
- 重大修改需确认：写入类工具会根据操作级别要求用户确认

## 数值标记语法

生成文本时，涉及数值的内容必须使用 {{类型:值}} 标记，如 {{damage:8500}}、{{growth:金丹期}}。校验器会自动比对标记值与引擎计算值。

[项目：{project_name} | 题材：{genre} | 风格：{style}]
```

唯一导致 cache miss 的情况：用户修改项目核心设定（书名、题材、风格）时需要更新末尾的 `[项目：...]` 行。这种情况极少发生。

### 3.4 工具集设计

所有工具在会话开始时全量注册，不按阶段切换。Agent 根据任务需要自主选择工具。

#### 3.4.1 工具分类

**信息查询类**（只读，A级确认）：

| 工具 | 参数 | 返回 |
|:---|:---|:---|
| `query_project_status` | 无 | 项目进度、已完成阶段、当前状态概览 |
| `query_character` | `name: string` | 角色档案 + 当前状态（HP、修为、位置等） |
| `query_characters` | `filter?: string` | 按条件筛选角色列表 |
| `query_setting` | `topic: string` | 设定查询（力量体系、地理、势力等） |
| `query_timeline` | `range: {from, to}` | 指定时间范围的事件序列 |
| `query_recent_plot` | `n: number` | 最近 N 章的剧情摘要 |
| `query_outline` | `volume?: number` | 大纲结构，含伏笔标记 |
| `query_script` | `sceneId: string` | 指定场景的创作脚本 |
| `query_relations` | `character: string` | 角色的直接关系网络 |

**技能查询类**（只读，A级确认）：

| 工具 | 参数 | 返回 |
|:---|:---|:---|
| `get_skill` | `name: string` | 技能指南的完整指令文本 |

**写入类**（带确认门控，B/C级）：

| 工具 | 确认级别 | 说明 |
|:---|:---|:---|
| `edit_setting` | B/C | 编辑世界观设定（C级：力量体系规则变更） |
| `edit_character` | B/C | 编辑角色档案（C级：角色死亡/重大转变） |
| `edit_outline` | B | 增删大纲节点 |
| `edit_timeline` | C | 修改时间线事件（因果链调整） |
| `write_script` | B | 写入/更新创作脚本 |
| `write_text` | B | 写入正文片段 |
| `update_character_state` | B | 更新角色状态 |
| `confirm_checkpoint` | C | 确认并提交状态快照 |
| `rollback` | C | 回滚到指定快照 |

**数值计算类**（只读，A级确认）：

| 工具 | 说明 |
|:---|:---|
| `battle_simulate` | 战斗预演（伤害范围、胜率估计） |
| `calculate_growth` | 成长/突破后的属性面板计算 |
| `calculate_damage` | 单次伤害计算 |
| `track_cost` | 代价等级追踪与阈值警告 |

**校验类**（只读，A级确认）：

| 工具 | 说明 |
|:---|:---|
| `validate_consistency` | 全局一致性校验（数值偏差、角色状态连续性、力量体系约束） |
| `validate_timeline` | 时间线因果逻辑校验 |

#### 3.4.2 确认级别的实现

确认逻辑嵌入在工具函数内部，通过 `PauseGate` 实现：

```typescript
tools.register({
  name: "edit_timeline",
  description: "修改时间线事件（因果链调整）",
  parameters: { type: "object", properties: { ... } },
  fn: async (args, ctx) => {
    const verdict = await ctx.gate.ask({
      kind: "plan_proposed",
      payload: { summary: summarizeChange(args) },
    });
    if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
    // 执行修改...
    return JSON.stringify({ success: true });
  },
});
```

**A级（全自动）**：只读查询、数值计算、校验。不调用 `PauseGate`。

**B级（通知式确认）**：非关键写入。工具内部调用 `PauseGate.ask`，生成可撤回的通知卡片，用户未干预则自动生效。

**C级（阻断式确认）**：世界观规则修改、时间线因果调整、角色死亡/重大转变、章节定稿提交。工具内部调用 `PauseGate.ask`，必须用户主动批准。

### 3.5 Skill 机制

#### 3.5.1 什么是 Skill

Skill 是一段**指令文本**，指导 Agent 如何完成特定类型的创作任务。类似于 Claude Code / opencode 的 skill 机制——当 Agent 需要做某类任务时，通过 `get_skill(name)` 工具获取对应的详细指南。

Skill 不占用 system prompt 的空间。它只在 Agent 需要时被加载，作为工具返回值进入消息流。

#### 3.5.2 技能清单

| Skill 名称 | 内容 | 估计 Token |
|:---|:---|:---|
| `worldbuilding` | 世界观构筑指南：如何设计力量体系、地理、势力、种族 | ~500 |
| `outline` | 大纲编写指南：情节弧结构、伏笔管理、节奏控制 | ~400 |
| `timeline` | 时间线规划指南：多线叙事编排、因果链验证 | ~300 |
| `script` | 创作脚本编写指南：场景分解、数值约束注入、卡片系统 | ~400 |
| `writing` | 文本生成指南：场景描写、对话、战斗、情感、数值标记 | ~500 |
| `battle` | 战斗场景专项：节奏控制、招式设计、伤害计算流程 | ~300 |
| `power_system` | 力量体系设计专项：境界划分、突破条件、技能树 | ~300 |

#### 3.5.3 Skill 示例

`get_skill("battle")` 返回的技能文本示例：

```
## 战斗场景创作指南

### 流程
1. 调用 query_character 获取参战双方的当前状态（修为、HP、装备）
2. 调用 query_setting 查询相关力量体系规则（如天劫规则、属性克制）
3. 调用 battle_simulate 进行战斗预演，获取伤害范围和胜率
4. 调用 write_script 生成结构化战斗脚本，将数值约束写入脚本
5. 调用 write_text 生成战斗正文，使用 {{damage:值}}、{{growth:值}} 标记数值
6. 调用 validate_consistency 校验数值一致性

### 数值标记规范
- 伤害：{{damage:8500}} — 必须在 battle_simulate 返回的范围内
- 恢复：{{heal:1200}} — 不超过角色精神力上限的 30%
- 突破：{{growth:金丹期}} — 必须满足 query_setting 返回的突破条件

### 写作要点
- 每个回合交替描写双方视角
- 数值标记紧跟在对应的描写之后
- 绝杀/关键转折需用户 C 级确认
```

#### 3.5.4 Skill 存储与扩展

技能文本存储在 SQLite 的 `skills` 表中，支持：
- **内置技能**：系统预装的核心技能
- **用户自定义技能**：用户可以创建自己的技能（如"我喜欢的战斗节奏"）
- **题材技能**：随题材模板加载的专用技能（如玄幻的"天劫场景"、都市的"商战场景"）

### 3.6 典型交互流程

```
用户: "给叶凡安排一场突破金丹的战斗"

Agent 工具调用序列:
  → query_character("叶凡")
    返回: { name: "叶凡", stage: "筑基九层", hp: 1200, location: "天柱峰" }

  → query_setting("金丹期突破条件")
    返回: { requirement: "筑基圆满 + 天劫洗礼 + 灵力凝丹", tribulation: "三重天雷" }

  → get_skill("battle")
    返回: [战斗场景创作指南全文...]

  → battle_simulate({ attacker: "叶凡", tribulation: true, ... })
    返回: { damageRange: [7200, 9800], survivalRate: 0.73, ... }

  → edit_outline({ action: "add_node", ... })          [B级确认]

  → write_script({ sceneType: "battle", ... })         [B级确认]

  → write_text({ content: "天雷轰然落下...{{damage:8500}}..." })  [B级确认]

  → update_character_state({ character: "叶凡", newStage: "金丹期" })  [B级确认]

  → validate_consistency()
    返回: { passed: true, checks: [...] }

  → confirm_checkpoint({ description: "叶凡突破金丹期" })  [C级确认]
```

Agent 自主规划了完整的工具调用序列——从查询到写入到校验到提交，没有任何外层代码编排。

### 3.7 会话与状态持久化

**对话消息**：`messages: ChatMessage[]` 数组在内存中维护，同时**逐条追加写入** SQLite 的 `agent_messages` 表。每条消息在产生时立即持久化，确保崩溃恢复、会话恢复和审计追踪。

**会话恢复**：启动时从 SQLite 加载历史消息，重建 `messages` 数组：

```typescript
const savedMessages = await sqliteWorker.query(
  "SELECT * FROM agent_messages WHERE session_id = ? ORDER BY seq ASC",
  [sessionId]
);
const messages: ChatMessage[] = [
  ...prefix.toMessages(),
  ...savedMessages.map(m => deserializeMessage(m)),
];
```

**创作数据**：角色、设定、大纲、时间线、脚本、正文等存储在结构化的 SQLite 表中，通过工具的读写操作维护。数据不依赖消息历史——即使清空会话，所有创作数据完好无损。

**状态快照**：用户通过 `confirm_checkpoint` 工具确认提交时，状态管理器生成全局快照，记录所有受影响实体的属性值。片段版本关联其确认时的快照 ID，支持回滚。

---

## 四、核心创作模型：五阶段金字塔

长篇创作被抽象为五个递进阶段，新增大纲层填补了从设定到执行之间的叙事结构空白。五阶段作为**软约束**体现在 system prompt 中，Agent 自主决策如何遵循。

### 阶段一：构筑基石（世界观与设定）

**目标**：建立故事世界的"真理之源"。

**核心任务**：创建世界观框架、力量体系、角色基础档案、势力格局及题材特有规则。

**Agent 行为**：用户通过对话表达题材与偏好，Agent 自动加载题材模板，调用设定生成工具产出草案，在对话中展示摘要并请求 C 级确认。确认后所有设定写入数据库，成为"唯一真理源"。

**输出**：完整的世界观设定文档、角色档案库、力量体系规则书。

### 阶段二：编织蓝图（叙事大纲规划）

**目标**：构建故事的宏观叙事骨架，定义情节走向、节奏与伏笔。

**核心任务**：划分卷章结构，确定每章核心事件与情节功能，标注关键伏笔和回收点，规划角色成长弧线。

**Agent 行为**：根据用户粗略意图自动生成大纲树草案，标注冲突、转折点和伏笔，自动检查是否符合力量体系成长曲线。生成可视化大纲节点，标出创意分叉点供用户选择（C 级确认）。

**输出**：多层级结构化大纲树，每章包含情节摘要、伏笔标记、情绪曲线等元数据。

### 阶段三：编织命运（时间线规划）

**目标**：将大纲事件落实为精确的时间序列，确保因果逻辑和时间一致性。

**核心任务**：规划世界宏观时间线，细化每卷时间线，标注事件因果链，关联角色成长节点。

**Agent 行为**：基于已确认的大纲自动生成卷级和章级时间线，运行时间冲突检测，如有冲突自动建议调整方案。用户浏览时间轴后只需 C 级批准即可。

**输出**：世界级、卷级、章节级的多层时间线图谱。

### 阶段四：设计蓝图（脚本规划）

**目标**：为每个故事单元制定详细的创作脚本，作为文本生成的"施工图纸"。

**核心任务**：根据大纲和时间线生成场景级脚本，包含场景序列、出场角色、冲突类型、关键对话要点，战斗场景附加数值约束，情感场景附加好感度变化预期。

**Agent 行为**：识别大纲节点中标注的场景类型，加载对应卡片模板，自动提取角色当前状态摘要和直接关系（遵循信息注入协议，不泄露未来剧情）。调用数值引擎进行战斗预演，将约束注入脚本。脚本作为草案，以 B 级通知形式展示，用户可对话调整。

**输出**：结构化创作脚本，包含所有必要信息与数值边界。

### 阶段五：赋予生命（文本创作）

**目标**：严格依据脚本完成文本创作，确保质量与设定一致性。

**核心任务**：逐场景生成文本，针对性修改，更新角色状态，记录时间线事件，自动校验。

**Agent 行为**：流式生成文本，自动进行片段级自我校验（基于主动数值标记）。章节初稿完成后自动生成修改建议摘要。用户定稿指令下达后，Agent 将所有状态变更整理为 C 级确认摘要，批准后事务性提交，同时生成世界状态快照与章节版本关联。

**输出**：结构化的章节内容，确认后的角色状态更新，完整的时间线记录。

---

## 五、用户界面设计：IDE 式三栏工作台

系统前端采用类 VS Code 的三栏可折叠布局，彻底解决 Agent 全流程模式下的成果查阅与 token 消耗矛盾。

### 5.1 整体布局

| 面板 | 位置 | 默认宽度 | 核心职责 |
|:---|:---|:---|:---|
| **项目文件树** | 左侧 | 可折叠 | 以五阶段为骨架的层级目录，汇聚所有已生成的结构化成果 |
| **内容浏览与审核区** | 中央 | 弹性扩展 | 展示选中文件的详细内容（文本、图表、表单），支持审阅、批注与版本对比 |
| **对话指挥台** | 右侧 | 可折叠 | 与 Agent 进行自然语言交互的唯一入口，仅保留意图指令与关键确认卡片 |

底部状态栏显示项目名、在线状态、缓存命中率等元信息。所有面板均可拖拽调整大小，支持独立折叠与布局记忆。

### 5.2 左侧：项目文件树

采用固定的五阶段分类树，Agent 每完成一项产出，相关文件便自动创建并插入对应位置，附上状态图标（草稿/待审/已定稿）。

```
📁 书灵 - 《剑道独尊》
├─ 📁 01-世界观设定
│  ├─ 🌍 宇宙法则
│  ├─ ⚡ 力量体系（金丹元婴）
│  └─ 🏛 势力分布
├─ 📁 02-叙事大纲
│  ├─ 📘 第一卷：外门风云
│  └─ 📊 伏笔索引
├─ 📁 03-时间线
│  ├─ ⏳ 世界线总览
│  └─ 🕒 第一卷时间线
├─ 📁 04-创作脚本
│  └─ 🎬 第一幕·入门试炼（战斗卡）
└─ 📁 05-章节成文
   ├─ ✍️ 第一章：剑碎凌霄（定稿）
   └─ 🖊 第二章：暗流涌动（草稿）
```

点击文件即在中央区域打开对应内容。右键菜单支持重命名、导出、查看历史版本。Agent 生成新内容后树节点自动刷新。

### 5.3 中央：内容浏览与审核区

根据文件类型自适应渲染不同的查看器：

- **文本类**：富文本阅读模式，支持片段折叠/展开，数值标记高亮。审核时自动调出状态变更对比面板，左右分栏显示新旧版本差异。
- **可视化类**：时间线横向拖拽轴、关系力导图、力量体系树状图等，均可交互探索。
- **审核对比模式**：当 Agent 提交 C 级确认时，自动进入对比视图，高亮所有差异，底部提供"批准""驳回""逐条决定"按钮。

用户还可对未定稿内容进行有限的直接编辑（如修正错别字），编辑后的内容自动回传 Agent 作为后续上下文参考。

### 5.4 右侧：对话指挥台

对话区被精简为纯意图驱动的轻面板。Agent 产出的完整内容绝不在此展开，仅显示摘要卡片与确认控件。例如生成一卷大纲后，对话中只显示"📘 第一卷大纲已生成，共10章，3个关键伏笔。[点击查看]"，点击后中央区域自动跳转。B 级通知卡片自动出现，C 级阻断式确认卡片仅显示冲突点和选项。

### 5.5 面板折叠与布局记忆

每个面板可一键折叠为极窄图标栏，悬停临时展开。用户可将常用布局存为预设（如"写作模式""审阅模式"），系统记忆偏好并在启动时恢复。

---

## 六、数据架构设计

### 6.1 异步数据库访问

每个项目独占一个 SQLite Worker 线程，维护该数据库文件的唯一长连接。主线程通过消息队列发送查询或写入请求，Worker 内部使用同步驱动高效执行，结果通过结构化消息异步返回。连接池管理器负责 Worker 的创建、复用和超时销毁，并实现请求超时与错误重试机制，确保主线程永远非阻塞。

### 6.2 数据库核心表

- **基础数据表**：角色、物品、势力、地点，采用固定字段+动态JSON扩展，动态字段通过生成列与索引优化查询性能
- **章节与片段表**：章节内容拆为独立片段，每个片段包含类型、出场角色、地点、情感基调等元数据及正文大字段
- **知识图谱表**：节点表与关系表，支持递归 CTE 查询，强制设置最大深度与路径数量限制，防止组合爆炸
- **时间线表**：存储所有故事事件，支持多重时间维度，事件关联出场角色与地点
- **配置与模板表**：entity_configs 定义题材自定义字段，card_templates 存储脚本模板布局，支撑多题材迁移
- **Agent 专用表**：agent_messages 逐条持久化对话消息（含 seq 序号和时间戳），agent_sessions 管理会话元数据，agent_memories 存储长期语义记忆，user_preferences 记录用户写作偏好，skills 存储技能指令文本

### 6.3 动态字段索引优化

针对 JSON 字段中的题材特有属性，系统根据 entity_configs 的索引标记自动创建生成列并建立索引，确保按自定义属性排序或范围查询时性能达到 B-tree 级别，避免全表扫描。

### 6.4 全文检索

使用 SQLite FTS5 引擎与 ngram 分词（n=2）实现中文全文检索，满足创作场景下的关键词搜索需求。高级用户可扩展 jieba 分词插件以获得更精准效果。

### 6.5 片段版本与全局状态快照

每次确认章节并触发状态更新时，系统生成一个全局状态快照，记录所有受影响实体的属性值。片段版本记录关联其确认时的快照 ID，实现"回滚到任意版本并还原世界状态"的完整能力。

---

## 七、智能上下文管理策略

### 7.1 核心原则：System Prompt 永不变

- **System prompt 在整个会话期间永远不变**——不注入角色档案、不注入设定摘要、不注入时间线片段
- **所有动态数据通过工具查询返回**——作为 `tool` 角色的消息追加到消息流中，不触碰前缀
- **技能通过 `get_skill()` 按需加载**——不占用 system prompt 空间，只在 Agent 需要时加载

这种策略的本质是：**让 Agent 自己决定需要什么信息，通过工具调用主动获取**。

### 7.2 消息流结构

```
messages[0]     = { role: "system",  content: "永不变的 system prompt" }
messages[1]     = { role: "user",   content: "给叶凡安排一场突破金丹的战斗" }
messages[2]     = { role: "assistant", tool_calls: [{ name: "query_character", ... }] }
messages[3]     = { role: "tool",   content: "{ name: '叶凡', stage: '筑基九层', ... }" }
messages[4]     = { role: "assistant", tool_calls: [{ name: "get_skill", ... }] }
messages[5]     = { role: "tool",   content: "## 战斗场景创作指南\n..." }
messages[6]     = { role: "assistant", tool_calls: [{ name: "battle_simulate", ... }] }
messages[7]     = { role: "tool",   content: "{ damageRange: [7200, 9800], ... }" }
messages[8]     = { role: "assistant", content: "好的，我已经掌握了叶凡的状态..." }
...
```

### 7.3 缓存策略

| 消息部分 | 变化频率 | 缓存效果 |
|:---|:---|:---|
| `messages[0]` system prompt | **会话期间永不变** | 永远缓存命中 |
| `messages[1..N]` 对话历史 | 每轮追加 | 前缀部分持续命中，仅新增消息产生增量成本 |
| 工具返回值（动态数据） | 每次不同 | 作为 `tool` 消息追加，不影响前缀缓存 |

理论上可实现接近 100% 的前缀缓存命中率。

### 7.4 信息安全协议

查询工具返回的数据遵循以下协议，防止泄露未来剧情：

- 角色数据只返回**当前状态**，不返回"将会发生"的事件
- 关系数据只返回**直接关系**（角色 A 与 B 的关系），不返回传递关系（A→B→C 可能暗示未来剧情）
- 时间线只返回**当前时间点之前**的事件
- 这些约束在查询工具的后端实现中强制执行，不依赖 Agent 自律

### 7.5 缓存效果监控

通过 `DeepSeekClient` 返回的 `Usage` 对象采集每次 API 调用的缓存命中 token 数，计算命中率并在仪表盘展示。由于 system prompt 永不变，`ImmutablePrefix.fingerprint` 在整个会话期间保持稳定——如果发生变化，说明出现了异常，需要告警。

---

## 八、数值计算引擎

### 8.1 设计目标

- **消除大模型数值幻觉**：所有数值计算由程序引擎完成，AI 只负责文本描写
- **生成时主动注入标记**：放弃事后从文本中抽取数值的不靠谱校验方式，改为在生成时要求 Agent 使用 `{{类型:值}}` 标记显式声明计算数值。校验器直接读取标记与引擎结果比对，偏差超限自动修正
- **题材可配置**：计算公式参数存储在数据库中，切换题材自动调整

### 8.2 核心功能

**伤害计算**：根据技能基础伤害、道途系数、命中修正、目标抗性等参数计算最终伤害。

**成长计算**：根据阶位、种族修正、道途修正自动计算生命值、精神力等属性。

**代价追踪**：对于高度叙事化的状态（如元素人格进度），采用等级+叙事标签的半定量模式。引擎追踪技能使用次数和触发条件，累计达到阈值时发出"代价等级即将提升"警告，由作者决定具体叙事表现。

**战斗预演**：对关键战斗进行数值预演，输出预估伤害范围，作为数值约束注入脚本。

### 8.3 与 Agent 集成

Agent 通过 `battle_simulate` 等工具获取计算结果，在文本中使用 `{{类型:值}}` 标记写入。`validate_consistency` 工具读取标记值与引擎计算值比对，偏差超限自动修正。

---

## 九、创作脚本与卡片系统

### 9.1 设计理念

创作脚本是连接大纲与正文的中间层，不同类型的场景使用不同的脚本模板（卡片）。卡片系统保证 AI 生成文本时拥有明确的约束和依据。

### 9.2 脚本类型

预设多种脚本类型：战斗脚本、情感脚本、商战脚本、修行脚本、冒险脚本等，每种对应特定的卡片模板，定义其布局和必填字段。

### 9.3 脚本生成流程

Agent 根据大纲节点中用户标注的场景类型加载对应模板，自动从数据库提取出场角色当前状态摘要与直接关系（遵循信息安全协议，绝不泄露未来剧情），调用数值引擎进行必要的计算预演，最后生成完整的结构化脚本草案。

### 9.4 卡片模板的题材迁移

卡片模板的布局定义存储在 card_templates 表中，不同题材拥有不同的模板集。切换题材时系统加载对应配置，前端动态渲染相应的脚本表单。

---

## 十、多题材迁移机制

### 10.1 配置驱动架构

系统通过以下配置要素实现题材迁移，无需修改核心代码：

- **题材模板文件**：JSON 格式，包含实体配置、卡片模板、全局常量、基础关系类型
- **entity_configs 表**：定义每个实体类型在当前题材下的自定义字段
- **card_templates 表**：定义各类型脚本的布局
- **global_constants 表**：存储当前题材的计算公式参数
- **kg_relation_types 表**：定义当前题材可用的关系类型

### 10.2 题材切换流程

用户创建新项目时选择题材模板，系统自动写入对应的配置数据。创作过程中可随时调整配置，已创作内容的历史数据 custom_attrs 保持不变，不受切换影响。

---

## 十一、非功能需求与工程质量

### 11.1 错误处理与事务回滚

Agent 多步任务中任何一步失败，自动记录失败点并保存草案状态。支持从失败步骤重试或回滚整个任务至初始状态。所有状态修改严格遵循 ACID 事务，利用 SQLite 的事务机制和全局状态快照保证一致性。

### 11.2 并发控制

基于项目维度的操作队列，同一项目的写操作串行化执行，读操作可并行，避免快速连续操作引发的数据竞态。

### 11.3 API 密钥安全

DeepSeek API Key 由后端保管，从不暴露给前端。`DeepSeekClient` 从 `~/.storyforge/config.json` 或环境变量 `DEEPSEEK_API_KEY` 读取。

### 11.4 前端性能保障

章节编辑器采用虚拟滚动与分页加载，仅渲染可视区域内的片段。配合 Tiptap 的文档分片能力，确保千万字级项目下依然保持流畅的编辑与滚动体验。

### 11.5 测试策略

核心模块均需通过单元测试：数值计算引擎、动态字段索引生成、全文检索匹配、知识图谱路径查询深度限制、技能加载器、查询工具的信息安全协议。集成测试覆盖完整的 Agent 交互流程（用户指令→工具调用序列→校验→确认提交）。提取的 Reasonix 组件已自带完善的单元测试（可选择性移植）。

---

## 十二、设计总结

「书灵」StoryForge 3.2 是一套彻底面向 Agent 全流程的长篇网文创作系统。它通过以下核心革新，重新定义了人与 AI 在超长篇创作中的协作关系：

- **五阶段金字塔模型**：将创作流程固化为"设定→大纲→时间线→脚本→成文"，五阶段作为**软约束**体现在 system prompt 中，Agent 自主决策如何遵循。
- **极简 Skill-Tool 驱动运行时**：`StoryForgeLoop` 仅保留纯 ReAct 循环，不设外层编排。Agent 的创作智能来自三方面：永不变的 system prompt、按需加载的 skills、全量注册的工具集。Agent 自己决定流程，自己通过工具查询获取上下文，自己调用校验工具检查一致性。
- **基于成熟组件的极简内核**：复用从 Reasonix 提取的经生产验证的核心组件，自建精简的 `StoryForgeLoop`（~200 行），将工程重心放在工具后端（知识检索、数值计算、校验、状态管理）。
- **System Prompt 永不变的缓存策略**：system prompt 在整个会话期间永远不变，所有动态数据通过工具返回值进入消息流。理论上可实现接近 100% 的前缀缓存命中率。
- **逐条持久化的会话管理**：每条消息产生时立即写入 SQLite，确保崩溃恢复和会话恢复。
- **IDE 式三栏界面**：左侧文件树沉淀所有成果，中央区域用于沉浸式审阅与版本对比，右侧对话区保持轻量。
- **事务性状态管理与快照机制**：所有状态变更在用户通过 `confirm_checkpoint` 确认后原子提交，支持回滚。
- **确定性数值校验**：通过生成时主动注入标记，将数值一致性验证变为确定性过程。

底层引擎已由先行者验证，书灵只需驶向自己的星辰大海。
