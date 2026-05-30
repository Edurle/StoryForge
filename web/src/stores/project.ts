import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api/client.js";

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Array<{ id: string; name: string; createdAt: string }>>([]);
  const currentId = ref<string | null>(null);

  async function fetchProjects() {
    projects.value = await api.getProjects();
  }

  async function createProject(name: string) {
    const project = await api.createProject(name);
    projects.value.push(project);
    return project;
  }

  function setCurrent(id: string) {
    currentId.value = id;
  }

  return { projects, currentId, fetchProjects, createProject, setCurrent };
});
