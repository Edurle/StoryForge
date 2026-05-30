<script setup lang="ts">
import { ref } from "vue";

export interface TreeNode {
  id: string;
  label: string;
  icon?: string;
  children?: TreeNode[];
  status?: "normal" | "modified" | "new" | "conflict";
}

defineProps<{
  nodes: TreeNode[];
}>();

const emit = defineEmits<{
  select: [nodeId: string];
}>();

const expanded = ref<Set<string>>(new Set());

const statusIndicator: Record<string, string> = {
  modified: "*",
  new: "+",
  conflict: "!",
};

function toggle(nodeId: string) {
  if (expanded.value.has(nodeId)) {
    expanded.value.delete(nodeId);
  } else {
    expanded.value.add(nodeId);
  }
}

function onSelect(nodeId: string) {
  emit("select", nodeId);
}
</script>

<template>
  <ul class="file-tree">
    <li v-for="node in nodes" :key="node.id" class="tree-node">
      <span class="node-row">
        <span
          v-if="node.children && node.children.length > 0"
          class="toggle"
          @click.stop="toggle(node.id)"
        >{{ expanded.has(node.id) ? '▼' : '▶' }}</span>
        <span v-else class="toggle-spacer"></span>
        <span class="node-label" @click="onSelect(node.id)">
          {{ node.label }}<span v-if="node.status && node.status !== 'normal'" class="status">{{ statusIndicator[node.status] }}</span>
        </span>
      </span>
      <FileTree
        v-if="node.children && node.children.length > 0 && expanded.has(node.id)"
        :nodes="node.children"
        @select="onSelect"
      />
    </li>
  </ul>
</template>

<style scoped>
.file-tree {
  list-style: none;
  padding-left: 1em;
  margin: 0;
}
.tree-node {
  margin: 2px 0;
}
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toggle {
  cursor: pointer;
  user-select: none;
  width: 1.2em;
  text-align: center;
}
.toggle-spacer {
  display: inline-block;
  width: 1.2em;
}
.node-label {
  cursor: pointer;
}
.node-label:hover {
  text-decoration: underline;
}
.status {
  color: #e67e22;
}
</style>
