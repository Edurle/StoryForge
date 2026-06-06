import { ToolRegistry } from "../../../lib/reasonix-core/tools.js";
import type { PauseGate } from "../../../lib/reasonix-core/core/pause-gate.js";
import type { DbWorker } from "../../db/worker.js";
import { registerQueryTools } from "./query-tools.js";
import { registerCalcTools } from "./calc-tools.js";
import { registerWriteTools } from "./write-tools.js";

export function createToolRegistry(deps: {
  db: DbWorker;
  gate: PauseGate;
}): ToolRegistry {
  const reg = new ToolRegistry();
  registerQueryTools(reg, deps.db);
  registerCalcTools(reg, deps.db);
  registerWriteTools(reg, deps.db, deps.gate);
  return reg;
}
