<template>
  <div class="home">
    <header class="home-header">
      <h1 class="brand">书灵 <span class="brand-sub">StoryForge</span></h1>
      <p class="tagline">AI 驱动的长篇网文创作引擎</p>
    </header>
    <div class="home-body">
      <div class="create-bar">
        <input v-model="newName" class="create-input" placeholder="输入新项目名称…" @keyup.enter="create" />
        <input v-model.number="newTargetWords" class="create-input create-input-sm" type="number" placeholder="目标字数(万)" min="1" />
        <button class="create-btn" @click="create" :disabled="!newName.trim()">创建项目</button>
      </div>
      <div v-if="store.projects.length > 0" class="project-grid">
        <div v-for="p in store.projects" :key="p.id" class="project-card" @click="go(p.id)">
          <button class="card-delete" @click.stop="confirmDelete(p.id, p.name)" title="删除项目">×</button>
          <div class="card-name">{{ p.name }}</div>
          <div class="card-progress-row">
            <span class="card-meta">{{ formatWords(p.wordCount ?? 0) }} / {{ formatTarget(p.targetWords) }}</span>
            <span class="card-percent">{{ ((p.wordCount ?? 0) / p.targetWords * 100).toFixed(1) }}%</span>
          </div>
          <div class="card-progress-bar">
            <div class="card-progress-fill" :style="{ width: Math.min((p.wordCount ?? 0) / p.targetWords * 100, 100) + '%' }"></div>
          </div>
          <div class="card-meta">{{ formatDate(p.createdAt) }}</div>
        </div>
      </div>
      <div v-else class="empty-state">
        <div class="empty-icon">📝</div>
        <p class="empty-text">还没有项目</p>
        <p class="empty-hint">在上方输入项目名称，开始你的第一部作品</p>
      </div>
    </div>
    <div v-if="deleteTarget" class="delete-overlay" @click.self="deleteTarget = null">
      <div class="delete-dialog">
        <div class="delete-title">确认删除</div>
        <div class="delete-body">确定要删除项目「{{ deleteTarget.name }}」吗？此操作不可撤销。</div>
        <div class="delete-actions">
          <button class="delete-cancel" @click="deleteTarget = null">取消</button>
          <button class="delete-confirm" @click="doDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "@/stores/project.js";
import { api } from "@/api/client.js";

const store = useProjectStore();
const router = useRouter();
const newName = ref("");
const newTargetWords = ref(1000);
const deleteTarget = ref<{ id: string; name: string } | null>(null);

onMounted(() => {
  store.fetchProjects();
});

async function create() {
  if (!newName.value.trim()) return;
  await store.createProject(newName.value.trim(), (newTargetWords.value || 1000) * 10000);
  newName.value = "";
}

function go(id: string) {
  router.push(`/project/${id}`);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function formatWords(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

function formatTarget(n: number): string {
  return (n / 10000).toFixed(0) + "万";
}

function confirmDelete(id: string, name: string) {
  deleteTarget.value = { id, name };
}

async function doDelete() {
  if (!deleteTarget.value) return;
  const { id } = deleteTarget.value;
  deleteTarget.value = null;
  await api.deleteProject(id);
  await store.fetchProjects();
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: linear-gradient(135deg, #f0f2f5 0%, #e8eaef 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.home-header {
  text-align: center;
  padding: 3.5rem 1rem 1.5rem;
}
.brand {
  font-size: 2.2rem;
  font-weight: 800;
  color: #111827;
  margin: 0;
  letter-spacing: 0.05em;
}
.brand-sub {
  font-weight: 300;
  color: #6366f1;
}
.tagline {
  margin: 0.5rem 0 0;
  font-size: 0.95rem;
  color: #9ca3af;
}

.home-body {
  width: 100%;
  max-width: 860px;
  padding: 0 1.5rem 3rem;
}

.create-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
}
.create-input {
  flex: 1;
  padding: 0.7rem 1rem;
  font-size: 0.92rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #1f2937;
  transition: border-color 0.2s;
}
.create-input-sm {
  flex: 0 0 130px;
}
.create-input::placeholder { color: #b0b8c4; }
.create-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.create-btn {
  padding: 0.7rem 1.5rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.create-btn:hover { background: #4f46e5; }
.create-btn:disabled { background: #c7d2fe; cursor: not-allowed; }

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
.project-card {
  position: relative;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 1.2rem 1rem;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.project-card:hover {
  border-color: #c7d2fe;
  box-shadow: 0 4px 12px rgba(99,102,241,0.1);
}
.card-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 1.5rem;
}
.card-meta {
  font-size: 0.78rem;
  color: #b0b8c4;
}
.card-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.3rem;
}
.card-percent {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6366f1;
}
.card-progress-bar {
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.4rem;
}
.card-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  border-radius: 2px;
  transition: width 0.4s ease;
}
.card-delete {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: #d1d5db;
  font-size: 1.1rem;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}
.card-delete:hover { color: #ef4444; background: #fef2f2; }

.empty-state {
  text-align: center;
  padding: 4rem 0;
}
.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}
.empty-text {
  font-size: 1.1rem;
  font-weight: 600;
  color: #6b7280;
  margin: 0;
}
.empty-hint {
  font-size: 0.85rem;
  color: #b0b8c4;
  margin: 0.4rem 0 0;
}

.delete-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.delete-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
}
.delete-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.6rem;
}
.delete-body {
  font-size: 0.88rem;
  color: #374151;
  line-height: 1.5;
  margin-bottom: 1.2rem;
}
.delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.delete-cancel {
  padding: 0.4rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
}
.delete-cancel:hover { background: #f3f4f6; }
.delete-confirm {
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 6px;
  background: #ef4444;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.delete-confirm:hover { background: #dc2626; }
</style>
