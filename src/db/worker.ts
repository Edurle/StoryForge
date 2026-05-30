import Database from "better-sqlite3";
import { migrate } from "./schema.js";

export interface DbRequest {
  id: number;
  type: "query" | "run" | "batch";
  sql: string | string[];
  params?: unknown[];
}

export interface DbResponse {
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface DbWorker {
  request(req: DbRequest): Promise<DbResponse>;
  close(): void;
}

export function createDbWorker(dbPath: string): DbWorker {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);

  let closed = false;

  return {
    async request(req: DbRequest): Promise<DbResponse> {
      if (closed) throw new Error("DbWorker is closed");

      try {
        switch (req.type) {
          case "query": {
            const sql = req.sql as string;
            const stmt = db.prepare(sql);
            const data = req.params ? stmt.all(...req.params) : stmt.all();
            return { id: req.id, ok: true, data };
          }
          case "run": {
            const sql = req.sql as string;
            const stmt = db.prepare(sql);
            const info = req.params ? stmt.run(...req.params) : stmt.run();
            return { id: req.id, ok: true, data: info.changes };
          }
          case "batch": {
            const sqls = Array.isArray(req.sql) ? req.sql : [req.sql];
            const results: number[] = [];
            const transaction = db.transaction(() => {
              for (const sql of sqls) {
                const info = db.prepare(sql).run();
                results.push(info.changes);
              }
            });
            transaction();
            return { id: req.id, ok: true, data: results };
          }
          default:
            return { id: req.id, ok: false, error: `Unknown request type: ${(req as DbRequest & { type: string }).type}` };
        }
      } catch (e) {
        return {
          id: req.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },

    close() {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
