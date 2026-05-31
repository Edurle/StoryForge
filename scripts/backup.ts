import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../data");
const backupRoot = join(dataDir, "backups");

const ts = new Date().toISOString().replace(/[T:]/g, "-").slice(0, 19);
const backupDir = join(backupRoot, ts);
mkdirSync(backupDir, { recursive: true });

const dbFiles = readdirSync(dataDir).filter(f => f.endsWith(".db"));
if (dbFiles.length === 0) {
  console.log("No .db files found in data/");
  process.exit(0);
}

let totalSize = 0;
for (const f of dbFiles) {
  const src = join(dataDir, f);
  cpSync(src, join(backupDir, f));
  totalSize += statSync(src).size;
  console.log(`  ${f}`);
}

const dirs = readdirSync(backupRoot)
  .filter(d => {
    try { return statSync(join(backupRoot, d)).isDirectory(); } catch { return false; }
  })
  .sort();

const MAX_BACKUPS = 10;
if (dirs.length > MAX_BACKUPS) {
  const toRemove = dirs.slice(0, dirs.length - MAX_BACKUPS);
  for (const d of toRemove) {
    rmSync(join(backupRoot, d), { recursive: true, force: true });
    console.log(`  Cleaned old backup: ${d}`);
  }
}

const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
console.log(`\nBacked up ${dbFiles.length} files (${sizeMB} MB) to data/backups/${ts}/`);
