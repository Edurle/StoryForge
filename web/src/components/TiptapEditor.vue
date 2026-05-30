<script setup lang="ts">
export interface EditorSegment {
  id: string;
  content: string;
  order: number;
}

const props = withDefaults(
  defineProps<{
    segments: EditorSegment[];
    readonly?: boolean;
  }>(),
  { readonly: false }
);

const emit = defineEmits<{
  update: [segmentId: string, content: string];
  save: [];
}>();

const sorted = () => [...props.segments].sort((a, b) => a.order - b.order);

function onInput(segmentId: string, event: Event) {
  const target = event.target as HTMLTextAreaElement;
  emit("update", segmentId, target.value);
}

function onKeyDown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    emit("save");
  }
}
</script>

<template>
  <div class="tiptap-editor" @keydown="onKeyDown">
    <div
      v-for="(segment, index) in sorted()"
      :key="segment.id"
      class="segment"
    >
      <span class="segment-order">{{ segment.order }}</span>
      <textarea
        v-if="!readonly"
        class="segment-textarea"
        :value="segment.content"
        @input="onInput(segment.id, $event)"
      />
      <div v-else class="segment-readonly">{{ segment.content }}</div>
      <div v-if="index < sorted().length - 1" class="segment-divider" />
    </div>
  </div>
</template>

<style scoped>
.tiptap-editor {
  font-family: sans-serif;
}
.segment {
  position: relative;
  margin-bottom: 8px;
}
.segment-order {
  font-size: 0.75em;
  color: #999;
  margin-bottom: 4px;
  display: block;
}
.segment-textarea {
  width: 100%;
  min-height: 120px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  box-sizing: border-box;
}
.segment-textarea:focus {
  outline: 2px solid #409eff;
  border-color: #409eff;
}
.segment-readonly {
  padding: 8px;
  white-space: pre-wrap;
  min-height: 60px;
}
.segment-divider {
  border-top: 1px solid #eee;
  margin: 12px 0;
}
</style>
