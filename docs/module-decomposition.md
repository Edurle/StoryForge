# StoryForge 模块分解方案

> 将 `storyforge-design.md` (v3.2) 的实施计划分解为 12 个相对独立、可单独验证的模块。
> 每个模块定义了职责边界、对外接口、依赖关系和验证方式。

---

## 依赖关系总览

```
Layer 0 (已就绪): lib/reasonix-core/
    │
Layer 1 (纯逻辑，零外部依赖):
    ├── M1 公式引擎 (通用求值器，不含领域逻辑)
    └── M2 数据库 Schema (含 formulas 表)
    │
Layer 2 (数据与服务，共享 M3 Worker):
    ├── M3 SQLite Worker ──→ M4 知识检索服务 ──→ M6 校验器
    │                   ├──→ M5 状态管理器
    │                   └──→ M7 技能系统 (含数值规则说明)
    │
Layer 3 (Agent 运行时):
    ├── M8 创作工具集 (胶水层，calculate 工具调用 M1)
    └── M9 StoryForgeLoop
    │
Layer 4 (接入层，可并行):
    ├── M10 Express 后端
    └── M11 前端 Shell ──→ M12 前端组件
```

**并行策略**：
- Layer 1 的 M1 和 M2 完全独立，可同时开发
- Layer 2 中 M4/M5/M7 仅依赖 M3，可并行；M6 额外依赖 M4 和 M1
- Layer 4 的 M10 和 M11 可并行（M11 可先用 mock API）
- M1 公式引擎不含领域逻辑，不需要等题材模板——题材公式存在 M2 的 `formulas` 表中

---

## M1: 公式引擎

**职责**：通用的数学表达式解析与求值器。消除 LLM 数值幻觉的基础设施——但引擎本身不含任何领域逻辑。

**边界**：接受公式模板 + 变量值，返回计算结果。纯函数，零 I/O，零数据库依赖。不绑定任何特定题材。

**设计动机**：不同题材的数值体系完全不同（玄幻有境界突破和天劫伤害，都市有商战估值，言情可能不需要战斗计算）。将领域公式硬编码在引擎里是错误的——公式应该随题材模板配置，引擎只负责求值。

### 公式从哪来

领域公式存储在数据库的 `formulas` 表中（见 M2），随题材模板加载。例如：

| 题材 | 公式名 | 公式模板 |
|------|--------|----------|
| 玄幻 | `damage` | `skill_base * path_mult * hit_mod * (1 - target_resist)` |
| 玄幻 | `growth_hp` | `base_hp * stage_mult * race_mult * path_mult` |
| 玄幻 | `tribulation_survival` | `1 - (tribulation_power / (hp + spirit_power * 0.3))` |
| 都市 | `deal_valuation` | `revenue * pe_ratio * growth_factor * (1 - risk_discount)` |
| 通用 | `clamp` | `min(max(value, lower), upper)` |

Agent 通过技能（`get_skill("power_system")`）了解当前题材有哪些公式、需要哪些参数，然后调用 `calculate` 工具传入公式名和参数值。

### 对外接口

```typescript
// src/engine/formula.ts

interface EvalResult {
  value: number;
  breakdown: { step: string; result: number }[];
}

export function evaluate(formula: string, vars: Record<string, number>): EvalResult;
export function validate(formula: string): { ok: boolean; error?: string };

export function evaluateTemplate(
  template: string,
  vars: Record<string, number>
): EvalResult;

export function batchEvaluate(
  templates: string[],
  vars: Record<string, number>
): EvalResult[];
```

### 表达式语法

支持基础算术运算 + 变量插值 + 常用数学函数，足够覆盖大多数题材的数值需求：

```
支持的语法:
  变量引用:    base_hp, stage_mult
  四则运算:    + - * /
  幂运算:      **
  括号:        ()
  比较运算:    > < >= <= == !=
  条件表达式:  if(cond, then, else)
  数学函数:    min(), max(), clamp(), floor(), ceil(), round(), abs()
  随机范围:    rand(min, max)

公式模板示例:
  "skill_base * path_mult * hit_mod * (1 - target_resist)"
  "base_hp * stage_mult * race_mult + bonus"
  "if(level >= threshold, 1, level / threshold)"
  "clamp(base + rand(-variance, variance), 0, max_hp)"
```

### 依赖

无。

### 验证方式

单元测试，不依赖任何题材知识：

1. 基础算术：`evaluate("2 + 3 * 4", {})` → 14
2. 变量代入：`evaluate("a * b + c", {a:2, b:3, c:1})` → 7
3. 数学函数：`evaluate("max(a, b)", {a:3, b:5})` → 5
4. 条件表达式：`evaluate("if(a > b, a, b)", {a:3, b:5})` → 5
5. 随机范围：`evaluate("clamp(x + rand(-1, 1), 0, 100)", {x:50})` → [49, 51] 范围内
6. 公式校验：`validate("a + * b")` → `{ ok: false, error: "..." }`
7. 批量求值：多个公式共享同一变量集
8. 边界：除零保护、溢出保护、未定义变量报错

### 建议目录

```
src/engine/
├── formula.ts         # 表达式解析 + 求值
├── tokenizer.ts       # 词法分析
├── ast.ts             # AST 节点定义
├── stdlib.ts          # 内置函数 (min/max/clamp/rand/if...)
└── __tests__/
    ├── formula.test.ts
    ├── tokenizer.test.ts
    └── stdlib.test.ts
```

---

## M2: 数据库 Schema

**职责**：SQLite 全部表定义、索引、FTS5 全文检索配置、迁移系统。

**边界**：仅 schema 定义和迁移逻辑，不含业务逻辑。

### 对外接口

```typescript
// src/db/schema.ts

export function migrate(db: Database): void;
```

### 核心表清单

| 表名 | 用途 |
|------|------|
| `characters` | 角色档案 + 动态 JSON 扩展字段 |
| `items` | 物品定义 |
| `factions` | 势力定义 |
| `locations` | 地点定义 |
| `chapters` / `segments` | 章节内容（拆为片段，含元数据） |
| `kg_nodes` / `kg_relations` | 知识图谱（支持递归 CTE 查询） |
| `timeline_events` | 时间线事件 |
| `outlines` | 大纲节点树 |
| `scripts` | 创作脚本 |
| `entity_configs` | 题材自定义字段配置 |
| `card_templates` | 脚本模板布局 |
| `global_constants` | 题材通用常量 |
| `formulas` | 题材计算公式模板（name, template, description, vars） |
| `kg_relation_types` | 可用关系类型 |
| `agent_messages` | 对话消息逐条持久化（含 seq + timestamp） |
| `agent_sessions` | 会话元数据 |
| `skills` | 技能指令文本 |
| `snapshots` | 状态快照 |
| `snapshot_entities` | 快照关联的实体属性值 |

### 动态字段索引

根据 `entity_configs` 的索引标记，自动创建生成列 + B-tree 索引，避免 JSON 字段全表扫描。

### FTS5 配置

使用 ngram tokenizer (n=2) 实现中文全文检索，覆盖正文片段和设定文本。

### 依赖

无。

### 验证方式

1. 在临时目录创建 SQLite 文件，运行 `migrate()`
2. 验证所有表存在且 schema 正确
3. 执行基础 CRUD（INSERT / SELECT / UPDATE / DELETE）确认字段类型正确
4. 验证 FTS5 查询返回预期结果
5. 验证动态字段索引生效（EXPLAIN QUERY PLAN 不出现 SCAN）

### 建议目录

```
src/db/
├── schema.ts          # migrate() + 表定义
├── types.ts           # 实体类型定义（Character, Segment, TimelineEvent 等）
└── __tests__/
    └── schema.test.ts
```

---

## M3: SQLite Worker 线程

**职责**：将所有 SQLite 操作异步化。主线程通过消息队列发送请求，Worker 内同步执行，结果异步返回。

**边界**：通用 SQL 执行层，不包含业务逻辑。每个项目独占一个 Worker。

### 对外接口

```typescript
// src/db/worker.ts

interface DbRequest {
  id: number;
  type: "query" | "run" | "batch";
  sql: string;
  params?: unknown[];
}

interface DbResponse {
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function createDbWorker(dbPath: string): {
  request(req: DbRequest): Promise<DbResponse>;
  close(): void;
};
```

### 关键设计点

- 消息通过 `postMessage` / `onmessage` 通信
- Worker 内部使用同步 `better-sqlite3` 驱动
- 支持批量操作（`type: "batch"` 在单个事务中执行多条 SQL）
- 请求超时与错误重试由主线程管理
- 连接池管理器负责 Worker 创建/复用/超时销毁

### 依赖

M2（Worker 启动时自动运行 `migrate()`）。

### 验证方式

1. 启动 Worker，发送 `query` 请求，验证返回结果
2. 发送 `run` 请求，验证写入成功
3. 发送 `batch` 请求，验证事务行为（部分失败全部回滚）
4. 连续发送 100+ 请求，验证不阻塞主线程
5. 关闭 Worker，验证资源释放

### 建议目录

```
src/db/
├── worker.ts          # createDbWorker
├── worker-script.ts   # Worker 线程内部脚本
├── pool.ts            # 连接池管理器（多项目复用）
└── __tests__/
    └── worker.test.ts
```

---

## M4: 知识检索服务

**职责**：将领域查询翻译为 SQL，返回结构化数据。强制执行信息安全协议，防止泄露未来剧情。

**边界**：只读操作。从 SQLite 查询数据并返回结构化结果。

### 对外接口

```typescript
// src/services/knowledge.ts

export function queryProjectStatus(db: DbWorker): Promise<ProjectStatus>;
export function queryCharacter(db: DbWorker, name: string): Promise<CharacterProfile | null>;
export function queryCharacters(db: DbWorker, filter?: string): Promise<CharacterProfile[]>;
export function querySetting(db: DbWorker, topic: string): Promise<SettingData | null>;
export function queryTimeline(db: DbWorker, range: { from: string; to: string }): Promise<TimelineEvent[]>;
export function queryRecentPlot(db: DbWorker, n: number): Promise<PlotSummary[]>;
export function queryOutline(db: DbWorker, volume?: number): Promise<OutlineNode[]>;
export function queryScript(db: DbWorker, sceneId: string): Promise<Script | null>;
export function queryRelations(db: DbWorker, character: string): Promise<Relation[]>;
```

### 信息安全协议

以下约束在查询函数内部强制执行，不依赖 Agent 自律：

| 规则 | 实现位置 |
|------|----------|
| 角色数据只返回当前状态，不返回未来事件 | `queryCharacter` 过滤掉 `timestamp > current_time` 的状态变更 |
| 关系数据只返回直接关系 (A↔B)，不返回传递关系 (A→B→C) | `queryRelations` 查询深度限制为 1 |
| 时间线只返回当前时间点之前的事件 | `queryTimeline` WHERE 条件限制 |

### 依赖

M3（通过 `DbWorker` 执行查询）。

### 验证方式

1. 填入完整的测试数据集（角色、设定、时间线、大纲、关系）
2. 调用每个查询函数，验证返回数据结构正确
3. **信息安全验证**：插入"未来"事件，调用查询，验证不返回
4. 关系查询验证：A→B→C 三层关系，验证只返回 A→B 和 A→C（如果直接存在）

### 建议目录

```
src/services/
├── knowledge.ts       # 全部查询函数
└── __tests__/
    └── knowledge.test.ts
```

---

## M5: 状态管理器

**职责**：事务管理、原子写入、全局状态快照创建与回滚。

**边界**：管理状态变更的事务性和版本化。不包含具体的业务逻辑。

### 对外接口

```typescript
// src/services/state.ts

export function beginTransaction(db: DbWorker): Promise<TxHandle>;
export function commitTransaction(db: DbWorker, tx: TxHandle): Promise<void>;
export function rollbackTransaction(db: DbWorker, tx: TxHandle): Promise<void>;

export function createSnapshot(db: DbWorker, description: string, affectedEntities: EntityRef[]): Promise<string>;
export function rollbackToSnapshot(db: DbWorker, snapshotId: string): Promise<void>;
export function listSnapshots(db: DbWorker): Promise<SnapshotMeta[]>;
```

### 快照机制

每次 `confirm_checkpoint` 确认提交时：
1. 记录所有受影响实体的当前属性值到 `snapshots` + `snapshot_entities`
2. 片段版本关联其确认时的快照 ID
3. 回滚时从快照恢复所有实体属性值

### 依赖

M3（通过 `DbWorker` 执行 SQL 事务）。

### 验证方式

1. 创建多个角色实体
2. 创建快照 S1
3. 修改实体属性
4. 创建快照 S2
5. 回滚到 S1，验证属性恢复到 S1 状态
6. 回滚到 S2，验证属性恢复到 S2 状态
7. 验证回滚不影响其他未修改实体

### 建议目录

```
src/services/
├── state.ts           # 事务 + 快照 + 回滚
└── __tests__/
    └── state.test.ts
```

---

## M6: 一致性校验器

**职责**：检查数值一致性、时间线因果逻辑、角色状态连续性。确定性校验，不依赖 LLM。

**边界**：只读分析。读取当前状态，返回校验结果。

### 对外接口

```typescript
// src/services/validator.ts

interface ValidationIssue {
  severity: "error" | "warning";
  category: "numeric" | "timeline" | "character_state" | "power_system";
  message: string;
  entityRef: EntityRef;
  expected?: unknown;
  actual?: unknown;
}

interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
}

export function validateConsistency(db: DbWorker): Promise<ValidationResult>;
export function validateTimeline(db: DbWorker): Promise<ValidationResult>;
```

### 校验规则

| 类别 | 检查内容 |
|------|----------|
| 数值 | 文本中 `{{type:value}}` 标记值 vs 公式引擎用当前参数求值的结果，偏差超限报错 |
| 时间线 | 因果链完整性（前置事件存在且时间早于后续事件） |
| 角色状态 | 属性值在题材定义的合理范围内（由 `formulas` 表中的 clamp/范围公式约束） |
| 力量体系 | 突破条件满足（由技能 `power_system` 定义规则） |

### 依赖

M4（通过知识检索读取数据），M1（公式引擎求值）。校验规则本身来自 `formulas` 表和技能文本——校验器读取公式名和参数，调用 M1 求值，与标记值比对。

### 验证方式

1. 插入完全一致的数据→验证 `passed: true`
2. 插入数值偏差的文本标记→验证检测到 error
3. 插入因果倒置的时间线→验证检测到 error
4. 插入 HP 为负的角色→验证检测到 error

### 建议目录

```
src/services/
├── validator.ts       # 校验函数
└── __tests__/
    └── validator.test.ts
```

---

## M7: 技能系统

**职责**：技能指令文本的 CRUD 管理。Agent 通过 `get_skill(name)` 工具按需加载。

**边界**：技能文本的存储和检索。不含技能选择逻辑（由 Agent 自主决定）。

### 对外接口

```typescript
// src/services/skills.ts

export function loadSkill(db: DbWorker, name: string): Promise<string | null>;
export function saveSkill(db: DbWorker, name: string, content: string, meta?: SkillMeta): Promise<void>;
export function listSkills(db: DbWorker): Promise<SkillMeta[]>;
export function deleteSkill(db: DbWorker, name: string): Promise<void>;
```

### 预装技能清单

| 技能名 | 内容 | 估计 Token |
|--------|------|-----------|
| `worldbuilding` | 世界观构筑指南 | ~500 |
| `outline` | 大纲编写指南 | ~400 |
| `timeline` | 时间线规划指南 | ~300 |
| `script` | 创作脚本编写指南 | ~400 |
| `writing` | 文本生成指南 | ~500 |
| `battle` | 战斗场景专项（含该题材的战斗数值工作流：查角色→查公式→调 calculate→写标记→校验） | ~300 |
| `power_system` | 力量体系设计专项（含该题材的公式清单、参数含义、合理范围） | ~300 |

**技能与公式的关系**：技能是给人（和 Agent）读的说明书，告诉 Agent 当前题材有哪些数值维度、用什么公式、需要什么参数。公式本身是机器可执行的表达式，存在 `formulas` 表中。例如技能 `power_system` 会写"调用 `calculate_damage` 工具时传入 `skill_base`、`path_mult`、`hit_mod`、`target_resist` 四个参数"，对应的公式模板 `"skill_base * path_mult * hit_mod * (1 - target_resist)"` 存在 `formulas` 表中。

### 依赖

M3（通过 `DbWorker` 读写 `skills` 表）。

### 验证方式

1. 存储一个测试技能→按名检索→验证内容一致
2. 存储多个技能→列出全部→验证列表完整
3. 检索不存在的技能→验证返回 null
4. 删除技能→验证后续检索返回 null

### 建议目录

```
src/services/
├── skills.ts          # 技能 CRUD
└── __tests__/
    └── skills.test.ts
```

---

## M8: 创作工具集

**职责**：将 M4-M7 的服务函数包装为 ToolRegistry 中的工具，集成 PauseGate 的 A/B/C 确认级别。

**边界**：Layer 2 服务与 Layer 3 Agent 运行时之间的胶水层。负责工具注册、参数校验、确认门控。

### 对外接口

```typescript
// src/agent/tools/index.ts

export function createToolRegistry(deps: {
  db: DbWorker;
  gate: PauseGate;
}): ToolRegistry;
```

### 工具清单

**信息查询类（A级，全自动）**：
- `query_project_status` — 项目进度
- `query_character` — 角色档案
- `query_characters` — 角色筛选
- `query_setting` — 设定查询
- `query_timeline` — 时间线查询
- `query_recent_plot` — 近期剧情
- `query_outline` — 大纲结构
- `query_script` — 脚本详情
- `query_relations` — 关系网络

**技能查询类（A级）**：
- `get_skill` — 加载技能指令文本

**写入类（B/C级确认）**：
- `edit_setting` — 编辑设定（B/C）
- `edit_character` — 编辑角色（B/C）
- `edit_outline` — 增删大纲节点（B）
- `edit_timeline` — 修改时间线（C）
- `write_script` — 写入脚本（B）
- `write_text` — 写入正文（B）
- `update_character_state` — 更新角色状态（B）
- `confirm_checkpoint` — 确认提交快照（C）
- `rollback` — 回滚到快照（C）

**数值计算类（A级）**：
- `calculate` — 通用计算工具：传入公式名 + 参数，从 `formulas` 表加载模板，用 M1 公式引擎求值
- `calculate_batch` — 批量计算：多个公式共享参数集，一次返回所有结果

> 注：不再为每个题材预定义 `battle_simulate`、`calculate_growth` 等固定工具。不同题材的计算需求差异太大。改为一个通用的 `calculate` 工具 + 题材公式配置。Agent 通过技能（`get_skill("power_system")`）得知该调用什么公式、传什么参数。

**校验类（A级）**：
- `validate_consistency` — 全局一致性校验
- `validate_timeline` — 时间线校验

### 确认级别实现

```typescript
// B级示例：通知式确认
tools.register({
  name: "write_text",
  fn: async (args, ctx) => {
    const verdict = await ctx.gate.ask({
      kind: "plan_proposed",
      payload: { summary: `写入正文片段: ${args.content.slice(0, 50)}...` },
    });
    if (verdict.type === "cancel") return JSON.stringify({ cancelled: true });
    // 执行写入...
    return JSON.stringify({ success: true });
  },
});

// C级示例：阻断式确认
tools.register({
  name: "edit_timeline",
  fn: async (args, ctx) => {
    const verdict = await ctx.gate.ask({
      kind: "checkpoint",
      payload: { summary: `修改时间线因果链: ${summarizeChange(args)}` },
    });
    if (verdict.type !== "continue") return JSON.stringify({ cancelled: true });
    // 执行修改...
    return JSON.stringify({ success: true });
  },
});
```

### 依赖

M4（知识检索）、M5（状态管理）、M6（校验器）、M7（技能系统）、M1（公式引擎）、reasonix-core（ToolRegistry, PauseGate）。

### 验证方式

1. 注册全部 20 个工具→验证 `tools.specs()` 返回完整列表
2. 调用每个 A 级工具→验证返回正确数据
3. 调用 B 级工具→验证 `PauseGate.ask` 被调用且参数正确
4. 调用 C 级工具→验证阻断式确认触发
5. 验证 `gate.ask` 返回 cancel 时工具返回 `{ cancelled: true }`

### 建议目录

```
src/agent/tools/
├── index.ts           # createToolRegistry
├── query-tools.ts     # 9 个查询工具
├── write-tools.ts     # 9 个写入工具
├── calc-tools.ts      # calculate + calculate_batch（通用，非题材绑定）
├── validate-tools.ts  # 2 个校验工具
└── __tests__/
    └── tools.test.ts
```

---

## M9: StoryForgeLoop

**职责**：Agent 的核心 ReAct 循环。接受用户输入，调用 DeepSeek API，分发工具调用，追加结果，循环直到完成。

**边界**：纯编排逻辑，不包含任何业务逻辑。~200 行。

### 对外接口

```typescript
// src/agent/loop.ts

export type EngineEvent =
  | { type: "assistant"; content: string; reasoningContent?: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; result: string }
  | { type: "done"; content: string }
  | { type: "error"; error: Error }
  | { type: "aborted" };

export class StoryForgeLoop {
  constructor(deps: {
    client: DeepSeekClient;
    tools: ToolRegistry;
    prefix: ImmutablePrefix;
    maxIter?: number;
    model?: string;
  });

  async *runTurn(userInput: string): AsyncGenerator<EngineEvent>;
  abort(): void;
}
```

### 核心循环逻辑

```typescript
async *runTurn(userInput: string): AsyncGenerator<EngineEvent> {
  this.messages.push({ role: "user", content: userInput });

  for (let iter = 0; iter < this.maxIter; iter++) {
    if (this.abortController.signal.aborted) {
      yield { type: "aborted" };
      return;
    }

    const response = await this.client.chat({
      model: this.model,
      messages: [...this.prefix.toMessages(), ...this.messages],
      tools: this.prefix.tools(),
    });

    this.messages.push(response.content);

    if (response.toolCalls.length === 0) {
      yield { type: "done", content: response.content };
      return;
    }

    for (const call of response.toolCalls) {
      yield { type: "tool_call", call };
      const result = await this.tools.dispatch(
        call.function.name,
        call.function.arguments,
        { signal: this.abortController.signal }
      );
      this.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
      yield { type: "tool_result", call, result };
    }
  }
}
```

### 依赖

M8（工具集），reasonix-core（DeepSeekClient, ToolRegistry, ImmutablePrefix）。

### 验证方式

1. **Mock client + mock tools**：
   - 验证单轮对话（无工具调用）：user → assistant → done
   - 验证工具调用循环：user → assistant(tool_call) → dispatch → tool_result → assistant → done
   - 验证多轮工具调用：连续 3 次工具调用后完成
   - 验证迭代上限：设置 `maxIter=2`，验证第 3 次循环终止
   - 验证 abort：调用 `abort()`，验证收到 `aborted` 事件
2. **流式验证**：使用 mock stream，验证事件逐步 yield

### 建议目录

```
src/agent/
├── loop.ts            # StoryForgeLoop
├── types.ts           # EngineEvent 等类型
└── __tests__/
    └── loop.test.ts
```

---

## M10: Express 后端

**职责**：REST API + SSE 流式输出。前端与 Agent 运行时之间的 HTTP 接口。

**边界**：HTTP 协议层。请求路由、会话管理、SSE 流式传输。

### 对外接口

**REST Endpoints**：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/:id` | 项目详情 |
| DELETE | `/api/projects/:id` | 删除项目 |
| POST | `/api/projects/:id/chat` | 发送消息（返回 SSE 流） |
| GET | `/api/projects/:id/history` | 获取对话历史 |
| POST | `/api/projects/:id/confirm` | 响应确认门控 |
| GET | `/api/projects/:id/tree` | 获取文件树结构 |
| GET | `/api/projects/:id/content/:path` | 获取指定内容 |

**SSE 事件格式**：

```
event: assistant
data: {"content": "好的，我来查询..."}

event: tool_call
data: {"name": "query_character", "args": {"name": "叶凡"}}

event: tool_result
data: {"name": "query_character", "result": "{...}"}

event: confirm
data: {"level": "B", "summary": "写入正文片段...", "id": "cf_123"}

event: done
data: {"content": "完成"}
```

### 依赖

M9（StoryForgeLoop）、M3（DbWorker）。

### 验证方式

1. 启动服务器
2. `POST /api/projects` 创建项目→验证 201
3. `POST /api/projects/:id/chat` 发送消息→验证 SSE 流事件格式正确
4. `POST /api/projects/:id/confirm` 响应确认→验证 Agent 继续执行
5. 验证 API Key 不出现在任何响应中
6. 验证无效项目 ID 返回 404

### 建议目录

```
src/server/
├── index.ts           # Express 应用入口
├── routes/
│   ├── projects.ts    # 项目 CRUD
│   ├── chat.ts        # 聊天 + SSE
│   └── content.ts     # 内容查询
├── middleware/
│   ├── error.ts       # 错误处理
│   └── session.ts     # 会话管理
└── __tests__/
    └── api.test.ts
```

---

## M11: 前端 Shell

**职责**：Vue 3 + Vite 应用骨架。三栏布局、路由、Pinia 状态管理。

**边界**：应用外壳，不含领域组件。

### 对外接口

- 三栏可折叠布局组件
- Vue Router 配置
- Pinia Store（项目状态、布局偏好）
- API 客户端封装（fetch + SSE 解析）

### 技术选型

- Vue 3 (Composition API) + Vite
- Vue Router 4
- Pinia
- 面板可拖拽调整大小、独立折叠、布局记忆

### 依赖

无硬依赖（可用 mock API 独立开发）。

### 验证方式

1. `npm run dev` 启动开发服务器
2. 浏览器中看到三栏布局
3. 各面板可折叠/展开
4. 路由切换正常（项目列表→项目工作台）
5. 刷新后布局偏好恢复

### 建议目录

```
web/
├── index.html
├── vite.config.ts
├── package.json
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/
│   │   └── index.ts
│   ├── stores/
│   │   ├── project.ts
│   │   └── layout.ts
│   ├── layouts/
│   │   └── Workbench.vue     # 三栏布局
│   ├── api/
│   │   ├── client.ts         # HTTP + SSE 封装
│   │   └── mock.ts           # Mock API（开发用）
│   └── views/
│       ├── ProjectList.vue
│       └── ProjectWorkbench.vue
```

---

## M12: 前端组件

**职责**：所有领域 UI 组件。

**边界**：独立的 Vue 组件，通过 props/events 与外壳通信。

### 组件清单

| 组件 | 职责 |
|------|------|
| `FileTree` | 五阶段分类目录树，状态图标，右键菜单 |
| `ContentViewer` | 自适应渲染：富文本、时间线轴、关系图、表单 |
| `DiffViewer` | C 级确认时的左右分栏对比视图 |
| `DialogPanel` | 对话指挥台，摘要卡片，确认控件 |
| `TiptapEditor` | 富文本编辑器，分片加载，数值标记高亮 |
| `TimelineVis` | 时间线横向拖拽轴（vis-network / ECharts） |
| `RelationGraph` | 角色关系力导图 |
| `ConfirmCard` | B/C 级确认卡片（通知式/阻断式） |

### 依赖

M11（Shell 提供布局和 API 客户端）。

### 验证方式

每个组件独立验证：
1. 用测试数据 mount 组件→验证渲染内容
2. 触发交互事件→验证 emit 的 payload
3. 折叠/展开/拖拽→验证状态更新
4. 虚拟滚动：渲染 10000+ 片段→验证性能
5. 可视化组件：验证交互（缩放、拖拽、点击节点）

### 建议目录

```
web/src/components/
├── FileTree.vue
├── ContentViewer.vue
├── DiffViewer.vue
├── DialogPanel.vue
├── TiptapEditor.vue
├── TimelineVis.vue
├── RelationGraph.vue
├── ConfirmCard.vue
└── __tests__/
    ├── FileTree.test.ts
    ├── ContentViewer.test.ts
    └── ...
```

---

## 构建顺序建议

```
阶段一：基础层（可并行）
  M1 公式引擎 ─────────────┐
  M2 数据库 Schema ────────┤
                            ↓
阶段二：数据层              M3 SQLite Worker
                            ↓
阶段三：服务层（可并行）     │
  M4 知识检索 ──→ M6 校验器 │ ← M6 同时依赖 M1
  M5 状态管理器 ────────────┤
  M7 技能系统 ──────────────┤
                            ↓
阶段四：Agent 层            M8 创作工具集 (calculate 工具调用 M1)
                            ↓
                            M9 StoryForgeLoop
                            ↓
阶段五：接入层（可并行）     │
  M10 Express 后端 ────────┤
  M11 前端 Shell ──→ M12 前端组件
```

**里程碑**：
- **里程碑 A**（M1-M3 完成）：公式引擎 + 数据层可用，可手工测试公式求值和数据库结构
- **里程碑 B**（M4-M7 完成）：服务层可用，可测试知识查询、快照回滚、技能加载、公式配置按题材切换
- **里程碑 C**（M8-M9 完成）：Agent 可对话，可在终端运行完整的 ReAct 循环，Agent 能通过技能指导调用 `calculate` 工具
- **里程碑 D**（M10 完成）：HTTP API 可用，可用 curl 测试全部功能
- **里程碑 E**（M11-M12 完成）：完整的浏览器 UI 可用
