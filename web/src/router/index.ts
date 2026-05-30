import { createRouter, createWebHistory } from "vue-router";
import ProjectList from "@/views/ProjectList.vue";
import ProjectWorkbench from "@/views/ProjectWorkbench.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: ProjectList },
    { path: "/project/:id", component: ProjectWorkbench, props: true },
  ],
});
