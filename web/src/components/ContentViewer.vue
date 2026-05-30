<script setup lang="ts">
defineProps<{
  content: {
    type: "text" | "timeline" | "relations" | "form";
    data: unknown;
  } | null;
}>();
</script>

<template>
  <div class="content-viewer">
    <div v-if="!content" class="placeholder">暂无内容</div>
    <div v-else-if="content.type === 'text'" class="text-content">
      {{ content.data as string }}
    </div>
    <div v-else-if="content.type === 'timeline'" class="timeline-content">
      <ul>
        <li v-for="(item, index) in (content.data as Array<{ time: string; description: string }>)" :key="index">
          <span class="time">{{ item.time }}</span>
          <span class="description">{{ item.description }}</span>
        </li>
      </ul>
    </div>
    <div v-else-if="content.type === 'relations'" class="relations-content">
      <ul>
        <li v-for="(item, index) in (content.data as Array<{ source: string; target: string; type: string }>)" :key="index">
          {{ item.source }} → {{ item.target }} ({{ item.type }})
        </li>
      </ul>
    </div>
    <div v-else-if="content.type === 'form'" class="form-content">
      <dl>
        <template v-for="(value, key) in (content.data as Record<string, string>)" :key="key">
          <dt>{{ key }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.content-viewer {
  padding: 8px;
}
.placeholder {
  color: #999;
  font-style: italic;
}
.timeline-content ul,
.relations-content ul {
  list-style: none;
  padding: 0;
}
.timeline-content li {
  margin: 4px 0;
}
.time {
  font-weight: bold;
  margin-right: 8px;
}
dl {
  margin: 0;
}
dt {
  font-weight: bold;
  float: left;
  clear: left;
  margin-right: 8px;
}
dd {
  margin: 0;
}
</style>
