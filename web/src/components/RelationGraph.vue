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

import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { Network } from "vis-network/standalone";
import { DataSet } from "vis-data/standalone";

const props = defineProps<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}>();

const emit = defineEmits<{
  select: [nodeId: string];
}>();

const container = ref<HTMLElement | null>(null);
let network: Network | null = null;
let nodeSet: DataSet<Record<string, unknown>> | null = null;
let edgeSet: DataSet<Record<string, unknown>> | null = null;

const GROUP_COLORS: Record<string, string> = {
  character: "#409eff",
  item: "#e6a23c",
  faction: "#f56c6c",
  location: "#67c23a",
  concept: "#9b59b6",
};

function nodeColor(group?: string) {
  const base = GROUP_COLORS[group ?? ""] ?? "#909399";
  return {
    background: base,
    border: base,
    highlight: { background: base, border: base },
    hover: { background: base, border: base },
  };
}

function buildVisNodes(nodes: GraphNode[]) {
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    group: n.group ?? "",
    color: nodeColor(n.group),
    font: { color: "#fff", size: 13, face: "sans-serif" },
    title: `[${n.group ?? "unknown"}] ${n.label}`,
    shape: "dot" as const,
    size: 18,
    borderWidth: 2,
    shadow: { enabled: true, color: "rgba(0,0,0,0.15)", size: 6, x: 2, y: 2 },
  }));
}

function buildVisEdges(edges: GraphEdge[]) {
  return edges.map((e, i) => ({
    id: `edge-${i}`,
    from: e.source,
    to: e.target,
    label: e.type,
    arrows: "to" as const,
    color: { color: "#c0c4cc", highlight: "#409eff", hover: "#909399" },
    font: { size: 10, color: "#909399", strokeWidth: 3, strokeColor: "#fff" },
    smooth: { type: "curvedCW" as const, roundness: 0.15 },
    width: 1.5,
  }));
}

const OPTIONS = {
  physics: {
    enabled: true,
    barnesHut: {
      gravitationalConstant: -3000,
      centralGravity: 0.3,
      springLength: 120,
      springConstant: 0.04,
      damping: 0.09,
    },
    stabilization: { iterations: 150 },
  },
  interaction: {
    hover: true,
    tooltipDelay: 200,
    zoomView: true,
    dragView: true,
    dragNodes: true,
    navigationButtons: false,
  },
  nodes: {
    chosen: true,
  },
  edges: {
    chosen: true,
  },
};

function initNetwork() {
  if (!container.value) return;
  nodeSet = new DataSet(buildVisNodes(props.nodes) as unknown as Record<string, unknown>[]);
  edgeSet = new DataSet(buildVisEdges(props.edges) as unknown as Record<string, unknown>[]);
  network = new Network(container.value, { nodes: nodeSet, edges: edgeSet }, OPTIONS);
  network.on("click", (params) => {
    if (params.nodes && params.nodes.length > 0) {
      emit("select", params.nodes[0] as string);
    }
  });
}

function updateData() {
  if (!nodeSet || !edgeSet) return;
  nodeSet.clear();
  edgeSet.clear();
  nodeSet.add(buildVisNodes(props.nodes) as unknown as Record<string, unknown>[]);
  edgeSet.add(buildVisEdges(props.edges) as unknown as Record<string, unknown>[]);
}

watch(() => [props.nodes, props.edges], updateData, { deep: true });

onMounted(() => {
  initNetwork();
});

onBeforeUnmount(() => {
  if (network) {
    network.destroy();
    network = null;
  }
  nodeSet = null;
  edgeSet = null;
});
</script>

<template>
  <div
    ref="container"
    class="relation-graph"
    role="img"
  />
</template>

<style scoped>
.relation-graph {
  width: 100%;
  height: 100%;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafafa;
}
</style>
