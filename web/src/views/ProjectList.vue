<template>
  <div class="project-list">
    <h1>书灵 StoryForge</h1>
    <div class="actions">
      <input v-model="newName" placeholder="项目名称" @keyup.enter="create" />
      <button @click="create">创建项目</button>
    </div>
    <ul>
      <li v-for="p in store.projects" :key="p.id">
        <router-link :to="`/project/${p.id}`">{{ p.name }}</router-link>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useProjectStore } from "@/stores/project.js";

const store = useProjectStore();
const newName = ref("");

onMounted(() => {
  store.fetchProjects();
});

async function create() {
  if (!newName.value.trim()) return;
  await store.createProject(newName.value.trim());
  newName.value = "";
}
</script>

<style scoped>
.project-list {
  max-width: 600px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
}
input {
  flex: 1;
  padding: 0.5rem;
}
button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
ul {
  list-style: none;
  padding: 0;
}
li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}
a {
  text-decoration: none;
  color: #333;
}
a:hover {
  color: #0066cc;
}
</style>
