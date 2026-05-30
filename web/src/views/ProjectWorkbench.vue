<template>
  <div class="workbench">
    <header>
      <router-link to="/">← 返回</router-link>
      <span class="usage-stats" v-if="usage.totalCalls > 0">
        📊 {{ usage.totalCalls }}次调用 · {{ usage.totalPromptTokens + usage.totalCompletionTokens }} tokens
      </span>
      <button @click="layout.toggleLeft()">{{ layout.leftCollapsed ? "▶" : "◀" }} 知识库</button>
      <button @click="layout.toggleRight()">{{ layout.rightCollapsed ? "◀" : "▶" }} 编辑器</button>
    </header>
    <div class="panels">
      <aside v-show="!layout.leftCollapsed" class="panel left" :style="{ width: layout.leftWidth + 'px' }">
        <h3>知识库</h3>
        <div class="system-prompt-section">
          <button class="toggle-btn" @click="showSystemPrompt = !showSystemPrompt">
            {{ showSystemPrompt ? '▼' : '▶' }} 系统提示词
          </button>
          <pre v-if="showSystemPrompt" class="system-prompt-content">{{ systemPrompt }}</pre>
        </div>
      </aside>
      <main class="panel center">
        <div class="messages" ref="messagesContainer">
          <template v-for="(msg, i) in messages" :key="i">
            <div v-if="msg.role === 'user'" class="msg-row user-row">
              <div class="bubble user-bubble">
                <div class="bubble-content">{{ msg.content }}</div>
              </div>
              <div class="avatar user-avatar">U</div>
            </div>
            <div v-else-if="msg.role === 'assistant'" class="msg-row assistant-row">
              <div class="avatar assistant-avatar">A</div>
              <div class="bubble assistant-bubble">
                <details v-if="msg.reasoningContent" class="reasoning-details">
                  <summary>💭 思考过程</summary>
                  <pre class="reasoning-text">{{ msg.reasoningContent }}</pre>
                </details>
                <div class="bubble-content" v-html="renderMarkdown(msg.content)"></div>
                <div v-if="msg.usage" class="bubble-usage">
                  输入 {{ msg.usage.promptTokens }} · 输出 {{ msg.usage.completionTokens }}
                  · 缓存 {{ msg.usage.cacheHitTokens }} · 命中 {{ usagePercent(msg.usage) }}%
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
          <input v-model="input" placeholder="输入创作指令..." @keyup.enter="send" :disabled="sending" />
          <button @click="send" :disabled="sending">发送</button>
        </div>
      </main>
      <aside v-show="!layout.rightCollapsed" class="panel right" :style="{ width: layout.rightWidth + 'px' }">
        <h3>编辑器</h3>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { useLayoutStore } from "@/stores/layout.js";
import { useProjectStore } from "@/stores/project.js";
import { api } from "@/api/client.js";
import { marked } from "marked";

interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

interface DisplayMessage {
  role: string;
  content: string;
  reasoningContent?: string;
  usage?: UsageInfo;
}

const props = defineProps<{ id: string }>();
const layout = useLayoutStore();
const projectStore = useProjectStore();
const input = ref("");
const sending = ref(false);
const messages = ref<DisplayMessage[]>([]);
const systemPrompt = ref("");
const showSystemPrompt = ref(false);
const usage = ref({ totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCacheHitTokens: 0 });
const messagesContainer = ref<HTMLElement | null>(null);
const currentModel = ref("deepseek-v4-flash");
const currentThinking = ref("enabled");
const currentEffort = ref("high");
let lastUsage: UsageInfo | undefined;

function usagePercent(u: UsageInfo): string {
  const total = u.cacheHitTokens + u.cacheMissTokens;
  if (total === 0) return "0";
  return ((u.cacheHitTokens / total) * 100).toFixed(1);
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
    usage.value = await api.getUsage(props.id);
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
          try {
            const parsed = JSON.parse(m.content);
            display.content = parsed.name ? `${parsed.name}: ${parsed.result ?? parsed.content}` : m.content;
          } catch {
            display.content = m.content;
          }
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
    scrollToBottom();
  } catch {}
}

onMounted(() => {
  layout.loadFromStorage();
  projectStore.setCurrent(props.id);
  loadSystemPrompt();
  loadUsage();
  loadHistory();
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

  api.chat(props.id, text, (event) => {
    if (event.type === "reasoning_delta") {
      const delta = event.data as { content: string };
      if (!pendingMsg) {
        pendingMsg = { role: "assistant", content: "", reasoningContent: "" };
        messages.value.push(pendingMsg);
      }
      if (!pendingMsg.reasoningContent) pendingMsg.reasoningContent = "";
      pendingMsg.reasoningContent += delta.content;
      scrollToBottom();
    } else if (event.type === "content_delta") {
      const delta = event.data as { content: string };
      if (!pendingMsg) {
        pendingMsg = { role: "assistant", content: "" };
        messages.value.push(pendingMsg);
      }
      pendingMsg.content += delta.content;
      scrollToBottom();
    } else if (event.type === "usage") {
      lastUsage = event.data as UsageInfo;
    } else if (event.type === "assistant") {
      const data = event.data as { content: string; reasoningContent?: string };
      if (pendingMsg) {
        pendingMsg.content = data.content;
        if (data.reasoningContent) pendingMsg.reasoningContent = data.reasoningContent;
        pendingMsg.usage = lastUsage;
        pendingMsg = undefined;
      } else {
        messages.value.push({ role: "assistant", content: data.content, reasoningContent: data.reasoningContent, usage: lastUsage });
      }
      lastUsage = undefined;
      scrollToBottom();
    } else if (event.type === "tool_result") {
      pendingMsg = undefined;
      const data = event.data as { name: string; result: string };
      messages.value.push({ role: "tool", content: `${data.name}: ${data.result}` });
      scrollToBottom();
    } else if (event.type === "done") {
      pendingMsg = undefined;
      sending.value = false;
      loadUsage();
    } else if (event.type === "error") {
      pendingMsg = undefined;
      const data = event.data as { error: string };
      messages.value.push({ role: "error", content: data.error });
      sending.value = false;
      scrollToBottom();
    }
  }, {
    model: currentModel.value,
    thinking: currentThinking.value,
    reasoning_effort: currentEffort.value,
  });
}
</script>

<style scoped>
.workbench {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.2rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
header a {
  color: #6366f1;
  text-decoration: none;
  font-weight: 500;
}
header a:hover { text-decoration: underline; }
.usage-stats {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-left: auto;
}
header button {
  padding: 0.35rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  color: #6b7280;
  transition: all 0.15s;
}
header button:hover { background: #f3f4f6; color: #374151; }

.panels {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.panel { overflow-y: auto; }
.left, .right {
  background: #f8f9fa;
  border-right: 1px solid #e5e7eb;
  padding: 1rem;
}
.right {
  border-right: none;
  border-left: 1px solid #e5e7eb;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  scroll-behavior: smooth;
}
.msg-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 0.6rem;
}
.user-row { justify-content: flex-end; }
.assistant-row { justify-content: flex-start; }
.tool-row { justify-content: flex-start; padding-left: 0.5rem; }
.error-row { justify-content: center; }

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
  color: #fff;
}
.user-avatar { background: #6366f1; }
.assistant-avatar { background: #10b981; }

.bubble {
  max-width: 72%;
  border-radius: 16px;
  padding: 0.7rem 1rem;
  line-height: 1.6;
  word-break: break-word;
}
.user-bubble {
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 1px 4px rgba(99,102,241,0.25);
}
.user-bubble .bubble-content { color: #fff; }

.assistant-bubble {
  background: #fff;
  color: #1f2937;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.assistant-bubble :deep(h1), .assistant-bubble :deep(h2), .assistant-bubble :deep(h3) {
  margin: 0.6em 0 0.3em;
  font-weight: 600;
}
.assistant-bubble :deep(h1) { font-size: 1.3em; }
.assistant-bubble :deep(h2) { font-size: 1.15em; }
.assistant-bubble :deep(h3) { font-size: 1.05em; }
.assistant-bubble :deep(p) { margin: 0.4em 0; }
.assistant-bubble :deep(pre) {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 0.8em;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.85em;
  margin: 0.5em 0;
}
.assistant-bubble :deep(code) {
  background: #f3f4f6;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.88em;
  color: #e11d48;
}
.assistant-bubble :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}
.assistant-bubble :deep(ul), .assistant-bubble :deep(ol) {
  padding-left: 1.5em;
  margin: 0.3em 0;
}
.assistant-bubble :deep(blockquote) {
  border-left: 3px solid #6366f1;
  padding-left: 0.8em;
  margin: 0.5em 0;
  color: #6b7280;
}
.assistant-bubble :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
}
.assistant-bubble :deep(th), .assistant-bubble :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 0.35em 0.7em;
  font-size: 0.92em;
}
.assistant-bubble :deep(th) {
  background: #f3f4f6;
  font-weight: 600;
}
.assistant-bubble :deep(strong) { color: #111; }
.assistant-bubble :deep(a) { color: #6366f1; }
.assistant-bubble :deep(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 0.8em 0; }

.bubble-usage {
  font-size: 0.7rem;
  color: #9ca3af;
  margin-top: 0.4rem;
  padding-top: 0.3rem;
  border-top: 1px solid #f3f4f6;
}

.tool-badge {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  font-weight: 600;
  flex-shrink: 0;
}
.tool-content {
  font-size: 0.82rem;
  color: #78716c;
  background: #fffbeb;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  max-width: 80%;
  word-break: break-word;
}

.error-bubble {
  background: #fef2f2;
  color: #dc2626;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid #fecaca;
  font-size: 0.9rem;
}

.reasoning-details {
  margin-bottom: 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.reasoning-details summary {
  font-size: 0.8rem;
  color: #6b7280;
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  background: #f9fafb;
  user-select: none;
}
.reasoning-details summary:hover { background: #f3f4f6; }
.reasoning-text {
  margin: 0;
  padding: 0.6rem;
  background: #f9fafb;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 280px;
  overflow-y: auto;
  color: #6b7280;
  border-top: 1px solid #e5e7eb;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 0.3rem 0;
}
.typing-indicator span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d1d5db;
  animation: typing 1.2s infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-4px); }
}

.input-area {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1.5rem;
  background: #fff;
  border-top: 1px solid #e5e7eb;
}
.input-area input {
  flex: 1;
  padding: 0.6rem 1rem;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}
.input-area input:focus { border-color: #6366f1; }
.input-area button {
  padding: 0.6rem 1.2rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.input-area button:hover { background: #4f46e5; }
.input-area button:disabled { background: #c7d2fe; cursor: not-allowed; }
.chat-select {
  font-size: 0.8rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  cursor: pointer;
  outline: none;
  color: #374151;
}
.chat-select:focus { border-color: #6366f1; }

.system-prompt-section { margin-top: 1rem; }
.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #6b7280;
}
.toggle-btn:hover { color: #374151; }
.system-prompt-content {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 400px;
  overflow-y: auto;
}
</style>
