import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atomicWriteSync } from "./core/atomic-write.js";

export type ReasoningEffort = "low" | "medium" | "high" | "max";

interface RateLimitConfig {
  rpm?: number;
}

export interface StoryForgeConfig {
  apiKey?: string;
  baseUrl?: string;
  rateLimit?: RateLimitConfig;
}

interface ResolvedEndpoint {
  baseUrl: string | undefined;
  apiKey: string | undefined;
}

export function defaultConfigPath(): string {
  return join(homedir(), ".storyforge", "config.json");
}

export function readConfig(path: string = defaultConfigPath()): StoryForgeConfig {
  try {
    const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as StoryForgeConfig;
    }
  } catch {
    /* missing or malformed → empty config */
  }
  return {};
}

export function writeConfig(cfg: StoryForgeConfig, path: string = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  atomicWriteSync(path, JSON.stringify(cfg, null, 2), tmp);
}

export function resolveBaseUrlEnv(): string | undefined {
  return process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_BASE_URL || undefined;
}

export function loadEndpoint(path: string = defaultConfigPath()): ResolvedEndpoint {
  const envBaseUrl = resolveBaseUrlEnv();
  if (envBaseUrl) {
    return { baseUrl: envBaseUrl, apiKey: process.env.DEEPSEEK_API_KEY };
  }
  const cfg = readConfig(path);
  if (cfg.baseUrl) {
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
  }
  return { baseUrl: undefined, apiKey: process.env.DEEPSEEK_API_KEY ?? cfg.apiKey };
}

export function loadApiKey(path: string = defaultConfigPath()): string | undefined {
  return loadEndpoint(path).apiKey;
}

export function loadBaseUrl(path: string = defaultConfigPath()): string | undefined {
  return loadEndpoint(path).baseUrl;
}

export function loadRateLimit(path: string = defaultConfigPath()): RateLimitConfig | undefined {
  const rpm = readConfig(path).rateLimit?.rpm;
  if (typeof rpm !== "number" || !Number.isInteger(rpm) || rpm <= 0) return undefined;
  return { rpm };
}

export function saveApiKey(key: string, path: string = defaultConfigPath()): void {
  const cfg = readConfig(path);
  cfg.apiKey = key.trim();
  writeConfig(cfg, path);
  if (key.trim()) process.env.DEEPSEEK_API_KEY = key.trim();
}

export function saveBaseUrl(url: string, path: string = defaultConfigPath()): void {
  const cfg = readConfig(path);
  const trimmed = url.trim();
  cfg.baseUrl = trimmed || undefined;
  writeConfig(cfg, path);
}

export function isPlausibleKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length < 16) return false;
  return !/\s/.test(trimmed);
}

export function redactKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "****";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
