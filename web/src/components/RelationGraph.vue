<script setup lang="ts">
export interface GraphNode {
  id: string;
  label: string;
  group?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    width?: number;
    height?: number;
  }>(),
  { width: 600, height: 400 }
);

const emit = defineEmits<{
  select: [nodeId: string];
}>();

const layout = computed(() => {
  const cx = props.width! / 2;
  const cy = props.height! / 2;
  const radius = Math.min(props.width!, props.height!) * 0.35;
  const positions = new Map<string, { x: number; y: number }>();
  props.nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / props.nodes.length - Math.PI / 2;
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });
  return positions;
});

function edgeLabel(edge: GraphEdge) {
  const src = layout.value.get(edge.source);
  const tgt = layout.value.get(edge.target);
  if (!src || !tgt) return { x: 0, y: 0 };
  return { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
}

function onSelect(nodeId: string) {
  emit("select", nodeId);
}
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="relation-graph"
    role="img"
  >
    <line
      v-for="edge in edges"
      :key="`${edge.source}-${edge.target}`"
      :x1="layout.get(edge.source)?.x ?? 0"
      :y1="layout.get(edge.source)?.y ?? 0"
      :x2="layout.get(edge.target)?.x ?? 0"
      :y2="layout.get(edge.target)?.y ?? 0"
      stroke="#bbb"
      stroke-width="1.5"
    />
    <text
      v-for="edge in edges"
      :key="`label-${edge.source}-${edge.target}`"
      :x="edgeLabel(edge).x"
      :y="edgeLabel(edge).y"
      text-anchor="middle"
      font-size="10"
      fill="#888"
      class="edge-label"
    >
      {{ edge.type }}
    </text>
    <g v-for="node in nodes" :key="node.id">
      <circle
        :cx="layout.get(node.id)?.x ?? 0"
        :cy="layout.get(node.id)?.y ?? 0"
        r="20"
        fill="#409eff"
        class="node-circle"
        @click="onSelect(node.id)"
      />
      <text
        :x="layout.get(node.id)?.x ?? 0"
        :y="(layout.get(node.id)?.y ?? 0) + 5"
        text-anchor="middle"
        font-size="12"
        fill="#fff"
        pointer-events="none"
      >
        {{ node.label }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.relation-graph {
  border: 1px solid #eee;
  border-radius: 4px;
}
.node-circle {
  cursor: pointer;
}
.node-circle:hover {
  fill: #66b1ff;
}
.edge-label {
  pointer-events: none;
}
</style>
