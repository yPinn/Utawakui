import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// Reproducible build/test artifacts only. `.benchmarks/` and `.tmp/` are left
// alone: they hold fetched evaluation data and are expensive to regenerate,
// unlike a fresh `vite build`, `vitest run --coverage`, or `electron-builder`
// pass.
const FIXED_TARGETS = ['dist', 'coverage', 'node_modules/.vite'];
const RELEASE_DIR_RE = /^release(-.*)?$/;

function findReleaseDirs(rootDir, fsApi) {
  return fsApi
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RELEASE_DIR_RE.test(entry.name))
    .map((entry) => entry.name);
}

export function computeCleanTargets(rootDir, fsApi = fs) {
  return [...FIXED_TARGETS, ...findReleaseDirs(rootDir, fsApi)];
}

export function runClean({
  rootDir = '.',
  fsApi = fs,
  log = console.log,
} = {}) {
  const removed = [];
  for (const target of computeCleanTargets(rootDir, fsApi)) {
    const fullPath = path.join(rootDir, target);
    if (!fsApi.existsSync(fullPath)) continue;
    fsApi.rmSync(fullPath, { recursive: true, force: true });
    removed.push(target);
    log(`removed ${target}`);
  }
  if (removed.length === 0) log('nothing to clean');
  return removed;
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(SCRIPT_PATH)) {
  runClean();
}
