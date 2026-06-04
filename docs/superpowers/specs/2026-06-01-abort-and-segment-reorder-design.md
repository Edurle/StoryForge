# Abort + Segment Reorder Design

## Feature 1: Agent Stop Button

### Current State
- `StoryForgeLoop.abort()` exists, sets `AbortController.abort()`
- Loop checks `signal.aborted` at top of each iteration, yields `{ type: "aborted" }` and returns
- `api.chat()` returns `AbortController` but frontend ignores it
- SSE `finally` block saves all messages + snapshot to DB

### Changes

#### Backend (`src/agent/loop.ts`)
- `client.chat()` call: catch abort error specifically. When `err.name === 'AbortError'`, yield `{ type: "aborted" }` instead of `{ type: "error" }`
- No other loop changes needed — `finally` in SSE handler already saves messages

#### Backend (`src/server/index.ts`)
- Add `DELETE /api/projects/:projectId/chat/abort` route that calls `loop.abort()`
- SSE handler: handle `aborted` event type, send `event: aborted\ndata: {}\n\n`
- On abort, `finally` block still runs and saves messages up to abort point

#### Frontend (`web/src/api/client.ts`)
- `api.abort(projectId)` — calls the abort endpoint

#### Frontend (`web/src/views/ProjectWorkbench.vue`)
- Store `AbortController` from `api.chat()` in component ref `chatCtrl`
- Send button: when `sending=true`, show red "停止" button instead. Click calls `api.abort()` and sets `sending=false`
- Handle `aborted` SSE event: show "[已停止]" message, refresh knowledge + chapters

### Flow
1. User clicks "停止"
2. Frontend calls `DELETE /api/projects/:pid/chat/abort`
3. Server calls `loop.abort()`
4. Loop yields `{ type: "aborted" }` on next check
5. SSE sends `event: aborted`
6. SSE `finally` saves messages + snapshot to DB
7. Frontend shows "[已停止]", refreshes data

---

## Feature 2: Segment Drag Reorder

### Current State
- Segments have `seq` column, ordered by `seq, id`
- `segment` tool: `create` appends (MAX+1), `insert` shifts subsequent
- No reorder/move action exists
- Frontend chapter content: flat `<pre>` with joined text, no per-segment display

### Changes

#### Backend (`src/services/knowledge.ts`)
- New function `reorderSegments(w, chapterId, orderedIds)` — batch update seq based on array index

#### Backend (`src/server/index.ts`)
- New route `PUT /api/projects/:projectId/chapters/:chapterId/segments/reorder`
- Body: `{ segmentIds: number[] }`
- Calls `reorderSegments`, returns `{ success: true }`

#### Backend (`src/services/knowledge.ts`)
- New function `queryChapterSegments(w, chapterId)` — returns `[{ id, seq, content }]` ordered by seq

#### Backend (`src/server/index.ts`)
- New route `GET /api/projects/:projectId/chapters/:chapterId/segments` — returns segment list with content

#### Frontend (`web/`)
- Install `vuedraggable@next`
- New API methods: `api.getChapterSegments(projectId, chapterId)`, `api.reorderSegments(projectId, chapterId, segmentIds)`
- `ProjectWorkbench.vue`: chapter content area shows segments as draggable blocks (each with handle + content preview)
- On drag end: call reorder API with new segment ID order
- Fallback: if drag library fails to load, show flat text as before

### Segment Block UI
- Each segment: drag handle (⋮⋮) on left, truncated content preview on right
- Background: subtle card style, hover highlight
- Active/selected segment: blue border
- Dragging: shadow + slight scale
