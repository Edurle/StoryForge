<script setup lang="ts">
import { ref, watch, nextTick } from "vue";

interface ChatMessage {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
}

const props = defineProps<{
  messages: ChatMessage[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const inputText = ref("");
const messageContainer = ref<HTMLElement | null>(null);

const roleLabels: Record<string, string> = {
  user: "用户",
  assistant: "助手",
  tool: "工具",
  error: "错误",
};

function handleSend() {
  const text = inputText.value.trim();
  if (!text || props.disabled) return;
  emit("send", text);
  inputText.value = "";
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSend();
  }
}

watch(
  () => props.messages,
  () => {
    void nextTick(() => {
      if (messageContainer.value) {
        messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
      }
    });
  },
);
</script>

<template>
  <div class="dialog-panel">
    <div ref="messageContainer" class="message-list">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', `message--${msg.role}`]"
      >
        <span class="message__role">{{ roleLabels[msg.role] }}</span>
        <span class="message__content">{{ msg.content }}</span>
      </div>
    </div>
    <div class="input-bar">
      <input
        v-model="inputText"
        class="input-bar__field"
        :disabled="disabled"
        @keydown="handleKeydown"
      />
      <button
        class="input-bar__btn"
        :disabled="disabled"
        @click="handleSend"
      >
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.dialog-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.message {
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 4px;
}

.message--user {
  background-color: #dbeafe;
}

.message--assistant {
  background-color: #f3f4f6;
}

.message--tool {
  background-color: #fed7aa;
}

.message--error {
  background-color: #fecaca;
}

.message__role {
  font-weight: 600;
  margin-right: 6px;
}

.message__content {
  white-space: pre-wrap;
}

.input-bar {
  display: flex;
  padding: 8px;
  border-top: 1px solid #e5e7eb;
  gap: 8px;
}

.input-bar__field {
  flex: 1;
  padding: 4px 8px;
}

.input-bar__btn {
  padding: 4px 12px;
}
</style>
