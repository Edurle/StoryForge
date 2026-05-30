# StoryForge — Agent Instructions

## Project

StoryForge ("书灵") is an Agent-driven long-form web novel creation engine. All 12 modules are implemented.

## Commands

- `npm run typecheck` — `tsc --noEmit` (zero errors expected)
- `npm run build` — `tsc` (emits to `dist/`)
- `npm run test` — `vitest run` (149 tests)
- `npm run dev` — start backend (8888) + frontend (3456)
- `npm run dev:stop` — stop all services
- `npm run dev:status` — check running services
- `npm run setup-key` — configure DeepSeek API key

## Architecture

- **ESM project**: `"type": "module"` in package.json, `tsconfig` uses `"module": "ESNext"` + `"moduleResolution": "bundler"`
- **TypeScript strict mode**: `strict: true` + `noUncheckedIndexedAccess: true`
- **Frontend**: separate package in `web/` (Vue 3 + Vite + Pinia + vue-tsc)
- **API Key**: stored in `~/.storyforge/config.json` (read by `lib/reasonix-core/config.ts`)

### Backend (`src/`)

- `src/engine/formula.ts` — M1: generic formula evaluator (tokenizer + recursive descent parser + evaluator). Supports arithmetic, comparison, variables, builtins (min/max/clamp/abs/floor/ceil/round/rand/if).
- `src/db/schema.ts` — M2: `migrate(db)` creates 21 tables with indexes.
- `src/db/worker.ts` — M3: `createDbWorker(dbPath)` returns async `DbWorker` interface (query/run/batch).
- `src/services/knowledge.ts` — M4: queryCharacter, queryCharacters, querySetting, queryTimeline, queryRelations, queryFormulas. Timeline range filtering, relations depth=1 only.
- `src/services/state.ts` — M5: createSnapshot, rollbackToSnapshot, listSnapshots. Batch transaction rollback.
- `src/services/validator.ts` — M6: validateNumericConsistency, validateTimelineConsistency, validateCharacterConsistency.
- `src/services/skills.ts` — M7: loadSkill, saveSkill (upsert), listSkills, deleteSkill.
- `src/agent/tools/` — M8: 19 tools registered via `createToolRegistry({db, gate})`. A-level (auto), B-level (plan_proposed gate), C-level (plan_checkpoint gate). `calculate` tool loads formula from DB + evaluates with M1.
- `src/agent/loop.ts` — M9: `StoryForgeLoop.runTurn(input)` async generator yields `EngineEvent` (assistant/tool_call/tool_result/done/error/aborted).
- `src/server/` — M10: Express 5 app with project CRUD + SSE chat + content routes. All routes on `/api/projects`.

### Frontend (`web/`)

- `web/src/views/ProjectList.vue` — project list with create
- `web/src/views/ProjectWorkbench.vue` — three-panel IDE layout (knowledge | chat | editor)
- `web/src/stores/` — Pinia stores (project, layout with localStorage persistence)
- `web/src/api/client.ts` — HTTP + SSE client
- `web/src/components/` — M12: FileTree, ContentViewer, DiffViewer, DialogPanel, ConfirmCard, TiptapEditor, TimelineVis, RelationGraph

### Library (`lib/reasonix-core/`)

Extracted from [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix). Internal library, not npm. Entry: `lib/reasonix-core/index.ts`.

## Conventions

- Import paths use `.js` extension: `import { X } from "./types.js"`
- Config path: `~/.storyforge/config.json`
- No comments in code
- Backend tests: `vitest` (149 tests, run from project root)
- Frontend tests: `vitest` in `web/` (49 tests)
- Root `vitest.config.ts` excludes `web/`
- Ports: backend 8888, frontend 3456 (configurable via `PORT` and `FRONTEND_PORT` env vars)
- `dev.sh` manages services with PID files + port-level cleanup

## Key Design Decisions

- Formula engine is generic (no domain logic); genre-specific formulas stored in DB `formulas` table
- DbWorker uses direct async wrapper (not Worker threads); can swap to real `node:worker_threads` later
- Calculation tools: 1 generic `calculate` + 1 `calculate_batch` (not per-genre fixed tools)
- Express 5: route registration directly on `app` object (not nested routers)
- PauseGate auto-approves B/C levels in terminal mode (no interactive UI for confirmations yet)
