import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDbWorker } from "../worker.js";
import type { DbRequest } from "../worker.js";

function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "sf-worker-"));
  return join(dir, "test.db");
}

function cleanup(worker: ReturnType<typeof createDbWorker>, dbPath: string) {
  worker.close();
  const dir = join(dbPath, "..");
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe("DbWorker — query", () => {
  it("returns query results", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const res = await w.request({ id: 1, type: "query", sql: "SELECT 1 + 1 AS sum" });
      expect(res.id).toBe(1);
      expect(res.ok).toBe(true);
      expect((res.data as { sum: number }[])[0]!.sum).toBe(2);
    } finally { cleanup(w, dbPath); }
  });

  it("query with params", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      await w.request({ id: 1, type: "run", sql: "INSERT INTO characters (name, stage) VALUES (?, ?)", params: ["叶凡", "筑基"] });
      const res = await w.request({ id: 2, type: "query", sql: "SELECT name, stage FROM characters WHERE name = ?", params: ["叶凡"] });
      expect(res.ok).toBe(true);
      expect((res.data as { name: string }[])[0]!.name).toBe("叶凡");
    } finally { cleanup(w, dbPath); }
  });
});

describe("DbWorker — run", () => {
  it("executes write and returns changes", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const res = await w.request({ id: 1, type: "run", sql: "INSERT INTO characters (name) VALUES (?)", params: ["test"] });
      expect(res.ok).toBe(true);
      expect(res.data).toBe(1);
    } finally { cleanup(w, dbPath); }
  });
});

describe("DbWorker — batch (transaction)", () => {
  it("all succeed committed", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const res = await w.request({
        id: 1,
        type: "batch",
        sql: [
          "INSERT INTO characters (name) VALUES ('A')",
          "INSERT INTO characters (name) VALUES ('B')",
        ],
      });
      expect(res.ok).toBe(true);
      const check = await w.request({ id: 2, type: "query", sql: "SELECT count(*) AS cnt FROM characters" });
      expect((check.data as { cnt: number }[])[0]!.cnt).toBe(2);
    } finally { cleanup(w, dbPath); }
  });

  it("partial failure rolls back all", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const res = await w.request({
        id: 1,
        type: "batch",
        sql: [
          "INSERT INTO characters (name) VALUES ('A')",
          "INSERT INTO nonexistent_table (x) VALUES (1)",
        ],
      });
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
      const check = await w.request({ id: 2, type: "query", sql: "SELECT count(*) AS cnt FROM characters" });
      expect((check.data as { cnt: number }[])[0]!.cnt).toBe(0);
    } finally { cleanup(w, dbPath); }
  });
});

describe("DbWorker — errors", () => {
  it("SQL error returns ok: false with message", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const res = await w.request({ id: 1, type: "query", sql: "SELECT * FROM nonexistent" });
      expect(res.ok).toBe(false);
      expect(res.error).toContain("no such table");
    } finally { cleanup(w, dbPath); }
  });

  it("request after close rejects", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    w.close();
    await expect(w.request({ id: 1, type: "query", sql: "SELECT 1" })).rejects.toThrow(/closed/i);
    try { rmSync(join(dbPath, ".."), { recursive: true, force: true }); } catch {}
  });
});

describe("DbWorker — concurrency", () => {
  it("handles concurrent requests", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(w.request({ id: i, type: "query", sql: "SELECT ? AS v", params: [i] }));
      }
      const results = await Promise.all(promises) as { ok: boolean; data: { v: number }[] }[];
      expect(results.every(r => r.ok)).toBe(true);
      for (let i = 0; i < 50; i++) {
        expect(results[i]!.data[0]!.v).toBe(i);
      }
    } finally { cleanup(w, dbPath); }
  });
});

describe("DbWorker — migrate runs on init", () => {
  it("tables exist after createDbWorker", async () => {
    const dbPath = tmpDbPath();
    const w = createDbWorker(dbPath);
    try {
      const res = await w.request({
        id: 1,
        type: "query",
        sql: "SELECT count(*) AS cnt FROM sqlite_master WHERE type='table'",
      });
      expect((res.data as { cnt: number }[])[0]!.cnt).toBeGreaterThan(10);
    } finally { cleanup(w, dbPath); }
  });
});
