import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "../schema.js";

function createDb(): Database.Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

function getTableNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
  ).map(r => r.name);
}

describe("migrate — creates all tables", () => {
  const REQUIRED_TABLES = [
    "characters",
    "items",
    "factions",
    "locations",
    "chapters",
    "segments",
    "kg_nodes",
    "kg_relations",
    "timeline_events",
    "outlines",
    "scripts",
    "entity_configs",
    "card_templates",
    "global_constants",
    "formulas",
    "kg_relation_types",
    "agent_messages",
    "agent_sessions",
    "skills",
    "snapshots",
    "snapshot_entities",
  ];

  it("creates all required tables", () => {
    const db = createDb();
    const tables = getTableNames(db);
    for (const t of REQUIRED_TABLES) {
      expect(tables).toContain(t);
    }
    db.close();
  });
});

describe("migrate — idempotent", () => {
  it("running twice does not throw", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    db.close();
  });

  it("data survives re-migration", () => {
    const db = createDb();
    db.prepare("INSERT INTO characters (name, stage) VALUES (?, ?)").run("叶凡", "筑基九层");
    migrate(db);
    const row = db.prepare("SELECT name FROM characters WHERE name = ?").get("叶凡");
    expect((row as { name: string }).name).toBe("叶凡");
    db.close();
  });
});

describe("characters table", () => {
  it("insert and query", () => {
    const db = createDb();
    db.prepare(
      "INSERT INTO characters (name, stage, custom_attrs) VALUES (?, ?, ?)"
    ).run("叶凡", "筑基九层", JSON.stringify({ hp: 1200, spirit_power: 800 }));
    const row = db.prepare("SELECT * FROM characters WHERE name = ?").get("叶凡") as Record<string, unknown>;
    expect(row.name).toBe("叶凡");
    expect(row.stage).toBe("筑基九层");
    const attrs = JSON.parse(row.custom_attrs as string);
    expect(attrs.hp).toBe(1200);
    db.close();
  });

  it("has created_at and updated_at defaults", () => {
    const db = createDb();
    db.prepare("INSERT INTO characters (name) VALUES (?)").run("test");
    const row = db.prepare("SELECT created_at, updated_at FROM characters WHERE name = ?").get("test") as Record<string, string>;
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
    db.close();
  });
});

describe("formulas table", () => {
  it("insert and query", () => {
    const db = createDb();
    db.prepare(
      "INSERT INTO formulas (name, template, description, vars) VALUES (?, ?, ?, ?)"
    ).run("damage", "skill_base * path_mult * (1 - resist)", "伤害计算", "skill_base,path_mult,resist");
    const row = db.prepare("SELECT * FROM formulas WHERE name = ?").get("damage") as Record<string, unknown>;
    expect(row.template).toBe("skill_base * path_mult * (1 - resist)");
    expect(row.description).toBe("伤害计算");
    db.close();
  });

  it("unique name constraint", () => {
    const db = createDb();
    db.prepare("INSERT INTO formulas (name, template) VALUES (?, ?)").run("damage", "a");
    expect(() =>
      db.prepare("INSERT INTO formulas (name, template) VALUES (?, ?)").run("damage", "b")
    ).toThrow();
    db.close();
  });
});

describe("skills table", () => {
  it("insert and query", () => {
    const db = createDb();
    db.prepare("INSERT INTO skills (name, content) VALUES (?, ?)").run("battle", "## 战斗指南");
    const row = db.prepare("SELECT * FROM skills WHERE name = ?").get("battle") as Record<string, unknown>;
    expect(row.content).toBe("## 战斗指南");
    db.close();
  });

  it("unique name constraint", () => {
    const db = createDb();
    db.prepare("INSERT INTO skills (name, content) VALUES (?, ?)").run("battle", "a");
    expect(() =>
      db.prepare("INSERT INTO skills (name, content) VALUES (?, ?)").run("battle", "b")
    ).toThrow();
    db.close();
  });
});

describe("timeline_events table", () => {
  it("insert with cause reference", () => {
    const db = createDb();
    db.prepare(
      "INSERT INTO timeline_events (id, time, description, cause_id) VALUES (?, ?, ?, ?)"
    ).run("T001", "T+1", "叶凡入门", null);
    db.prepare(
      "INSERT INTO timeline_events (id, time, description, cause_id) VALUES (?, ?, ?, ?)"
    ).run("T002", "T+10", "叶凡突破", "T001");
    const row = db.prepare("SELECT * FROM timeline_events WHERE id = ?").get("T002") as Record<string, unknown>;
    expect(row.cause_id).toBe("T001");
    db.close();
  });
});

describe("kg_nodes + kg_relations (knowledge graph)", () => {
  it("insert nodes and relations", () => {
    const db = createDb();
    db.prepare("INSERT INTO kg_nodes (id, type, label) VALUES (?, ?, ?)").run("N1", "character", "叶凡");
    db.prepare("INSERT INTO kg_nodes (id, type, label) VALUES (?, ?, ?)").run("N2", "character", "苏柔");
    db.prepare(
      "INSERT INTO kg_relations (source_id, target_id, type) VALUES (?, ?, ?)"
    ).run("N1", "N2", "师兄妹");
    const rels = db.prepare("SELECT * FROM kg_relations").all() as Record<string, unknown>[];
    expect(rels).toHaveLength(1);
    expect(rels[0]!.type).toBe("师兄妹");
    db.close();
  });
});

describe("agent_messages table", () => {
  it("insert with seq ordering", () => {
    const db = createDb();
    db.prepare("INSERT INTO agent_sessions (id, project_id) VALUES (?, ?)").run("s1", "p1");
    db.prepare(
      "INSERT INTO agent_messages (session_id, seq, role, content) VALUES (?, ?, ?, ?)"
    ).run("s1", 1, "user", "你好");
    db.prepare(
      "INSERT INTO agent_messages (session_id, seq, role, content) VALUES (?, ?, ?, ?)"
    ).run("s1", 2, "assistant", "你好！");
    const rows = db.prepare(
      "SELECT * FROM agent_messages WHERE session_id = ? ORDER BY seq"
    ).all("s1") as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.seq).toBe(1);
    expect(rows[1]!.seq).toBe(2);
    db.close();
  });
});

describe("snapshots + snapshot_entities", () => {
  it("create snapshot with entity references", () => {
    const db = createDb();
    db.prepare("INSERT INTO characters (name, stage) VALUES (?, ?)").run("叶凡", "筑基九层");
    db.prepare("INSERT INTO characters (name, stage) VALUES (?, ?)").run("苏柔", "炼气八层");

    const info = db.prepare(
      "INSERT INTO snapshots (description) VALUES (?)"
    ).run("突破前");
    const snapshotId = info.lastInsertRowid;

    db.prepare(
      "INSERT INTO snapshot_entities (snapshot_id, entity_type, entity_id, attrs_json) VALUES (?, ?, ?, ?)"
    ).run(Number(snapshotId), "character", "叶凡", JSON.stringify({ stage: "筑基九层", hp: 1200 }));

    const row = db.prepare(
      "SELECT * FROM snapshot_entities WHERE snapshot_id = ?"
    ).get(Number(snapshotId)) as Record<string, unknown>;
    expect(row.entity_type).toBe("character");
    expect(row.entity_id).toBe("叶凡");
    db.close();
  });
});

describe("segments table", () => {
  it("insert segment with chapter FK", () => {
    const db = createDb();
    const ch = db.prepare("INSERT INTO chapters (title, volume) VALUES (?, ?)").run("第一章", 1);
    db.prepare(
      "INSERT INTO segments (chapter_id, seq, content, type) VALUES (?, ?, ?, ?)"
    ).run(Number(ch.lastInsertRowid), 1, "天雷轰然落下", "narration");
    const seg = db.prepare("SELECT * FROM segments").get() as Record<string, unknown>;
    expect(seg.content).toBe("天雷轰然落下");
    expect(seg.type).toBe("narration");
    db.close();
  });
});
