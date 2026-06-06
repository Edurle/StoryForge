<template>
  <div class="workbench">
    <header>
      <router-link to="/" class="back-link">← 返回</router-link>
      <span class="project-name">{{ projectStore.currentName }}</span>
      <span class="progress-info" v-if="projectStats">
        <span class="progress-label">{{ formatWords(projectStats.wordCount) }} / {{ formatTarget(projectStats.targetWords) }}</span>
        <span class="progress-bar-mini">
          <span class="progress-fill-mini" :style="{ width: Math.min(projectStats.progress * 100, 100) + '%' }"></span>
        </span>
        <span class="progress-percent">{{ (projectStats.progress * 100).toFixed(1) }}%</span>
      </span>
      <span class="usage-stats">
        对话: {{ usage.totalCalls }}次
        · 输入 {{ (usage.totalPromptTokens / 1000).toFixed(1) }}k
        · 输出 {{ (usage.totalCompletionTokens / 1000).toFixed(1) }}k
        · 缓存 {{ cachePercent }}%
        · ¥{{ usage.totalCostYuan.toFixed(4) }}
        <span style="margin-left: 8px;">
          压缩: {{ compressUsage.totalCalls }}次
          · ¥{{ compressUsage.totalCostYuan.toFixed(4) }}
        </span>
      </span>
      <span class="ctx-bar">
        <span class="ctx-fill" :class="ctxClass" :style="{ width: ctxPercent + '%' }"></span>
      </span>
      <span class="ctx-label">{{ (lastContextTokens / 1000).toFixed(0) }}k/1M</span>
      <label class="auto-approve-toggle">
        <input type="checkbox" v-model="autoApproveB" />
        <span>自动批准写入</span>
      </label>
      <button @click="layout.toggleLeft()">{{ layout.leftCollapsed ? "▶" : "◀" }} 知识库</button>
      <button @click="layout.toggleRight()">{{ layout.rightCollapsed ? "◀" : "▶" }} 章节</button>
    </header>
    <div class="panels">
      <aside v-show="!layout.leftCollapsed" class="left-panel">
        <div class="panel-header">
          知识库
        </div>
        <div class="kb-tabs">
          <div v-for="tab in kbTabs" :key="tab" :class="['kb-tab', { active: activeKbTab === tab }]" @click="activeKbTab = tab">{{ tab }}</div>
        </div>
        <div class="kb-list">
          <template v-if="activeKbTab === '提示词'">
            <div class="kb-cards">
              <div class="kb-card">
                <pre class="system-prompt-content">{{ systemPrompt }}</pre>
              </div>
            </div>
          </template>
          <template v-else-if="activeKbTab === '关系图'">
            <div v-if="graphData.nodes.length > 0" class="kb-graph-container">
              <RelationGraph :nodes="graphNodes" :edges="graphEdges" />
            </div>
            <div v-else class="kb-empty">暂无关系数据</div>
          </template>
          <template v-else>
            <div class="kb-cards">
              <template v-if="activeKbTab === '全部' || activeKbTab === '角色'">
                <div v-for="c in kbData.characters" :key="'c-'+c.name" class="kb-card" @click="activeKbTab = '角色'">
                  <div class="kb-card-header"><span class="kb-card-name">{{ c.name }}</span><span class="kb-card-badge">{{ c.stage }}</span></div>
                  <div class="kb-card-attrs"><span v-for="(v, k) in c.attrs" :key="k" class="kb-attr">{{ k }}: {{ v }}</span></div>
                </div>
              </template>
              <template v-if="activeKbTab === '全部' || activeKbTab === '设定'">
                <div v-for="[group, items] of settingGroups" :key="'sg-'+group" class="kb-group">
                  <div class="kb-group-header">{{ group }}</div>
                  <div v-for="s in items" :key="'s-'+s.topic" class="kb-card">
                    <div class="kb-card-header"><span class="kb-card-name">{{ s.topic }}</span></div>
                    <div class="kb-card-content">{{ s.content }}</div>
                  </div>
                </div>
              </template>
              <template v-if="activeKbTab === '全部' || activeKbTab === '时间线'">
                <div v-for="t in kbData.timeline" :key="'t-'+t.id" class="kb-card">
                  <div class="kb-card-header"><span class="kb-card-name">{{ t.time }}</span></div>
                  <div class="kb-card-content">{{ t.description }}</div>
                  <div class="kb-card-attrs"><span v-for="ch in t.characters" :key="ch" class="kb-attr">{{ ch }}</span></div>
                </div>
              </template>
              <template v-if="activeKbTab === '全部' || activeKbTab === '公式'">
                <div v-for="f in kbData.formulas" :key="'f-'+f.name" class="kb-card">
                  <div class="kb-card-header"><span class="kb-card-name">{{ f.name }}</span></div>
                  <div class="kb-card-content">{{ f.template }}</div>
                </div>
              </template>
              <template v-if="activeKbTab === '全部'">
                <div v-for="it in kbData.items" :key="'i-'+it.name" class="kb-card">
                  <div class="kb-card-header"><span class="kb-card-name">{{ it.name }}</span><span class="kb-card-badge">{{ it.type }}</span></div>
                  <div class="kb-card-attrs"><span v-for="(v, k) in it.attrs" :key="k" class="kb-attr">{{ k }}: {{ v }}</span></div>
                </div>
                <div v-for="fa in kbData.factions" :key="'fa-'+fa.name" class="kb-card">
                  <div class="kb-card-header"><span class="kb-card-name">{{ fa.name }}</span></div>
                  <div class="kb-card-content">{{ fa.description }}</div>
                </div>
                <div v-for="lo in kbData.locations" :key="'lo-'+lo.name" class="kb-card">
                  <div class="kb-card-header"><span class="kb-card-name">{{ lo.name }}</span></div>
                  <div class="kb-card-content">{{ lo.description }}</div>
                </div>
              </template>
              <div v-if="isKbEmpty" class="kb-empty">暂无数据</div>
            </div>
          </template>
        </div>
      </aside>
      <main class="center">
        <div class="messages" ref="messagesContainer">
          <template v-for="(msg, i) in messages" :key="i">
            <div v-if="msg.role === 'user'" class="msg-row user-row">
              <div class="bubble user-bubble">{{ msg.content }}</div>
              <div class="avatar user-avatar">U</div>
            </div>
            <div v-else-if="msg.role === 'assistant'" class="msg-row assistant-row">
              <div class="avatar assistant-avatar">A</div>
              <div class="bubble assistant-bubble">
                <div v-if="msg.reasoningContent" class="reasoning-section">
                  <div class="reasoning-toggle" @click="msg.reasoningExpanded = !msg.reasoningExpanded">
                    {{ msg.reasoningExpanded ? '▼' : '▶' }} 💭 思考过程
                  </div>
                  <pre v-show="msg.reasoningExpanded" class="reasoning-text">{{ msg.reasoningContent }}</pre>
                </div>
                <div v-html="renderMarkdown(msg.content)"></div>
                <div v-if="msg.usage" class="bubble-usage">
                  输入 {{ msg.usage.promptTokens }} · 输出 {{ msg.usage.completionTokens }}
                  · 缓存 {{ usagePercent(msg.usage) }}%
                  · ¥{{ (msg.usage.costYuan ?? 0).toFixed(4) }}
                </div>
              </div>
            </div>
            <div v-else-if="msg.role === 'tool'" class="msg-row tool-row">
              <div class="tool-badge">🔧</div>
              <div class="tool-content">{{ msg.content }}</div>
            </div>
            <div v-else-if="msg.role === 'error'" class="msg-row error-row">
              <div class="error-bubble">{{ msg.content }}</div>
            </div>
          </template>
        </div>
        <div class="input-area">
          <textarea v-model="input" class="chat-input" rows="3" placeholder="输入创作指令..." @keydown.enter.exact="send" :disabled="sending" />
          <div class="input-bar">
            <div class="input-controls">
              <select v-model="currentModel" class="chat-select" title="模型">
                <option value="deepseek-v4-flash">Flash</option>
                <option value="deepseek-v4-pro">Pro</option>
              </select>
              <select v-model="currentThinking" class="chat-select" title="思考模式">
                <option value="enabled">思考</option>
                <option value="disabled">不思考</option>
              </select>
              <select v-if="currentThinking === 'enabled'" v-model="currentEffort" class="chat-select" title="思考深度">
                <option value="high">High</option>
                <option value="max">Max</option>
              </select>
            </div>
            <button v-if="sending" class="stop-btn" @click="stopChat">停止</button>
            <button v-else class="send-btn" @click="send" :disabled="!input.trim()">发送</button>
          </div>
        </div>
      </main>
      <aside v-show="!layout.rightCollapsed" class="right-panel">
        <div class="panel-header">
          章节
          <a v-if="chapters.length > 0" :href="api.getExportUrl(props.id)" :download="(projectStore.currentName || 'export') + '.txt'" class="panel-action-btn">导出 TXT</a>
        </div>
        <div class="chapter-tree" v-if="chapters.length > 0">
          <div v-for="vol in volumes" :key="vol" class="chapter-volume">
            <div class="volume-header">第{{ vol }}卷</div>
            <div v-for="ch in chaptersByVolume(vol)" :key="ch.id"
              :class="['chapter-item', { active: selectedChapterId === ch.id }]"
              @click="selectChapter(ch.id)">
              <span class="chapter-title">{{ ch.title }}</span>
              <span class="chapter-segments">{{ ch.segmentCount }}段 · {{ formatWords(ch.wordCount) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="editor-placeholder">暂无章节，通过对话让 AI 创建。</div>
        <div v-if="selectedChapterId != null" class="chapter-content-area">
          <div v-if="chapterLoading" class="editor-placeholder">加载中...</div>
          <div v-else class="segment-list">
            <draggable
              v-model="chapterSegments"
              item-key="id"
              handle=".seg-handle"
              @end="handleSegmentReorder"
            >
              <template #item="{ element }">
                <div class="segment-item">
                  <span class="seg-handle" title="拖拽排序">⋮⋮</span>
                  <pre class="segment-text">{{ element.content }}</pre>
                </div>
              </template>
            </draggable>
          </div>
        </div>
      </aside>
    </div>
    <div v-if="gateRequest" class="gate-overlay">
      <div class="gate-dialog">
        <div class="gate-title">
          {{ gateRequest.kind === 'plan_proposed' ? '操作确认' : '重要操作确认' }}
        </div>
        <div class="gate-body">{{ (gateRequest.payload as Record<string, unknown>).summary ?? (gateRequest.payload as Record<string, unknown>).result ?? JSON.stringify(gateRequest.payload) }}</div>
        <div class="gate-actions">
          <button class="gate-cancel" @click="resolveGate(false)">拒绝</button>
          <button class="gate-approve" @click="resolveGate(true)">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useLayoutStore } from "@/stores/layout.js";
import { useProjectStore } from "@/stores/project.js";
import { api } from "@/api/client.js";
import { marked } from "marked";
import RelationGraph from "@/components/RelationGraph.vue";
import draggable from "vuedraggable";

interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  costYuan?: number;
}

interface DisplayMessage {
  role: string;
  content: string;
  reasoningContent?: string;
  reasoningExpanded?: boolean;
  usage?: UsageInfo;
}

const props = defineProps<{ id: string }>();
const layout = useLayoutStore();
const projectStore = useProjectStore();
const input = ref("");
const sending = ref(false);
const messages = ref<DisplayMessage[]>([]);
const systemPrompt = ref("");
const usage = ref({ totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCacheHitTokens: 0, totalCostYuan: 0 });
const compressUsage = ref({ totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCacheHitTokens: 0, totalCostYuan: 0 });
const messagesContainer = ref<HTMLElement | null>(null);
const currentModel = ref("deepseek-v4-pro");
const currentThinking = ref("enabled");
const currentEffort = ref("high");
const activeKbTab = ref("全部");
const chapters = ref<Array<{ id: number; volume: number; title: string; status: string; segmentCount: number; wordCount: number }>>([]);
const selectedChapterId = ref<number | null>(null);
const projectStats = ref<{ wordCount: number; targetWords: number; progress: number; chapterCount: number } | null>(null);
const chapterContent = ref("");
const chapterLoading = ref(false);
const chatCtrl = ref<AbortController | null>(null);
const chapterSegments = ref<Array<{ id: number; seq: number; content: string }>>([]);
const kbTabs = ["全部", "角色", "设定", "时间线", "公式", "关系图", "提示词"];
const kbData = ref<{
  characters: Array<{ name: string; stage: string; attrs: Record<string, unknown> }>;
  settings: Array<{ topic: string; content: string; tag: string }>;
  timeline: Array<{ id: string; time: string; description: string; characters: string[] }>;
  formulas: Array<{ name: string; template: string; vars: string }>;
  items: Array<{ name: string; type: string; attrs: Record<string, unknown> }>;
  factions: Array<{ name: string; description: string; attrs: Record<string, unknown> }>;
  locations: Array<{ name: string; description: string; attrs: Record<string, unknown> }>;
}>({ characters: [], settings: [], timeline: [], formulas: [], items: [], factions: [], locations: [] });
const graphData = ref<{ nodes: Array<{ id: string; type: string; label: string }>; edges: Array<{ source_id: string; target_id: string; type: string; source_label: string; target_label: string }> }>({ nodes: [], edges: [] });

const graphNodes = computed(() => graphData.value.nodes.map(n => ({ id: n.id, label: n.label, group: n.type })));
const graphEdges = computed(() => graphData.value.edges.map(e => ({ source: e.source_id, target: e.target_id, type: e.type })));

const isKbEmpty = computed(() => {
  const d = kbData.value;
  if (activeKbTab.value === "角色") return d.characters.length === 0;
  if (activeKbTab.value === "设定") return d.settings.length === 0;
  if (activeKbTab.value === "时间线") return d.timeline.length === 0;
  if (activeKbTab.value === "公式") return d.formulas.length === 0;
  return d.characters.length + d.settings.length + d.timeline.length + d.formulas.length + d.items.length + d.factions.length + d.locations.length === 0;
});

const volumes = computed(() => [...new Set(chapters.value.map(c => c.volume))].sort((a, b) => (a as number) - (b as number)));

const settingGroups = computed(() => {
  const groups = new Map<string, Array<{ topic: string; content: string; tag: string }>>();
  for (const s of kbData.value.settings) {
    const key = s.tag || "未分类";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return groups;
});

function chaptersByVolume(vol: number) {
  return chapters.value.filter(c => c.volume === vol);
}

async function loadKnowledge() {
  try {
    const [characters, settings, formulas, timeline, items, factions, locations, graph] = await Promise.all([
      api.getKnowledge<typeof kbData.value.characters>(props.id, "characters"),
      api.getKnowledge<typeof kbData.value.settings>(props.id, "settings"),
      api.getKnowledge<typeof kbData.value.formulas>(props.id, "formulas"),
      api.getKnowledge<typeof kbData.value.timeline>(props.id, "timeline"),
      api.getKnowledge<typeof kbData.value.items>(props.id, "items"),
      api.getKnowledge<typeof kbData.value.factions>(props.id, "factions"),
      api.getKnowledge<typeof kbData.value.locations>(props.id, "locations"),
      api.getKnowledgeGraph(props.id),
    ]);
    kbData.value = { characters, settings, formulas, timeline, items, factions, locations };
    graphData.value = graph;
  } catch {}
}

async function loadChapters() {
  try {
    chapters.value = await api.getChapters(props.id);
  } catch {}
}

async function loadStats() {
  try {
    projectStats.value = await api.getStats(props.id);
  } catch {}
}

function formatWords(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatTarget(n: number): string {
  return (n / 10000).toFixed(0) + "万";
}

async function selectChapter(id: number) {
  if (selectedChapterId.value === id) {
    selectedChapterId.value = null;
    chapterContent.value = "";
    chapterSegments.value = [];
    return;
  }
  selectedChapterId.value = id;
  chapterLoading.value = true;
  chapterContent.value = "";
  chapterSegments.value = [];
  try {
    chapterSegments.value = await api.getChapterSegments(props.id, id);
    chapterContent.value = chapterSegments.value.map(s => s.content).join("\n\n");
  } catch {
    chapterContent.value = "加载失败";
  } finally {
    chapterLoading.value = false;
  }
}

async function handleSegmentReorder() {
  if (selectedChapterId.value == null) return;
  const ids = chapterSegments.value.map(s => s.id);
  try {
    await api.reorderSegments(props.id, selectedChapterId.value, ids);
    chapterSegments.value = chapterSegments.value.map((s, i) => ({ ...s, seq: i }));
  } catch {}
}

async function stopChat() {
  if (chatCtrl.value) {
    chatCtrl.value.abort();
    chatCtrl.value = null;
  }
  await api.abort(props.id);
  sending.value = false;
  loadKnowledge();
  loadChapters();
  loadStats();
}

const autoApproveB = ref(true);
const gateRequest = ref<{ id: number; kind: string; payload: unknown } | null>(null);
let lastUsage: UsageInfo | undefined;
const lastContextTokens = ref(0);

const cachePercent = computed(() => {
  if (usage.value.totalPromptTokens === 0) return "0";
  return ((usage.value.totalCacheHitTokens / usage.value.totalPromptTokens) * 100).toFixed(1);
});

const ctxPercent = computed(() => {
  return Math.min(100, (lastContextTokens.value / 1_000_000) * 100);
});

const ctxClass = computed(() => {
  if (ctxPercent.value > 80) return "ctx-red";
  if (ctxPercent.value > 50) return "ctx-yellow";
  return "ctx-green";
});

function usagePercent(u: UsageInfo): string {
  const total = u.cacheHitTokens + u.cacheMissTokens;
  if (total === 0) return "0";
  return ((u.cacheHitTokens / total) * 100).toFixed(1);
}

function formatToolCall(name: string, argsStr: string): string {
  try {
    const args = JSON.parse(argsStr);
    const pairs = Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    const joined = pairs.join(", ");
    return `🔧 ${name}(${joined.length > 200 ? joined.slice(0, 200) + "…" : joined})`;
  } catch {
    return `🔧 ${name}(${argsStr.length > 200 ? argsStr.slice(0, 200) + "…" : argsStr})`;
  }
}

function formatToolResult(result: string): string {
  const display = result.length > 200 ? result.slice(0, 200) + "…" : result;
  return `  → ${display}`;
}

function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

async function loadSystemPrompt() {
  try {
    const res = await api.getSystemPrompt(props.id);
    systemPrompt.value = res.prompt;
  } catch {}
}

async function loadUsage() {
  try {
    const [u, cu] = await Promise.all([api.getUsage(props.id), api.getCompressUsage(props.id)]);
    usage.value = u;
    compressUsage.value = cu;
  } catch {}
}

async function loadHistory() {
  try {
    const hist = await api.getHistory(props.id);
    for (const m of hist) {
      if (m.role === "user" || m.role === "assistant" || m.role === "tool") {
        const display: DisplayMessage = {
          role: m.role,
          content: m.role === "tool" ? m.content : m.content,
        };
        if (m.role === "tool") {
          let toolDisplay = m.content;
          try {
            const callInfo = JSON.parse(m.toolCalls) as { name?: string; arguments?: string };
            if (callInfo.name) {
              toolDisplay = formatToolCall(callInfo.name, callInfo.arguments ?? "{}");
              toolDisplay += "\n" + formatToolResult(m.content);
            }
          } catch {}
          display.content = toolDisplay;
        }
        if (m.role === "assistant" && m.reasoningContent) {
          display.reasoningContent = m.reasoningContent;
        }
        if (m.usageJson) {
          try {
            display.usage = JSON.parse(m.usageJson) as UsageInfo;
          } catch {}
        }
        messages.value.push(display);
      }
    }
    const lastWithUsage = [...messages.value].reverse().find(m => m.usage);
    if (lastWithUsage?.usage) {
      lastContextTokens.value = lastWithUsage.usage.promptTokens;
    }
    scrollToBottom();
  } catch {}
}

 onMounted(() => {
  layout.loadFromStorage();
  projectStore.setCurrent(props.id);
  loadSystemPrompt();
  loadUsage();
  loadStats();
  loadHistory();
   loadKnowledge();
   loadChapters();
});

async function send() {
  if (!input.value.trim() || sending.value) return;
  const text = input.value.trim();
  input.value = "";
  messages.value.push({ role: "user", content: text });
  lastUsage = undefined;
  sending.value = true;
  scrollToBottom();

  let pendingMsg: DisplayMessage | undefined;

  chatCtrl.value = api.chat(props.id, text, (event) => {
    if (event.type === "reasoning_delta") {
      const delta = event.data as { content: string };
      if (!pendingMsg) {
        messages.value.push({ role: "assistant", content: "", reasoningContent: "", reasoningExpanded: true });
        pendingMsg = messages.value[messages.value.length - 1]!;
      }
      if (!pendingMsg.reasoningContent) pendingMsg.reasoningContent = "";
      pendingMsg.reasoningContent += delta.content;
      scrollToBottom();
    } else if (event.type === "content_delta") {
      const delta = event.data as { content: string };
      if (!pendingMsg) {
        messages.value.push({ role: "assistant", content: "", reasoningExpanded: false });
        pendingMsg = messages.value[messages.value.length - 1]!;
      }
      pendingMsg.content += delta.content;
      scrollToBottom();
    } else if (event.type === "usage") {
      lastUsage = event.data as UsageInfo;
      lastContextTokens.value = lastUsage.promptTokens;
    } else if (event.type === "assistant") {
      const data = event.data as { content: string; reasoningContent?: string };
      if (pendingMsg) {
        pendingMsg.content = data.content;
        if (data.reasoningContent) pendingMsg.reasoningContent = data.reasoningContent;
        pendingMsg.reasoningExpanded = false;
        pendingMsg.usage = lastUsage;
        pendingMsg = undefined;
      } else {
        messages.value.push({ role: "assistant", content: data.content, reasoningContent: data.reasoningContent, usage: lastUsage });
      }
      lastUsage = undefined;
      scrollToBottom();
    } else if (event.type === "tool_call") {
      pendingMsg = undefined;
      const data = event.data as { name: string; args: string };
      messages.value.push({ role: "tool", content: formatToolCall(data.name, data.args) });
      scrollToBottom();
    } else if (event.type === "tool_result") {
      pendingMsg = undefined;
      const data = event.data as { name: string; result: string };
      const lastTool = [...messages.value].reverse().find(m => m.role === "tool" && m.content.startsWith("🔧"));
      if (lastTool) {
        lastTool.content += "\n" + formatToolResult(data.result);
      } else {
        messages.value.push({ role: "tool", content: formatToolResult(data.result) });
      }
      scrollToBottom();
    } else if (event.type === "gate_request") {
      const data = event.data as { id: number; kind: string; payload: unknown };
      if (data.kind === "plan_proposed" && autoApproveB.value) {
        api.resolveGate(props.id, data.id, { type: "approve" });
      } else {
        gateRequest.value = data;
      }
    } else if (event.type === "compressed") {
      const data = event.data as { beforeTokens: number; afterTokens: number; summaryLevels: number };
      pendingMsg = undefined;
      messages.value.push({
        role: "tool",
        content: `📦 上下文已压缩: ${(data.beforeTokens / 1000).toFixed(0)}k → ${(data.afterTokens / 1000).toFixed(0)}k tokens (${data.summaryLevels}级摘要)`,
      });
      scrollToBottom();
    } else if (event.type === "done") {
      pendingMsg = undefined;
      sending.value = false;
      chatCtrl.value = null;
      loadUsage();
      loadKnowledge();
      loadChapters();
    } else if (event.type === "error") {
      pendingMsg = undefined;
      const data = event.data as { error: string };
      messages.value.push({ role: "error", content: data.error });
      sending.value = false;
      chatCtrl.value = null;
      scrollToBottom();
    } else if (event.type === "aborted") {
      pendingMsg = undefined;
      sending.value = false;
      chatCtrl.value = null;
      messages.value.push({ role: "tool", content: "⏹ 已停止" });
      scrollToBottom();
      loadKnowledge();
      loadChapters();
    }
  }, {
    model: currentModel.value,
    thinking: currentThinking.value,
    reasoning_effort: currentEffort.value,
  });
}

async function resolveGate(approve: boolean) {
  if (!gateRequest.value) return;
  const { id, kind } = gateRequest.value;
  gateRequest.value = null;
  let verdict: Record<string, unknown>;
  if (kind === "plan_proposed") {
    verdict = approve ? { type: "approve" } : { type: "cancel" };
  } else {
    verdict = approve ? { type: "continue" } : { type: "stop" };
  }
  await api.resolveGate(props.id, id, verdict);
}
</script>

<style scoped>
.workbench {
  height: 98vh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}
header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  height: 44px;
  padding: 0 1.2rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  flex-shrink: 0;
}
.back-link {
  color: #6366f1;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.85rem;
  white-space: nowrap;
}
.back-link:hover { text-decoration: underline; }
.project-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #111827;
}
.progress-info {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.5rem;
  font-size: 0.72rem;
  color: #6b7280;
}
.progress-label {
  white-space: nowrap;
}
.progress-bar-mini {
  display: inline-block;
  width: 80px;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill-mini {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  border-radius: 3px;
  transition: width 0.4s ease;
}
.progress-percent {
  font-weight: 600;
  color: #6366f1;
  white-space: nowrap;
}
.usage-stats {
  font-size: 0.72rem;
  color: #9ca3af;
  margin-left: auto;
  white-space: nowrap;
}
.auto-approve-toggle {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: #9ca3af;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.auto-approve-toggle input {
  accent-color: #6366f1;
  cursor: pointer;
}
.auto-approve-toggle:hover { color: #6b7280; }
.ctx-bar {
  display: inline-block;
  width: 80px;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  vertical-align: middle;
  margin-left: 0.3rem;
}
.ctx-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s, background 0.3s;
}
.ctx-green { background: #22c55e; }
.ctx-yellow { background: #eab308; }
.ctx-red { background: #ef4444; }
.ctx-label {
  font-size: 0.65rem;
  color: #b0b8c4;
  margin-left: 0.2rem;
}
header button {
  padding: 0.25rem 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.75rem;
  color: #6b7280;
  transition: all 0.15s;
}
header button:hover { background: #f3f4f6; color: #374151; }

/* ===== PANELS ===== */
.panels {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ===== LEFT: 知识库 ===== */
.left-panel {
  flex: 1;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
.panel-header {
  padding: 0.7rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.panel-action-btn {
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 0.15rem 0.4rem;
  font-size: 0.7rem;
  color: #6b7280;
  cursor: pointer;
}
.panel-action-btn:hover { background: #f3f4f6; }

.kb-tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 0.4rem;
  flex-shrink: 0;
}
.kb-tab {
  padding: 0.4rem 0.6rem;
  font-size: 0.72rem;
  color: #9ca3af;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.kb-tab.active {
  color: #6366f1;
  border-bottom-color: #6366f1;
  font-weight: 600;
}
.kb-tab:hover { color: #6b7280; }

.kb-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.system-prompt-content {
  padding: 0.6rem;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
}

.kb-cards { padding: 0.4rem 0; }
.kb-graph-container { flex: 1; display: flex; flex-direction: column; padding: 0.4rem 0.6rem; min-height: 0; }
.kb-graph-container .relation-graph { flex: 1; min-height: 0; }
.kb-card {
  margin: 0.4rem 0.6rem;
  padding: 0.5rem 0.6rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.78rem;
  cursor: default;
}
.kb-card:hover { border-color: #d1d5db; }
.kb-group-header { font-size: 0.8rem; font-weight: 700; color: #6b7280; padding: 0.4rem 0 0.2rem 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 0.4rem; margin-top: 0.4rem; }
.kb-card-header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; }
.kb-card-name { font-weight: 600; color: #111827; }
.kb-card-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 3px;
}
.kb-card-attrs { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.kb-attr {
  font-size: 0.7rem;
  padding: 0.1rem 0.3rem;
  background: #f3f4f6;
  border-radius: 3px;
  color: #4b5563;
}
.kb-card-content {
  color: #374151;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 80px;
  overflow: hidden;
}
.kb-empty { text-align: center; color: #9ca3af; padding: 2rem 0; font-size: 0.82rem; }

/* ===== CENTER: 聊天 ===== */
.center {
  width: 820px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
  overflow: hidden;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.2rem 1rem;
  scroll-behavior: smooth;
}

.msg-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 0.8rem;
  gap: 0.5rem;
}
.user-row { justify-content: flex-end; }
.assistant-row { justify-content: flex-start; }
.tool-row { justify-content: flex-start; padding-left: 0.5rem; }
.error-row { justify-content: center; }

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
  color: #fff;
}
.user-avatar { background: #6366f1; }
.assistant-avatar { background: #10b981; }

.bubble {
  max-width: 75%;
  border-radius: 14px;
  padding: 0.6rem 0.9rem;
  line-height: 1.55;
  word-break: break-word;
  font-size: 0.88rem;
}
.user-bubble {
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 1px 3px rgba(99,102,241,0.2);
}
.assistant-bubble {
  background: #fff;
  color: #1f2937;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.assistant-bubble :deep(h1), .assistant-bubble :deep(h2), .assistant-bubble :deep(h3) {
  margin: 0.5em 0 0.2em;
  font-weight: 600;
}
.assistant-bubble :deep(h1) { font-size: 1.3em; }
.assistant-bubble :deep(h2) { font-size: 1.1em; }
.assistant-bubble :deep(h3) { font-size: 1.05em; }
.assistant-bubble :deep(p) { margin: 0.35em 0; }
.assistant-bubble :deep(pre) {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 0.6em 0.8em;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.82em;
  margin: 0.4em 0;
}
.assistant-bubble :deep(code) {
  background: #f3f4f6;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.85em;
  color: #e11d48;
}
.assistant-bubble :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}
.assistant-bubble :deep(ul), .assistant-bubble :deep(ol) {
  padding-left: 1.4em;
  margin: 0.25em 0;
}
.assistant-bubble :deep(blockquote) {
  border-left: 3px solid #6366f1;
  padding-left: 0.7em;
  margin: 0.4em 0;
  color: #6b7280;
}
.assistant-bubble :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
}
.assistant-bubble :deep(th), .assistant-bubble :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 0.3em 0.6em;
  font-size: 0.9em;
}
.assistant-bubble :deep(th) {
  background: #f3f4f6;
  font-weight: 600;
}
.assistant-bubble :deep(strong) { color: #111; }
.assistant-bubble :deep(a) { color: #6366f1; }
.assistant-bubble :deep(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 0.6em 0; }

.bubble-usage {
  font-size: 0.65rem;
  color: #b0b8c4;
  margin-top: 0.3rem;
  padding-top: 0.25rem;
  border-top: 1px solid #f6f7f8;
}

.reasoning-section {
  margin-bottom: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}
.reasoning-toggle {
  font-size: 0.75rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  background: #fafbfc;
  user-select: none;
  transition: background 0.15s;
}
.reasoning-toggle:hover { background: #f3f4f6; }
.reasoning-text {
  margin: 0;
  padding: 0.5rem;
  background: #fafbfc;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 280px;
  overflow-y: auto;
  color: #9ca3af;
  border-top: 1px solid #f3f4f6;
  line-height: 1.5;
}

.tool-badge {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  border-radius: 8px;
  font-weight: 600;
  flex-shrink: 0;
}
.tool-content {
  font-size: 0.78rem;
  color: #a8977a;
  background: #fffdf5;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
  max-width: 80%;
  word-break: break-word;
}

.error-bubble {
  background: #fef2f2;
  color: #dc2626;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid #fecaca;
  font-size: 0.88rem;
}

.input-area {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  padding: 0;
}
.chat-input {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 0.6rem 0.9rem;
  font-size: 0.88rem;
  line-height: 1.5;
  font-family: inherit;
  color: #1f2937;
  box-sizing: border-box;
}
.chat-input::placeholder { color: #b0b8c4; }
.chat-input:focus { background: #fafbfc; }
.input-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.7rem 0.5rem;
  border-top: 1px solid #f3f4f6;
}
.input-controls {
  display: flex;
  gap: 0.35rem;
}
.send-btn {
  padding: 0.35rem 1rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}
.send-btn:hover { background: #4f46e5; }
.send-btn:disabled { background: #c7d2fe; cursor: not-allowed; }
.chat-select {
  font-size: 0.72rem;
  padding: 0.35rem 0.4rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
  cursor: pointer;
  outline: none;
  color: #374151;
}
.chat-select:focus { border-color: #6366f1; }

/* ===== RIGHT: 章节 ===== */
.right-panel {
  flex: 1;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
.editor-placeholder {
  text-align: center;
  color: #9ca3af;
  margin-top: 2rem;
  font-size: 0.85rem;
}
.chapter-tree {
  border-bottom: 1px solid #f3f4f6;
  max-height: 40%;
  overflow-y: auto;
  flex-shrink: 0;
}
.volume-header {
  padding: 0.4rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #9ca3af;
  background: #fafbfc;
}
.chapter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.8rem 0.4rem 1.4rem;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s;
}
.chapter-item:hover { background: #f3f4f6; }
.chapter-item.active { background: #eff6ff; color: #1d4ed8; }
.chapter-title { color: #374151; }
.chapter-item.active .chapter-title { color: #1d4ed8; font-weight: 500; }
.chapter-segments { font-size: 0.68rem; color: #b0b8c4; }
.chapter-content-area {
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid #f3f4f6;
}
.chapter-text {
  padding: 0.8rem;
  font-size: 0.88rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  color: #1f2937;
}

.gate-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.gate-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  min-width: 340px;
  max-width: 480px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
}
.gate-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.6rem;
}
.gate-body {
  font-size: 0.88rem;
  color: #374151;
  line-height: 1.5;
  margin-bottom: 1.2rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.gate-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.gate-cancel {
  padding: 0.4rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
}
.gate-cancel:hover { background: #f3f4f6; }
.gate-approve {
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 6px;
  background: #6366f1;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.gate-approve:hover { background: #4f46e5; }
.stop-btn {
  padding: 0.35rem 1rem;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}
.stop-btn:hover { background: #dc2626; }
.segment-list {
  padding: 0.6rem;
}
.segment-item {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.4rem;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
  margin-bottom: 0.4rem;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.segment-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.seg-handle {
  cursor: grab;
  color: #d1d5db;
  font-size: 0.85rem;
  padding: 0.2rem 0.1rem;
  user-select: none;
  flex-shrink: 0;
  line-height: 1.6;
}
.seg-handle:active { cursor: grabbing; }
.segment-text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #1f2937;
  flex: 1;
}
</style>
