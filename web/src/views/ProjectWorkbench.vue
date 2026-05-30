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
            <div :class="['msg', msg.role]">
              <span v-if="msg.role === 'assistant'">{{ msg.content }}</span>
              <span v-else-if="msg.role === 'tool'">🔧 {{ msg.content }}</span>
              <span v-else>{{ msg.content }}</span>
            </div>
            <div v-if="msg.usage" class="msg-usage">
              输入: {{ msg.usage.promptTokens }} · 输出: {{ msg.usage.completionTokens }}
              · 缓存命中: {{ msg.usage.cacheHitTokens }} · 未命中: {{ msg.usage.cacheMissTokens }}
              · 命中率: {{ usagePercent(msg.usage) }}%
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

interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

interface DisplayMessage {
  role: string;
  content: string;
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

  api.chat(props.id, text, (event) => {
    if (event.type === "usage") {
      lastUsage = event.data as UsageInfo;
    } else if (event.type === "assistant") {
      const data = event.data as { content: string };
      messages.value.push({ role: "assistant", content: data.content, usage: lastUsage });
      lastUsage = undefined;
      scrollToBottom();
    } else if (event.type === "tool_result") {
      const data = event.data as { name: string; result: string };
      messages.value.push({ role: "tool", content: `${data.name}: ${data.result}` });
      scrollToBottom();
    } else if (event.type === "done") {
      sending.value = false;
      loadUsage();
    } else if (event.type === "error") {
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
}
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #ddd;
}
.panels {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.panel {
  overflow-y: auto;
}
.left,
.right {
  background: #f8f8f8;
  border-right: 1px solid #ddd;
  padding: 1rem;
}
.right {
  border-right: none;
  border-left: 1px solid #ddd;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
.msg {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 4px;
}
.msg.user {
  background: #e3f2fd;
}
.msg.assistant {
  background: #f5f5f5;
}
.msg.tool {
  background: #fff3e0;
  font-size: 0.85em;
}
.msg.error {
  background: #ffebee;
  color: red;
}
.msg-usage {
  font-size: 0.75rem;
  color: #888;
  padding: 0 0.5rem 0.25rem 0.5rem;
  border-bottom: 1px solid #eee;
  margin-bottom: 0.25rem;
}
.input-area {
  display: flex;
  padding: 0.5rem;
  border-top: 1px solid #ddd;
}
.input-area input {
  flex: 1;
  padding: 0.5rem;
}
.input-area button {
  padding: 0.5rem 1rem;
  margin-left: 0.5rem;
  cursor: pointer;
}
.usage-stats {
  font-size: 0.8rem;
  color: #888;
}
.chat-select {
  font-size: 0.8rem;
  padding: 0.3rem;
  border: 1px solid #ddd;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}
.system-prompt-section {
  margin-top: 1rem;
}
.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
}
.system-prompt-content {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 400px;
  overflow-y: auto;
}
</style>
