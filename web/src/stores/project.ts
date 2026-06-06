import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../api/client.js";

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Array<{ id: string; name: string; targetWords: number; createdAt: string }>>([]);
  const currentId = ref<string | null>(null);

  const currentName = computed(() => {
    if (!currentId.value) return "";
    return projects.value.find(p => p.id === currentId.value)?.name ?? "";
  });

  async function fetchProjects() {
    projects.value = await api.getProjects();
  }

  async function createProject(name: string, targetWords?: number) {
    const project = await api.createProject(name, targetWords);
    projects.value.push(project);
    return project;
  }

  function setCurrent(id: string) {
    currentId.value = id;
  }

  return { projects, currentId, currentName, fetchProjects, createProject, setCurrent };
});
