<script setup lang="ts">
export interface TimelineEvent {
  id: string;
  time: string;
  description: string;
  characters: string[];
}

import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    events: TimelineEvent[];
    width?: number;
  }>(),
  { width: 800 }
);

const emit = defineEmits<{
  select: [eventId: string];
}>();

const padding = 60;
const axisY = 180;
const dotR = 8;

const viewBox = computed(() => {
  return `0 0 ${props.width! + padding * 2} 250`;
});

const totalWidth = computed(() => props.width! + padding * 2);

function xPos(index: number) {
  if (props.events.length === 1) return totalWidth.value / 2;
  return padding + (props.width! * index) / (props.events.length - 1);
}

function onSelect(eventId: string) {
  emit("select", eventId);
}
</script>

<template>
  <svg :viewBox="viewBox" class="timeline-vis" role="img">
    <line
      :x1="padding"
      :x2="padding + width!"
      :y1="axisY"
      :y2="axisY"
      stroke="#ccc"
      stroke-width="2"
    />
    <g v-for="(event, i) in events" :key="event.id">
      <circle
        :cx="xPos(i)"
        :cy="axisY"
        :r="dotR"
        fill="#409eff"
        class="event-dot"
        @click="onSelect(event.id)"
      />
      <text
        :x="xPos(i)"
        :y="axisY + 24"
        text-anchor="middle"
        font-size="11"
        fill="#666"
      >
        {{ event.time }}
      </text>
      <text
        :x="xPos(i)"
        :y="axisY - 20"
        text-anchor="middle"
        font-size="13"
        fill="#333"
      >
        {{ event.description }}
      </text>
      <text
        :x="xPos(i)"
        :y="axisY - 38"
        text-anchor="middle"
        font-size="10"
        fill="#999"
      >
        {{ event.characters.join(", ") }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.timeline-vis {
  width: 100%;
  max-width: 800px;
}
.event-dot {
  cursor: pointer;
}
.event-dot:hover {
  fill: #66b1ff;
}
</style>
