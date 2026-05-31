import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA);
}

const SCHEMA = `
-- ============================================================
-- entities
-- ============================================================

CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  stage       TEXT    NOT NULL DEFAULT '',
  custom_attrs TEXT   NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  type        TEXT    NOT NULL DEFAULT '',
  custom_attrs TEXT   NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS factions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT    NOT NULL DEFAULT '',
  custom_attrs TEXT   NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT    NOT NULL DEFAULT '',
  custom_attrs TEXT   NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- content
-- ============================================================

CREATE TABLE IF NOT EXISTS chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  volume      INTEGER NOT NULL DEFAULT 1,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'draft',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS segments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id  INTEGER NOT NULL REFERENCES chapters(id),
  seq         INTEGER NOT NULL DEFAULT 0,
  type        TEXT    NOT NULL DEFAULT 'narration',
  content     TEXT    NOT NULL DEFAULT '',
  characters  TEXT    NOT NULL DEFAULT '[]',
  location    TEXT    NOT NULL DEFAULT '',
  mood        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- knowledge graph
-- ============================================================

CREATE TABLE IF NOT EXISTS kg_nodes (
  id          TEXT    PRIMARY KEY,
  type        TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  attrs       TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kg_relations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT    NOT NULL REFERENCES kg_nodes(id),
  target_id   TEXT    NOT NULL REFERENCES kg_nodes(id),
  type        TEXT    NOT NULL,
  attrs       TEXT    NOT NULL DEFAULT '{}',
  UNIQUE(source_id, target_id, type)
);

CREATE TABLE IF NOT EXISTS kg_relation_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT    NOT NULL DEFAULT ''
);

-- ============================================================
-- timeline
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_events (
  id          TEXT    PRIMARY KEY,
  time        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  cause_id    TEXT    REFERENCES timeline_events(id),
  characters  TEXT    NOT NULL DEFAULT '[]',
  location    TEXT    NOT NULL DEFAULT '',
  attrs       TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- outline
-- ============================================================

CREATE TABLE IF NOT EXISTS outlines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER REFERENCES outlines(id),
  volume      INTEGER NOT NULL DEFAULT 1,
  seq         INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  foreshadow  TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'draft',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- scripts
-- ============================================================

CREATE TABLE IF NOT EXISTS scripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id    TEXT    NOT NULL UNIQUE,
  scene_type  TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  content     TEXT    NOT NULL DEFAULT '',
  constraints TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- genre configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_configs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT    NOT NULL,
  field_name  TEXT    NOT NULL,
  field_type  TEXT    NOT NULL DEFAULT 'text',
  indexed     INTEGER NOT NULL DEFAULT 0,
  attrs       TEXT    NOT NULL DEFAULT '{}',
  UNIQUE(entity_type, field_name)
);

CREATE TABLE IF NOT EXISTS card_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_type  TEXT    NOT NULL UNIQUE,
  layout      TEXT    NOT NULL DEFAULT '{}',
  description TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS global_constants (
  key         TEXT    PRIMARY KEY,
  value       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS formulas (
  name        TEXT    PRIMARY KEY,
  template    TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  vars        TEXT    NOT NULL DEFAULT ''
);

-- ============================================================
-- agent
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_sessions (
  id          TEXT    PRIMARY KEY,
  project_id  TEXT    NOT NULL,
  model       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL REFERENCES agent_sessions(id),
  seq         INTEGER NOT NULL,
  role        TEXT    NOT NULL,
  content     TEXT    NOT NULL DEFAULT '',
  tool_calls  TEXT    NOT NULL DEFAULT '[]',
  tool_call_id TEXT   NOT NULL DEFAULT '',
  reasoning_content TEXT NOT NULL DEFAULT '',
  usage_json  TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session_seq
  ON agent_messages(session_id, seq);

-- ============================================================
-- skills
-- ============================================================

CREATE TABLE IF NOT EXISTS skills (
  name        TEXT    PRIMARY KEY,
  content     TEXT    NOT NULL DEFAULT '',
  description TEXT    NOT NULL DEFAULT '',
  category    TEXT    NOT NULL DEFAULT '通用',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshot_entities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id     INTEGER NOT NULL REFERENCES snapshots(id),
  entity_type     TEXT    NOT NULL,
  entity_id       TEXT    NOT NULL,
  attrs_json      TEXT    NOT NULL DEFAULT '{}',
  UNIQUE(snapshot_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS api_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT    NOT NULL DEFAULT '',
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cache_hit_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_miss_tokens INTEGER NOT NULL DEFAULT 0,
  model             TEXT    NOT NULL DEFAULT '',
  type              TEXT    NOT NULL DEFAULT 'chat',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- context snapshots (LLM context state per turn)
-- ============================================================

CREATE TABLE IF NOT EXISTS context_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT    NOT NULL,
  session_id  TEXT    NOT NULL,
  snapshot    TEXT    NOT NULL DEFAULT '[]',
  token_count INTEGER NOT NULL DEFAULT 0,
  compressed  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_session
  ON context_snapshots(session_id, id DESC);

-- ============================================================
-- projects (global registry, lives in projects.db)
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
