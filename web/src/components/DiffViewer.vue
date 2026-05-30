<script setup lang="ts">
export interface DiffLine {
  left: string;
  right: string;
  type: "equal" | "added" | "removed" | "changed";
}

defineProps<{
  title: string;
  diffs: DiffLine[];
}>();

const emit = defineEmits<{
  confirm: [];
  reject: [];
}>();
</script>

<template>
  <div class="diff-viewer">
    <div class="header">{{ title }}</div>
    <div class="columns">
      <div class="column">
        <div class="column-header">修改前</div>
        <div
          v-for="(line, index) in diffs"
          :key="index"
          class="diff-line"
          :class="line.type"
        >{{ line.left }}</div>
      </div>
      <div class="column">
        <div class="column-header">修改后</div>
        <div
          v-for="(line, index) in diffs"
          :key="index"
          class="diff-line"
          :class="line.type"
        >{{ line.right }}</div>
      </div>
    </div>
    <div class="actions">
      <button class="confirm-btn" @click="emit('confirm')">确认</button>
      <button class="reject-btn" @click="emit('reject')">拒绝</button>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer {
  border: 1px solid #ddd;
  border-radius: 4px;
}
.header {
  padding: 8px 12px;
  font-weight: bold;
  border-bottom: 1px solid #ddd;
}
.columns {
  display: flex;
}
.column {
  flex: 1;
  min-width: 0;
}
.column:first-child {
  border-right: 1px solid #ddd;
}
.column-header {
  padding: 4px 12px;
  font-weight: bold;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}
.diff-line {
  padding: 2px 12px;
  font-family: monospace;
  white-space: pre-wrap;
}
.diff-line.equal {
  background: white;
}
.diff-line.added {
  background: #d4edda;
}
.diff-line.removed {
  background: #f8d7da;
}
.diff-line.changed {
  background: #fff3cd;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #ddd;
}
.confirm-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
.reject-btn {
  background: #dc3545;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
