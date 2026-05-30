import { describe, it, expect } from "vitest";
import { setupTestDb, seedCharacters } from "./helpers.js";
import { createSnapshot, rollbackToSnapshot, listSnapshots } from "../state.js";

describe("State Manager", () => {
  const db = setupTestDb();

  it("createSnapshot returns a numeric id", async () => {
    await seedCharacters(db.w, [
      { name: "叶凡", stage: "筑基九层", custom_attrs: '{"hp": 1200}' },
    ]);

    const id = await createSnapshot(db.w, "initial state", [
      { type: "character", id: "叶凡" },
    ]);

    expect(id).toBeTypeOf("number");
    expect(id).toBeGreaterThan(0);
  });

  it("rollbackToSnapshot restores character attributes to snapshot state", async () => {
    await seedCharacters(db.w, [
      { name: "苏柔", stage: "炼气八层", custom_attrs: '{"hp": 600}' },
    ]);

    const sId = await createSnapshot(db.w, "before battle", [
      { type: "character", id: "苏柔" },
    ]);

    await db.w.request({
      id: 0,
      type: "run",
      sql: "UPDATE characters SET custom_attrs = ? WHERE name = ?",
      params: ['{"hp": 300}', "苏柔"],
    });

    await rollbackToSnapshot(db.w, sId);

    const res = await db.w.request({
      id: 0,
      type: "query",
      sql: "SELECT custom_attrs FROM characters WHERE name = ?",
      params: ["苏柔"],
    });
    const rows = res.data as Array<{ custom_attrs: string }>;
    expect(rows[0]!.custom_attrs).toBe('{"hp": 600}');
  });

  it("rollback does not affect unmodified entities", async () => {
    await seedCharacters(db.w, [
      { name: "魔尊", stage: "元婴初期", custom_attrs: '{"hp": 5000}' },
      { name: "林婉", stage: "金丹期", custom_attrs: '{"hp": 2000}' },
    ]);

    const sId = await createSnapshot(db.w, "魔尊 only", [
      { type: "character", id: "魔尊" },
    ]);

    await db.w.request({
      id: 0,
      type: "run",
      sql: "UPDATE characters SET custom_attrs = ? WHERE name = ?",
      params: ['{"hp": 0}', "魔尊"],
    });
    await db.w.request({
      id: 0,
      type: "run",
      sql: "UPDATE characters SET custom_attrs = ? WHERE name = ?",
      params: ['{"hp": 100}', "林婉"],
    });

    await rollbackToSnapshot(db.w, sId);

    const mRes = await db.w.request({
      id: 0,
      type: "query",
      sql: "SELECT custom_attrs FROM characters WHERE name = ?",
      params: ["魔尊"],
    });
    expect((mRes.data as Array<{ custom_attrs: string }>)[0]!.custom_attrs).toBe('{"hp": 5000}');

    const lRes = await db.w.request({
      id: 0,
      type: "query",
      sql: "SELECT custom_attrs FROM characters WHERE name = ?",
      params: ["林婉"],
    });
    expect((lRes.data as Array<{ custom_attrs: string }>)[0]!.custom_attrs).toBe('{"hp": 100}');
  });

  it("listSnapshots returns snapshots in reverse chronological order", async () => {
    const s1 = await createSnapshot(db.w, "first", []);
    const s2 = await createSnapshot(db.w, "second", []);

    const list = await listSnapshots(db.w);
    const ids = list.map((s) => s.id);
    const i1 = ids.indexOf(s1);
    const i2 = ids.indexOf(s2);
    expect(i2).toBeLessThan(i1);
  });

  it("multiple snapshots can be created and rolled back independently", async () => {
    await seedCharacters(db.w, [
      { name: "赵云", stage: "炼气一层", custom_attrs: '{"hp": 100}' },
    ]);

    const s1 = await createSnapshot(db.w, "state A", [
      { type: "character", id: "赵云" },
    ]);

    await db.w.request({
      id: 0,
      type: "run",
      sql: "UPDATE characters SET custom_attrs = ? WHERE name = ?",
      params: ['{"hp": 200}', "赵云"],
    });

    const s2 = await createSnapshot(db.w, "state B", [
      { type: "character", id: "赵云" },
    ]);

    await db.w.request({
      id: 0,
      type: "run",
      sql: "UPDATE characters SET custom_attrs = ? WHERE name = ?",
      params: ['{"hp": 300}', "赵云"],
    });

    await rollbackToSnapshot(db.w, s1);
    let res = await db.w.request({
      id: 0,
      type: "query",
      sql: "SELECT custom_attrs FROM characters WHERE name = ?",
      params: ["赵云"],
    });
    expect((res.data as Array<{ custom_attrs: string }>)[0]!.custom_attrs).toBe('{"hp": 100}');

    await rollbackToSnapshot(db.w, s2);
    res = await db.w.request({
      id: 0,
      type: "query",
      sql: "SELECT custom_attrs FROM characters WHERE name = ?",
      params: ["赵云"],
    });
    expect((res.data as Array<{ custom_attrs: string }>)[0]!.custom_attrs).toBe('{"hp": 200}');
  });
});
