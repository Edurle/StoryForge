<script setup lang="ts">
import { ref } from "vue";

interface ConfirmProps {
  level: "B" | "C";
  summary: string;
  details?: string;
}

const props = defineProps<ConfirmProps>();

const emit = defineEmits<{
  approve: [];
  reject: [];
  cancel: [];
  revise: [];
}>();

const showDetails = ref(false);

const levelLabels: Record<string, string> = {
  B: "通知",
  C: "阻断",
};

function toggleDetails() {
  showDetails.value = !showDetails.value;
}
</script>

<template>
  <div class="confirm-card">
    <div class="confirm-card__header">
      <span :class="['confirm-card__badge', `confirm-card__badge--${level}`]">
        {{ levelLabels[level] }}
      </span>
      <span class="confirm-card__summary">{{ summary }}</span>
    </div>
    <div v-if="details" class="confirm-card__details-toggle" @click="toggleDetails">
      {{ showDetails ? "收起详情" : "查看详情" }}
    </div>
    <div v-if="details && showDetails" class="confirm-card__details">
      {{ details }}
    </div>
    <div class="confirm-card__actions">
      <template v-if="level === 'B'">
        <button class="btn btn--approve" @click="emit('approve')">批准</button>
        <button class="btn btn--cancel" @click="emit('cancel')">取消</button>
      </template>
      <template v-else>
        <button class="btn btn--approve" @click="emit('approve')">继续</button>
        <button class="btn btn--revise" @click="emit('revise')">修改</button>
        <button class="btn btn--reject" @click="emit('reject')">停止</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.confirm-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
}

.confirm-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.confirm-card__badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
}

.confirm-card__badge--B {
  background-color: #3b82f6;
}

.confirm-card__badge--C {
  background-color: #ef4444;
}

.confirm-card__summary {
  font-weight: 500;
}

.confirm-card__details-toggle {
  color: #6b7280;
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 4px;
}

.confirm-card__details {
  background-color: #f9fafb;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  white-space: pre-wrap;
  font-size: 13px;
}

.confirm-card__actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  cursor: pointer;
}

.btn--approve {
  background-color: #22c55e;
  color: #fff;
  border-color: #22c55e;
}

.btn--cancel {
  background-color: #9ca3af;
  color: #fff;
  border-color: #9ca3af;
}

.btn--revise {
  background-color: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
}

.btn--reject {
  background-color: #ef4444;
  color: #fff;
  border-color: #ef4444;
}
</style>
