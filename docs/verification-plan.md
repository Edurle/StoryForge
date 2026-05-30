# StoryForge 验证流程

> 基于 `module-decomposition.md` 的 12 模块分解和推荐完成顺序，定义每个阶段的具体验证方法。
> 测试框架：vitest。原则：每完成一个模块就能立即验证，不需要等后续模块。

---

## 一、测试基础设施

### 1.1 vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "lib/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
```

安装：

```bash
npm install -D vitest
```

`package.json` 新增：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 1.2 共享测试工具

```
test/
├── helpers/
│   ├── db.ts              # createTestDb(): 在临时目录创建 SQLite，运行 migrate，测完删除
│   ├── mock-client.ts     # MockDeepSeekClient: 可编程的 DeepSeek API 响应
│   ├── mock-gate.ts       # MockPauseGate: 可编程的确认门控（自动批准/拒绝/挂起）
│   ├── mock-worker.ts     # MockDbWorker: 内存版 DbWorker（用于不需要真实 SQLite 的测试）
│   └── seed.ts            # seedXxx() 系列函数：向测试 DB 填入标准数据集
└── fixtures/
    ├── formulas-xianxia.json    # 玄幻题材公式集
    ├── formulas-urban.json      # 都市题材公式集
    ├── skills-battle.md         # 战斗技能文本
    └── skills-power-system.md   # 力量体系技能文本
```

### 1.3 createTestDb 帮助函数

每个涉及数据库的测试都需要一个干净的临时数据库。统一用这个：

```typescript
// test/helpers/db.ts
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 底层用 better-sqlite3 同步驱动（Worker 内部也用它）
// 测试中直接用同步调用，不走 Worker

export function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "sf-test-"));
  const dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  migrate(db);
  return {
    db,
    dbPath,
    [Symbol.dispose]: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
```

使用方式（利用 `using` 自动清理）：

```typescript
it("query character by name", () => {
  using ctx = createTestDb();
  seedCharacters(ctx.db, [{ name: "叶凡", stage: "筑基九层", hp: 1200 }]);
  const result = queryCharacterSync(ctx.db, "叶凡");
  expect(result).toEqual({ name: "叶凡", stage: "筑基九层", hp: 1200 });
});
```

---

## 二、测试数据策略

### 2.1 标准"叶凡"数据集

贯穿所有模块的统一测试数据。从 M4 开始所有服务层测试都用这套数据，确保模块间接口对齐。

```
角色:
  叶凡   — 筑基九层, HP:1200, 精神力:800, 位置:天柱峰
  苏柔   — 炼气八层, HP:600,  精神力:400, 位置:青云门
  魔尊   — 元婴初期, HP:5000, 精神力:3000, 位置:魔渊

设定:
  金丹期突破条件 — 筑基圆满 + 天劫洗礼 + 灵力凝丹
  天劫规则       — 三重天雷, 基础伤害 7200-9800

时间线:
  T001 天柱峰试炼 (叶凡, 苏柔) — 已完成
  T002 天劫降临 (叶凡)         — 未发生 (信息安全协议测试用)

关系:
  叶凡 → 苏柔: 师兄妹
  叶凡 → 魔尊: 敌对

公式 (formulas 表):
  damage:      "skill_base * path_mult * hit_mod * (1 - target_resist)"
  growth_hp:   "base_hp * stage_mult * race_mult"
  tribulation: "if(spirit_power > 800, 0.73, 0.3)"

技能:
  battle        — 战斗场景指南
  power_system  — 力量体系说明 (含参数含义)
```

### 2.2 seed 函数签名

```typescript
// test/helpers/seed.ts

export function seedCharacters(db: Database, chars?: Partial<Character>[]): void;
export function seedSettings(db: Database, settings?: Partial<Setting>[]): void;
export function seedTimeline(db: Database, events?: Partial<TimelineEvent>[]): void;
export function seedRelations(db: Database, rels?: Partial<Relation>[]): void;
export function seedFormulas(db: Database, formulas?: Partial<Formula>[]): void;
export function seedSkills(db: Database, skills?: Partial<Skill>[]): void;
export function seedStandardDataset(db: Database): void; // 填入上述完整标准集
```

不传参数时使用默认值（即"叶凡"数据集），传参数则覆盖。

---

## 三、逐模块验证

---

### Batch 1: M1 公式引擎 + M2 数据库 Schema (并行)

---

#### M1 公式引擎 — 单元测试

**文件**: `src/engine/__tests__/formula.test.ts`

不需要数据库。纯函数输入输出测试。

```typescript
describe("evaluate", () => {
  it("基础算术", () => {
    expect(evaluate("2 + 3 * 4", {})).toEqual({ value: 14, breakdown: [...] });
  });

  it("变量代入", () => {
    expect(evaluate("a * b + c", { a: 2, b: 3, c: 1 }).value).toBe(7);
  });

  it("数学函数 min/max/clamp", () => {
    expect(evaluate("max(a, b)", { a: 3, b: 5 }).value).toBe(5);
    expect(evaluate("clamp(x, 0, 100)", { x: -5 }).value).toBe(0);
    expect(evaluate("clamp(x, 0, 100)", { x: 200 }).value).toBe(100);
  });

  it("条件表达式", () => {
    expect(evaluate("if(a > b, a, b)", { a: 3, b: 5 }).value).toBe(5);
    expect(evaluate("if(a > b, a, b)", { a: 7, b: 5 }).value).toBe(7);
  });

  it("幂运算", () => {
    expect(evaluate("base ** exp", { base: 2, exp: 10 }).value).toBe(1024);
  });

  it("除零保护", () => {
    const result = evaluate("a / b", { a: 10, b: 0 });
    expect(result.value).toBe(Infinity); // 或 NaN，取决于设计决策
  });

  it("未定义变量报错", () => {
    expect(() => evaluate("x + 1", {})).toThrow(/undefined variable/i);
  });

  it("rand 范围", () => {
    for (let i = 0; i < 100; i++) {
      const v = evaluate("rand(10, 20)", {}).value;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe("validate", () => {
  it("合法公式", () => {
    expect(validate("a + b * c")).toEqual({ ok: true });
  });

  it("语法错误", () => {
    expect(validate("a + * b")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("未闭合括号", () => {
    expect(validate("(a + b")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("未知函数", () => {
    expect(validate("foo(a)")).toEqual({ ok: false, error: /unknown function/i });
  });
});

describe("batchEvaluate", () => {
  it("多公式共享变量集", () => {
    const results = batchEvaluate(
      ["a + b", "a * b", "a - b"],
      { a: 10, b: 3 }
    );
    expect(results.map(r => r.value)).toEqual([13, 30, 7]);
  });
});
```

**验证门控**: `npm run test -- src/engine/` 全绿 → M1 完成。

---

#### M2 数据库 Schema — 单元测试

**文件**: `src/db/__tests__/schema.test.ts`

```typescript
describe("migrate", () => {
  it("创建全部表", () => {
    using ctx = createTestDb();
    const tables = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(r => r.name);
    expect(tables).toContain("characters");
    expect(tables).toContain("formulas");
    expect(tables).toContain("skills");
    expect(tables).toContain("snapshots");
    // ... 所有 19 张表
  });

  it("FTS5 索引存在", () => {
    using ctx = createTestDb();
    const tables = ctx.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(r => r.name);
    expect(tables).some(t => t.startsWith("fts_")); // FTS5 虚拟表
  });

  it("幂等：重复执行不报错", () => {
    using ctx = createTestDb();
    expect(() => migrate(ctx.db)).not.toThrow();
  });
});

describe("基础 CRUD", () => {
  it("characters 表写入和查询", () => {
    using ctx = createTestDb();
    ctx.db.prepare(
      "INSERT INTO characters (name, stage, custom_attrs) VALUES (?, ?, ?)"
    ).run("叶凡", "筑基九层", JSON.stringify({ hp: 1200 }));
    const row = ctx.db.prepare("SELECT * FROM characters WHERE name = ?").get("叶凡");
    expect(row.name).toBe("叶凡");
  });

  it("formulas 表写入和查询", () => {
    using ctx = createTestDb();
    ctx.db.prepare(
      "INSERT INTO formulas (name, template, description, vars) VALUES (?, ?, ?, ?)"
    ).run("damage", "skill_base * path_mult * hit_mod * (1 - target_resist)", "伤害计算", "skill_base,path_mult,hit_mod,target_resist");
    const row = ctx.db.prepare("SELECT * FROM formulas WHERE name = ?").get("damage");
    expect(row.template).toContain("skill_base");
  });

  it("动态字段生成列索引生效", () => {
    using ctx = createTestDb();
    // 插入 entity_configs 定义一个索引字段
    // 插入 characters 带 custom_attrs
    // EXPLAIN QUERY PLAN 验证走索引而非全表扫描
    const plan = ctx.db.prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM characters WHERE json_extract(custom_attrs, '$.hp') > 1000"
    ).all();
    // 验证 plan 中不包含 "SCAN" (应包含 "SEARCH")
  });
});

describe("FTS5 全文检索", () => {
  it("中文 ngram 分词搜索", () => {
    using ctx = createTestDb();
    ctx.db.prepare(
      "INSERT INTO segments (content) VALUES (?)"
    ).run("天雷轰然落下，叶凡全身被金光包裹");
    // 通过 FTS5 虚拟表搜索
    const results = ctx.db.prepare(
      "SELECT * FROM fts_segments WHERE fts_segments MATCH ?"
    ).all("天雷");
    expect(results.length).toBeGreaterThan(0);
  });
});
```

**验证门控**: `npm run test -- src/db/schema.test.ts` 全绿 → M2 完成。

---

### Batch 2: M3 SQLite Worker

---

#### M3 Worker — 单元测试

**文件**: `src/db/__tests__/worker.test.ts`

```typescript
describe("DbWorker", () => {
  it("query 请求返回结果", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    try {
      const res = await worker.request({
        id: 1, type: "query",
        sql: "SELECT 1 + 1 AS sum",
      });
      expect(res.ok).toBe(true);
      expect(res.data[0].sum).toBe(2);
    } finally {
      worker.close();
    }
  });

  it("run 请求执行写入", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    try {
      await worker.request({
        id: 1, type: "run",
        sql: "INSERT INTO characters (name, stage) VALUES (?, ?)",
        params: ["叶凡", "筑基九层"],
      });
      const res = await worker.request({
        id: 2, type: "query",
        sql: "SELECT name FROM characters WHERE name = ?",
        params: ["叶凡"],
      });
      expect(res.data[0].name).toBe("叶凡");
    } finally {
      worker.close();
    }
  });

  it("batch 请求在事务中执行", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    try {
      // batch 中一条成功一条失败 → 全部回滚
      const res = await worker.request({
        id: 1, type: "batch",
        sql: [
          "INSERT INTO characters (name) VALUES ('A')",
          "INSERT INTO nonexistent_table (x) VALUES (1)", // 故意失败
        ],
      });
      expect(res.ok).toBe(false);
      // 验证 A 也没有被插入
      const check = await worker.request({
        id: 2, type: "query",
        sql: "SELECT count(*) AS cnt FROM characters",
      });
      expect(check.data[0].cnt).toBe(0);
    } finally {
      worker.close();
    }
  });

  it("并发请求不阻塞", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    try {
      const start = Date.now();
      const promises = Array.from({ length: 100 }, (_, i) =>
        worker.request({ id: i, type: "query", sql: "SELECT 1" })
      );
      const results = await Promise.all(promises);
      const elapsed = Date.now() - start;
      expect(results.every(r => r.ok)).toBe(true);
      expect(elapsed).toBeLessThan(2000); // 100 个请求 2 秒内完成
    } finally {
      worker.close();
    }
  });

  it("SQL 错误返回 ok: false", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    try {
      const res = await worker.request({
        id: 1, type: "query",
        sql: "SELECT * FROM nonexistent",
      });
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    } finally {
      worker.close();
    }
  });

  it("close 后请求报错", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    worker.close();
    await expect(
      worker.request({ id: 1, type: "query", sql: "SELECT 1" })
    ).rejects.toThrow();
  });
});
```

**验证门控**: `npm run test -- src/db/worker.test.ts` 全绿 → M3 完成。

**里程碑 A 集成验证**: M1 + M2 + M3 联合测试

```typescript
// src/__tests__/milestone-a.test.ts
describe("里程碑 A: 公式引擎 + 数据层", () => {
  it("从 DB 加载公式并用引擎求值", async () => {
    using ctx = createTestDb();
    const worker = createDbWorker(ctx.dbPath);
    try {
      // 写入公式
      await worker.request({
        id: 1, type: "run",
        sql: "INSERT INTO formulas (name, template, vars) VALUES (?, ?, ?)",
        params: ["damage", "skill_base * path_mult * (1 - resist)", "skill_base,path_mult,resist"],
      });

      // 从 DB 读出公式
      const res = await worker.request({
        id: 2, type: "query",
        sql: "SELECT template FROM formulas WHERE name = ?",
        params: ["damage"],
      });
      const template = res.data[0].template;

      // 用公式引擎求值
      const result = evaluate(template, { skill_base: 1000, path_mult: 1.5, resist: 0.3 });
      expect(result.value).toBeCloseTo(1050);
    } finally {
      worker.close();
    }
  });
});
```

---

### Batch 3: M4 知识检索 + M5 状态管理 + M7 技能系统 (并行)

---

#### M4 知识检索服务 — 单元测试

**文件**: `src/services/__tests__/knowledge.test.ts`

```typescript
describe("queryCharacter", () => {
  it("按名查询返回完整档案", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const result = await queryCharacter(mockWorker(ctx), "叶凡");
    expect(result.name).toBe("叶凡");
    expect(result.stage).toBe("筑基九层");
  });

  it("不存在返回 null", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const result = await queryCharacter(mockWorker(ctx), "不存在");
    expect(result).toBeNull();
  });
});

describe("queryTimeline 信息安全协议", () => {
  it("只返回当前时间点之前的事件", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    // T001 已完成，T002 未发生
    const events = await queryTimeline(mockWorker(ctx), { from: "T-1", to: "T+999" });
    expect(events.some(e => e.id === "T001")).toBe(true);
    expect(events.some(e => e.id === "T002")).toBe(false);
  });
});

describe("queryRelations 信息安全协议", () => {
  it("只返回直接关系", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const rels = await queryRelations(mockWorker(ctx), "叶凡");
    // 叶凡 → 苏柔: 师兄妹 (直接)
    // 叶凡 → 魔尊: 敌对 (直接)
    expect(rels.length).toBe(2);
    // 不应出现 苏柔 → 叶凡 的反向（已经包含在双向关系中）
  });

  it("不返回传递关系", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const rels = await queryRelations(mockWorker(ctx), "叶凡");
    // 不应出现 苏柔 → 魔尊（传递）或类似间接关系
    const names = rels.map(r => r.target);
    expect(names).not.toContain("未知角色");
  });
});

describe("querySetting", () => {
  it("按 topic 查询设定", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const result = await querySetting(mockWorker(ctx), "金丹期突破条件");
    expect(result).toBeDefined();
    expect(result.content).toContain("筑基圆满");
  });
});

describe("queryOutline", () => {
  it("返回大纲树结构", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const nodes = await queryOutline(mockWorker(ctx));
    expect(nodes.length).toBeGreaterThan(0);
    // 验证树结构：parent_id 引用有效
  });
});
```

**验证门控**: `npm run test -- src/services/knowledge.test.ts` 全绿 → M4 完成。

---

#### M5 状态管理器 — 单元测试

**文件**: `src/services/__tests__/state.test.ts`

```typescript
describe("createSnapshot + rollbackToSnapshot", () => {
  it("快照回滚恢复实体属性", async () => {
    using ctx = createTestDb();
    seedCharacters(ctx.db, [
      { name: "叶凡", stage: "筑基九层", hp: 1200 },
    ]);

    const worker = mockWorker(ctx);

    // 创建快照 S1
    const s1 = await createSnapshot(worker, "突破前", [{ type: "character", name: "叶凡" }]);

    // 修改角色状态
    await updateCharacterSync(ctx.db, "叶凡", { stage: "金丹期", hp: 3000 });

    // 创建快照 S2
    const s2 = await createSnapshot(worker, "突破后", [{ type: "character", name: "叶凡" }]);

    // 回滚到 S1
    await rollbackToSnapshot(worker, s1);
    const charAfterRollback = await queryCharacter(worker, "叶凡");
    expect(charAfterRollback.stage).toBe("筑基九层");
    expect(charAfterRollback.hp).toBe(1200);

    // 回滚到 S2
    await rollbackToSnapshot(worker, s2);
    const charAtS2 = await queryCharacter(worker, "叶凡");
    expect(charAtS2.stage).toBe("金丹期");
    expect(charAtS2.hp).toBe(3000);
  });

  it("回滚不影响未修改实体", async () => {
    using ctx = createTestDb();
    seedCharacters(ctx.db, [
      { name: "叶凡", hp: 1200 },
      { name: "苏柔", hp: 600 },
    ]);
    const worker = mockWorker(ctx);

    const s1 = await createSnapshot(worker, "test", [{ type: "character", name: "叶凡" }]);
    await updateCharacterSync(ctx.db, "叶凡", { hp: 9999 });
    await rollbackToSnapshot(worker, s1);

    const susu = await queryCharacter(worker, "苏柔");
    expect(susu.hp).toBe(600); // 苏柔未被回滚影响
  });
});

describe("listSnapshots", () => {
  it("按时间倒序列出快照", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const worker = mockWorker(ctx);
    await createSnapshot(worker, "第一", []);
    await createSnapshot(worker, "第二", []);
    const list = await listSnapshots(worker);
    expect(list.length).toBe(2);
    expect(list[0].description).toBe("第二"); // 最新的在前
  });
});
```

**验证门控**: `npm run test -- src/services/state.test.ts` 全绿 → M5 完成。

---

#### M7 技能系统 — 单元测试

**文件**: `src/services/__tests__/skills.test.ts`

```typescript
describe("saveSkill + loadSkill", () => {
  it("存储并按名检索", async () => {
    using ctx = createTestDb();
    const worker = mockWorker(ctx);
    await saveSkill(worker, "battle", "## 战斗场景创作指南\n...");
    const content = await loadSkill(worker, "battle");
    expect(content).toContain("战斗场景创作指南");
  });

  it("不存在返回 null", async () => {
    using ctx = createTestDb();
    const worker = mockWorker(ctx);
    const content = await loadSkill(worker, "不存在的技能");
    expect(content).toBeNull();
  });
});

describe("listSkills", () => {
  it("列出全部技能元数据", async () => {
    using ctx = createTestDb();
    const worker = mockWorker(ctx);
    await saveSkill(worker, "battle", "...");
    await saveSkill(worker, "power_system", "...");
    const list = await listSkills(worker);
    expect(list.map(s => s.name).sort()).toEqual(["battle", "power_system"]);
  });
});

describe("deleteSkill", () => {
  it("删除后检索返回 null", async () => {
    using ctx = createTestDb();
    const worker = mockWorker(ctx);
    await saveSkill(worker, "battle", "...");
    await deleteSkill(worker, "battle");
    expect(await loadSkill(worker, "battle")).toBeNull();
  });
});
```

**验证门控**: `npm run test -- src/services/skills.test.ts` 全绿 → M7 完成。

**里程碑 B 集成验证**: M1 + M2 + M3 + M4 + M5 + M7 联合测试

```typescript
// src/__tests__/milestone-b.test.ts
describe("里程碑 B: 服务层完整流程", () => {
  it("查询角色 → 加载技能 → 加载公式 → 计算 → 写入状态 → 创建快照", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const worker = mockWorker(ctx);

    // 1. 查角色
    const character = await queryCharacter(worker, "叶凡");
    expect(character.stage).toBe("筑基九层");

    // 2. 查设定
    const setting = await querySetting(worker, "金丹期突破条件");
    expect(setting).toBeDefined();

    // 3. 加载技能
    const skill = await loadSkill(worker, "battle");
    expect(skill).toBeDefined();

    // 4. 从 DB 加载公式，引擎求值
    const formulaTemplate = await loadFormulaTemplate(worker, "damage");
    const damage = evaluate(formulaTemplate, {
      skill_base: 1000, path_mult: 1.5, hit_mod: 1.0, target_resist: 0.3,
    });
    expect(damage.value).toBeGreaterThan(0);

    // 5. 更新角色状态
    await updateCharacterState(worker, "叶凡", { stage: "金丹期" });

    // 6. 创建快照
    const snapshotId = await createSnapshot(worker, "叶凡突破金丹", [
      { type: "character", name: "叶凡" },
    ]);

    // 7. 回滚验证
    await rollbackToSnapshot(worker, snapshotId);
    const rolled = await queryCharacter(worker, "叶凡");
    expect(rolled.stage).toBe("筑基九层");
  });
});
```

---

### Batch 4: M6 一致性校验器

---

#### M6 校验器 — 单元测试

**文件**: `src/services/__tests__/validator.test.ts`

```typescript
describe("validateConsistency", () => {
  it("完全一致的数据通过", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const worker = mockWorker(ctx);
    const result = await validateConsistency(worker);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("数值标记偏差检测", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const worker = mockWorker(ctx);

    // 写入一段包含 {{damage:5000}} 标记的正文
    // 但根据公式引擎计算，正确值应该是 1050
    await writeSegment(ctx.db, {
      content: "天雷落下，造成 {{damage:5000}} 点伤害",
    });

    const result = await validateConsistency(worker);
    expect(result.passed).toBe(false);
    const numericIssue = result.issues.find(i => i.category === "numeric");
    expect(numericIssue).toBeDefined();
    expect(numericIssue.severity).toBe("error");
    expect(numericIssue.actual).toBe(5000);
    expect(numericIssue.expected).toBeCloseTo(1050, -1);
  });

  it("角色属性范围校验", async () => {
    using ctx = createTestDb();
    seedCharacters(ctx.db, [
      { name: "叶凡", hp: -100 }, // 非法值
    ]);
    const worker = mockWorker(ctx);
    const result = await validateConsistency(worker);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.message.includes("HP"))).toBe(true);
  });
});

describe("validateTimeline", () => {
  it("因果链完整时通过", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const worker = mockWorker(ctx);
    const result = await validateTimeline(worker);
    expect(result.passed).toBe(true);
  });

  it("因果倒置检测", async () => {
    using ctx = createTestDb();
    seedTimeline(ctx.db, [
      { id: "T1", time: "T+10", cause: "T2" }, // T1 发生在 T10，但依赖 T2
      { id: "T2", time: "T+20", cause: null },  // T2 发生在 T20（晚于 T1）
    ]);
    const worker = mockWorker(ctx);
    const result = await validateTimeline(worker);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.category === "timeline")).toBe(true);
  });
});
```

**验证门控**: `npm run test -- src/services/validator.test.ts` 全绿 → M6 完成。

---

### Batch 5: M8 创作工具集

---

#### M8 工具集 — 单元测试

**文件**: `src/agent/tools/__tests__/tools.test.ts`

这是胶水层，重点验证：工具注册完整性、PauseGate 确认门控触发、calculate 工具与公式引擎集成。

```typescript
describe("createToolRegistry", () => {
  it("注册全部工具", () => {
    const gate = new MockPauseGate({ autoApprove: true });
    const tools = createToolRegistry({ db: mockWorker, gate });
    const names = tools.specs().map(s => s.function.name).sort();
    // 验证核心工具存在
    expect(names).toContain("query_character");
    expect(names).toContain("query_setting");
    expect(names).toContain("query_timeline");
    expect(names).toContain("get_skill");
    expect(names).toContain("calculate");
    expect(names).toContain("calculate_batch");
    expect(names).toContain("validate_consistency");
    expect(names).toContain("write_text");
    expect(names).toContain("edit_timeline");
    expect(names).toContain("confirm_checkpoint");
    expect(names).toContain("rollback");
    // 总数 20 个
    expect(names).toHaveLength(20);
  });
});

describe("A级工具: 无确认自动执行", () => {
  it("query_character 返回角色数据", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ autoApprove: true });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    const result = await tools.dispatch(
      "query_character",
      JSON.stringify({ name: "叶凡" })
    );
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("叶凡");
  });

  it("get_skill 返回技能文本", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ autoApprove: true });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    const result = await tools.dispatch(
      "get_skill",
      JSON.stringify({ name: "battle" })
    );
    expect(result).toContain("战斗");
  });

  it("calculate 从 DB 加载公式并求值", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ autoApprove: true });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    const result = await tools.dispatch(
      "calculate",
      JSON.stringify({
        formula: "damage",
        vars: { skill_base: 1000, path_mult: 1.5, hit_mod: 1.0, target_resist: 0.3 },
      })
    );
    const parsed = JSON.parse(result);
    expect(parsed.value).toBeCloseTo(1050);
    expect(parsed.breakdown).toBeDefined();
  });
});

describe("B级工具: 通知式确认", () => {
  it("write_text 触发 PauseGate", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ autoApprove: true });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    await tools.dispatch(
      "write_text",
      JSON.stringify({ content: "天雷轰然落下..." })
    );
    expect(gate.askCalled).toBe(true);
    expect(gate.lastAskKind).toBe("plan_proposed");
  });

  it("用户拒绝时返回 cancelled", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ response: { type: "cancel" } });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    const result = await tools.dispatch(
      "write_text",
      JSON.stringify({ content: "天雷轰然落下..." })
    );
    const parsed = JSON.parse(result);
    expect(parsed.cancelled).toBe(true);
  });
});

describe("C级工具: 阻断式确认", () => {
  it("edit_timeline 必须用户主动批准", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ response: { type: "revise", feedback: "再想想" } });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    const result = await tools.dispatch(
      "edit_timeline",
      JSON.stringify({ eventId: "T001", changes: {} })
    );
    const parsed = JSON.parse(result);
    expect(parsed.cancelled).toBe(true);
    expect(gate.lastAskKind).toBe("checkpoint");
  });

  it("confirm_checkpoint 确认后创建快照", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const gate = new MockPauseGate({ response: { type: "continue" } });
    const tools = createToolRegistry({ db: mockWorker(ctx), gate });
    const result = await tools.dispatch(
      "confirm_checkpoint",
      JSON.stringify({ description: "叶凡突破金丹" })
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.snapshotId).toBeDefined();
  });
});
```

**验证门控**: `npm run test -- src/agent/tools/` 全绿 → M8 完成。

---

### Batch 6: M9 StoryForgeLoop

---

#### M9 Agent Loop — 单元测试

**文件**: `src/agent/__tests__/loop.test.ts`

关键：Mock DeepSeekClient 和 ToolRegistry，验证循环逻辑正确性。

```typescript
describe("StoryForgeLoop", () => {
  it("无工具调用的单轮对话", async () => {
    const client = new MockDeepSeekClient({
      responses: [
        { content: "你好！我是书灵创作助手。", toolCalls: [] },
      ],
    });
    const tools = new ToolRegistry();
    const prefix = new ImmutablePrefix({ system: "你是创作助手" });
    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 10 });

    const events = [];
    for await (const event of loop.runTurn("你好")) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("assistant");
    expect(events[0].content).toContain("书灵");
    expect(events[1].type).toBe("done");
  });

  it("单次工具调用循环", async () => {
    const client = new MockDeepSeekClient({
      responses: [
        {
          content: "让我查询叶凡的状态",
          toolCalls: [{ id: "c1", function: { name: "query_character", arguments: '{"name":"叶凡"}' } }],
        },
        { content: "叶凡当前筑基九层，HP 1200", toolCalls: [] },
      ],
    });
    const tools = new ToolRegistry();
    tools.register({
      name: "query_character",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      fn: async () => JSON.stringify({ name: "叶凡", stage: "筑基九层", hp: 1200 }),
    });
    const prefix = new ImmutablePrefix({ system: "你是创作助手", toolSpecs: tools.specs() });
    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 10 });

    const events = [];
    for await (const event of loop.runTurn("查询叶凡状态")) {
      events.push(event);
    }

    // assistant → tool_call → tool_result → assistant → done
    expect(events.map(e => e.type)).toEqual([
      "assistant", "tool_call", "tool_result", "assistant", "done",
    ]);
  });

  it("多轮工具调用", async () => {
    const client = new MockDeepSeekClient({
      responses: [
        { content: "", toolCalls: [
          { id: "c1", function: { name: "query_character", arguments: '{"name":"叶凡"}' } },
        ]},
        { content: "", toolCalls: [
          { id: "c2", function: { name: "get_skill", arguments: '{"name":"battle"}' } },
        ]},
        { content: "", toolCalls: [
          { id: "c3", function: { name: "calculate", arguments: '{"formula":"damage","vars":{...}}' } },
        ]},
        { content: "战斗预演完成", toolCalls: [] },
      ],
    });
    const tools = new ToolRegistry();
    tools.register({ name: "query_character", parameters: {...}, fn: async () => "..." });
    tools.register({ name: "get_skill", parameters: {...}, fn: async () => "战斗指南" });
    tools.register({ name: "calculate", parameters: {...}, fn: async () => '{"value":1050}' });

    const prefix = new ImmutablePrefix({ system: "...", toolSpecs: tools.specs() });
    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 10 });

    const events = [];
    for await (const event of loop.runTurn("安排叶凡战斗")) {
      events.push(event);
    }

    expect(events.filter(e => e.type === "tool_call")).toHaveLength(3);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("迭代上限保护", async () => {
    // 每次都返回工具调用，永不停止
    const client = new MockDeepSeekClient({
      responses: Array.from({ length: 100 }, (_, i) => ({
        content: `第${i}轮`,
        toolCalls: [{ id: `c${i}`, function: { name: "query_character", arguments: '{"name":"叶凡"}' } }],
      })),
    });
    const tools = new ToolRegistry();
    tools.register({ name: "query_character", parameters: {...}, fn: async () => "..." });
    const prefix = new ImmutablePrefix({ system: "...", toolSpecs: tools.specs() });
    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 3 });

    const events = [];
    for await (const event of loop.runTurn("测试上限")) {
      events.push(event);
    }

    // 最多 3 轮迭代
    expect(events.filter(e => e.type === "tool_call")).toHaveLength(3);
    // 最后应该是 done（非 aborted）
    expect(events[events.length - 1].type).toBe("done");
  });

  it("abort 中断循环", async () => {
    const client = new MockDeepSeekClient({
      responses: Array.from({ length: 100 }, (_, i) => ({
        content: `第${i}轮`,
        toolCalls: [{ id: `c${i}`, function: { name: "query_character", arguments: '{"name":"叶凡"}' } }],
      })),
    });
    const tools = new ToolRegistry();
    tools.register({ name: "query_character", parameters: {...}, fn: async () => "..." });
    const prefix = new ImmutablePrefix({ system: "...", toolSpecs: tools.specs() });
    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 100 });

    const events = [];
    const iter = loop.runTurn("测试中断");
    for await (const event of iter) {
      events.push(event);
      if (events.length === 3) loop.abort(); // 3 个事件后中断
    }

    expect(events.some(e => e.type === "aborted")).toBe(true);
  });

  it("reasoning_content 传递到消息流", async () => {
    const client = new MockDeepSeekClient({
      responses: [
        { content: "思考后的回答", reasoningContent: "让我想想...", toolCalls: [] },
      ],
    });
    const tools = new ToolRegistry();
    const prefix = new ImmutablePrefix({ system: "..." });
    const loop = new StoryForgeLoop({ client, tools, prefix });

    const events = [];
    for await (const event of loop.runTurn("测试思考")) {
      events.push(event);
    }

    expect(events[0].reasoningContent).toBe("让我想想...");
  });
});
```

**验证门控**: `npm run test -- src/agent/loop.test.ts` 全绿 → M9 完成。

**里程碑 C 集成验证**: M8 + M9 联合（用 mock client，但用真实的工具集）

```typescript
// src/__tests__/milestone-c.test.ts
describe("里程碑 C: Agent 完整循环", () => {
  it("完整创作流程：查角色→查公式→计算→写入→校验", async () => {
    using ctx = createTestDb();
    seedStandardDataset(ctx.db);
    const worker = mockWorker(ctx);

    const gate = new MockPauseGate({ autoApprove: true });
    const tools = createToolRegistry({ db: worker, gate });
    const client = new MockDeepSeekClient({
      responses: [
        { content: "让我查叶凡状态", toolCalls: [
          { id: "c1", function: { name: "query_character", arguments: '{"name":"叶凡"}' } },
        ]},
        { content: "查一下伤害公式", toolCalls: [
          { id: "c2", function: { name: "get_skill", arguments: '{"name":"power_system"}' } },
        ]},
        { content: "计算伤害", toolCalls: [
          { id: "c3", function: { name: "calculate", arguments: JSON.stringify({
            formula: "damage",
            vars: { skill_base: 1000, path_mult: 1.5, hit_mod: 1.0, target_resist: 0.3 },
          })}},
        ]},
        { content: "写入正文", toolCalls: [
          { id: "c4", function: { name: "write_text", arguments: JSON.stringify({
            content: "天雷轰然落下，造成 {{damage:1050}} 点伤害",
          })}},
        ]},
        { content: "校验一致性", toolCalls: [
          { id: "c5", function: { name: "validate_consistency", arguments: "{}" } },
        ]},
        { content: "叶凡遭受天雷攻击，造成 1050 点伤害。校验通过。", toolCalls: [] },
      ],
    });

    const prefix = new ImmutablePrefix({
      system: "你是书灵创作助手。",
      toolSpecs: tools.specs(),
    });
    const loop = new StoryForgeLoop({ client, tools, prefix, maxIter: 10 });

    const events = [];
    for await (const event of loop.runTurn("给叶凡安排一场天劫")) {
      events.push(event);
    }

    // 5 次工具调用 + 最终回答
    expect(events.filter(e => e.type === "tool_call")).toHaveLength(5);
    expect(events[events.length - 1].type).toBe("done");
    expect(events[events.length - 1].content).toContain("1050");
  });
});
```

---

### Batch 7: M10 Express 后端 + M11 前端 Shell (并行)

---

#### M10 Express 后端 — 集成测试

**文件**: `src/server/__tests__/api.test.ts`

用 `supertest` 发送 HTTP 请求，不需要启动真实服务器。

```typescript
import request from "supertest";
import { createApp } from "../index.js";

describe("POST /api/projects", () => {
  it("创建项目返回 201", async () => {
    const app = createApp({ dataDir: tmpdir() });
    const res = await request(app)
      .post("/api/projects")
      .send({ name: "剑道独尊", genre: "玄幻" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});

describe("POST /api/projects/:id/chat (SSE)", () => {
  it("返回 SSE 事件流", async () => {
    const app = createApp({ dataDir: tmpdir() });
    const project = await request(app)
      .post("/api/projects")
      .send({ name: "测试", genre: "玄幻" });

    const res = await request(app)
      .post(`/api/projects/${project.body.id}/chat`)
      .send({ message: "你好" })
      .expect("Content-Type", /text\/event-stream/);

    // 解析 SSE 事件
    const events = parseSSE(res.text);
    expect(events.some(e => e.type === "done")).toBe(true);
  });
});

describe("POST /api/projects/:id/confirm", () => {
  it("响应确认门控", async () => {
    // 设置一个挂起的确认
    // POST confirm
    // 验证 Agent 循环继续
  });
});

describe("GET /api/projects/:id/tree", () => {
  it("返回五阶段文件树", async () => {
    const app = createApp({ dataDir: tmpdir() });
    const project = await request(app)
      .post("/api/projects")
      .send({ name: "测试", genre: "玄幻" });

    const res = await request(app).get(`/api/projects/${project.body.id}/tree`);
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: "01-世界观设定" })
    );
  });
});

describe("安全性", () => {
  it("API Key 不出现在响应中", async () => {
    const app = createApp({ dataDir: tmpdir() });
    const res = await request(app).get("/api/projects");
    expect(JSON.stringify(res.body)).not.toContain("sk-");
  });

  it("无效项目 ID 返回 404", async () => {
    const app = createApp({ dataDir: tmpdir() });
    await request(app).get("/api/projects/nonexistent").expect(404);
  });
});
```

**验证门控**: `npm run test -- src/server/` 全绿 → M10 完成。

---

#### M11 前端 Shell — 冒烟测试

**文件**: `web/src/__tests__/shell.test.ts`

前端测试用 `@vue/test-utils` + vitest。

```typescript
import { mount } from "@vue/test-utils";
import Workbench from "@/layouts/Workbench.vue";

describe("三栏布局", () => {
  it("渲染三个面板", () => {
    const wrapper = mount(Workbench);
    expect(wrapper.find("[data-panel=tree]").exists()).toBe(true);
    expect(wrapper.find("[data-panel=content]").exists()).toBe(true);
    expect(wrapper.find("[data-panel=dialog]").exists()).toBe(true);
  });

  it("面板可折叠", async () => {
    const wrapper = mount(Workbench);
    await wrapper.find("[data-panel=tree] .collapse-btn").trigger("click");
    expect(wrapper.find("[data-panel=tree]").classes()).toContain("collapsed");
  });
});
```

**验证门控**: `npm run test -- web/` 全绿 + 浏览器手动打开确认布局 → M11 完成。

---

### Batch 8: M12 前端组件

---

#### M12 前端组件 — 单元测试

**文件**: `web/src/components/__tests__/*.test.ts`

每个组件独立测试，用测试数据 mount。

```typescript
// FileTree.test.ts
describe("FileTree", () => {
  it("渲染五阶段目录", () => {
    const wrapper = mount(FileTree, {
      props: { tree: mockFileTree },
    });
    expect(wrapper.text()).toContain("01-世界观设定");
    expect(wrapper.text()).toContain("05-章节成文");
  });

  it("点击文件触发 select 事件", async () => {
    const wrapper = mount(FileTree, { props: { tree: mockFileTree } });
    await wrapper.find("[data-file='settings/力量体系']").trigger("click");
    expect(wrapper.emitted("select")).toBeDefined();
  });
});

// ConfirmCard.test.ts
describe("ConfirmCard", () => {
  it("B级通知卡片显示摘要", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "写入正文片段", id: "cf_1" },
    });
    expect(wrapper.text()).toContain("写入正文片段");
    expect(wrapper.find(".approve-btn").exists()).toBe(true);
  });

  it("C级阻断卡片显示差异", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "C", summary: "修改时间线因果链", id: "cf_2" },
    });
    expect(wrapper.find(".reject-btn").exists()).toBe(true);
  });
});

// TiptapEditor.test.ts
describe("TiptapEditor", () => {
  it("渲染文本内容", () => {
    const wrapper = mount(TiptapEditor, {
      props: { content: "<p>天雷轰然落下</p>" },
    });
    expect(wrapper.text()).toContain("天雷轰然落下");
  });

  it("高亮数值标记 {{damage:1050}}", () => {
    const wrapper = mount(TiptapEditor, {
      props: { content: "<p>造成 {{damage:1050}} 点伤害</p>" },
    });
    const marks = wrapper.findAll(".numeric-mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].text()).toContain("1050");
  });
});
```

**验证门控**: `npm run test -- web/src/components/` 全绿 → M12 完成。

---

## 四、端到端验证场景

全部模块完成后，用真实 DeepSeek API（非 mock）跑一次完整创作流程。

**文件**: `src/__tests__/e2e.test.ts`

> 注意：此测试需要有效 API Key，标记为 `e2e` 分组，CI 中可选跳过。

```typescript
describe.skipIf(!process.env.DEEPSEEK_API_KEY)("E2E: 完整创作流程", () => {
  it("玄幻小说：设定→角色→战斗→校验", async () => {
    // 1. 创建项目
    // 2. 用户: "创建一个玄幻世界，有修仙体系"
    //    Agent 调用: edit_setting, edit_character, get_skill("worldbuilding")
    // 3. 用户: "给叶凡安排一场突破金丹的战斗"
    //    Agent 调用: query_character, get_skill("battle"), calculate, write_text, validate_consistency
    // 4. 用户: "确认提交"
    //    Agent 调用: confirm_checkpoint (C级确认)
    // 5. 验证: 角色状态更新，快照存在，正文包含数值标记且校验通过
  });
});
```

运行方式：

```bash
DEEPSEEK_API_KEY=sk-xxx npm run test -- --grep e2e
```

---

## 五、验证检查清单总览

每个阶段的完成标准：

| 阶段 | 完成标准 | 命令 |
|------|----------|------|
| M1 公式引擎 | 单元测试全绿 | `npm run test -- src/engine/` |
| M2 数据库 Schema | 迁移 + CRUD + FTS5 测试全绿 | `npm run test -- src/db/schema.test.ts` |
| M3 Worker | 请求/响应/事务/并发测试全绿 | `npm run test -- src/db/worker.test.ts` |
| **里程碑 A** | **公式从 DB 加载 → 引擎求值，集成测试通过** | `npm run test -- milestone-a` |
| M4 知识检索 | 查询 + 信息安全协议测试全绿 | `npm run test -- src/services/knowledge.test.ts` |
| M5 状态管理 | 快照/回滚/事务测试全绿 | `npm run test -- src/services/state.test.ts` |
| M7 技能系统 | CRUD 测试全绿 | `npm run test -- src/services/skills.test.ts` |
| **里程碑 B** | **查询→技能→公式→计算→写入→快照，集成测试通过** | `npm run test -- milestone-b` |
| M6 校验器 | 数值/时间线/角色校验测试全绿 | `npm run test -- src/services/validator.test.ts` |
| M8 工具集 | 20 工具注册 + A/B/C 确认门控测试全绿 | `npm run test -- src/agent/tools/` |
| M9 Agent Loop | 循环/上限/中断/多工具测试全绿 | `npm run test -- src/agent/loop.test.ts` |
| **里程碑 C** | **Mock Agent 完整创作循环测试通过** | `npm run test -- milestone-c` |
| M10 后端 | REST + SSE + 安全性测试全绿 | `npm run test -- src/server/` |
| **里程碑 D** | **HTTP API 全端点测试通过** | `npm run test -- src/server/` |
| M11 前端 Shell | 三栏布局渲染测试全绿 | `npm run test -- web/src/layouts/` |
| M12 前端组件 | 各组件独立渲染测试全绿 | `npm run test -- web/src/components/` |
| **里程碑 E** | **浏览器中完整创作流程可用** | 手动验证 + E2E 测试 |

---

## 六、每日验证命令

开发过程中随时运行：

```bash
# 跑全部测试
npm run test

# 只跑当前开发的模块
npm run test -- src/engine/

# 监听模式（开发时）
npm run test:watch -- src/engine/

# 覆盖率报告
npm run test:coverage

# 只跑里程碑集成测试
npm run test -- milestone

# E2E（需要 API Key）
DEEPSEEK_API_KEY=sk-xxx npm run test -- e2e
```
