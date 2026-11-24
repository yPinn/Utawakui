#!/usr/bin/env node
// Runs Vitest in a Linux container to match the Ubuntu CI job before pushing.
// Usage: npm run test:linux -- <test files or filters>

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_IMAGE = 'node:24-bookworm';
// Same checkout path as the GitHub Ubuntu runner; tests check bundles for it.
export const CI_CHECKOUT_DIR = '/home/runner/work/Utawakui/Utawakui';
const NPM_CACHE_VOLUME = 'utawakui-npm-cache';

// The Ubuntu runner ships the shared libraries Electron needs to start.
export const DOCKERFILE = [
  `FROM ${BASE_IMAGE}`,
  'RUN apt-get update && apt-get install -y --no-install-recommends \\',
  '    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \\',
  '    libgtk-3-0 libgbm1 libasound2 libxkbcommon0 libxcomposite1 \\',
  '    libxdamage1 libxrandr2 libxss1 libxtst6 \\',
  ' && rm -rf /var/lib/apt/lists/*',
  '',
].join('\n');

// The tag follows the Dockerfile, so an edit rebuilds instead of reusing.
export const LINUX_TEST_IMAGE = `utawakui-linux-test:${createHash('sha256')
  .update(DOCKERFILE)
  .digest('hex')
  .slice(0, 12)}`;

// The host streams the checkout as tar on stdin, so worktrees work and
// Windows-installed node_modules or ignored data never reach the container.
// A snapshot commit serves tests that read git, as CI's checkout does.
export const CONTAINER_SCRIPT = [
  'set -eo pipefail',
  `mkdir -p ${CI_CHECKOUT_DIR}`,
  `tar -xf - -C ${CI_CHECKOUT_DIR}`,
  `cd ${CI_CHECKOUT_DIR}`,
  'git init -q && git add -A',
  'git -c user.name=linux-vitest -c user.email=linux-vitest@localhost commit -q --no-verify -m snapshot',
  'npm ci --no-audit --no-fund --loglevel=error',
  'npx vitest run "$@"',
].join('\n');

export function buildLinuxVitestDockerArgs(vitestArgs = []) {
  return [
    'run',
    '--rm',
    '-i',
    '-v',
    `${NPM_CACHE_VOLUME}:/root/.npm`,
    LINUX_TEST_IMAGE,
    'bash',
    '-c',
    CONTAINER_SCRIPT,
    'linux-vitest',
    ...vitestArgs,
  ];
}

// Tracked plus untracked, non-ignored files; deleted tracked files are skipped.
export function selectCheckoutFiles(gitOutput, exists) {
  return String(gitOutput)
    .split('\0')
    .filter((file) => file && exists(file));
}

function listCheckoutFiles(rootDir) {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: rootDir, maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${String(result.stderr).trim()}`);
  }
  return selectCheckoutFiles(result.stdout, (file) =>
    fs.existsSync(path.join(rootDir, file)),
  );
}

function ensureImage() {
  const inspect = spawnSync('docker', ['image', 'inspect', LINUX_TEST_IMAGE], {
    stdio: 'ignore',
  });
  if (inspect.error) {
    console.error(`Docker is required: ${inspect.error.message}`);
    process.exit(1);
  }
  if (inspect.status === 0) return;
  const build = spawnSync('docker', ['build', '-t', LINUX_TEST_IMAGE, '-'], {
    input: DOCKERFILE,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (build.status !== 0) {
    console.error('Failed to build the Linux test image');
    process.exit(1);
  }
}

function main() {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const files = listCheckoutFiles(rootDir);
  ensureImage();
  const tar = spawn('tar', ['-C', rootDir, '--null', '-T', '-', '-cf', '-'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const docker = spawn(
    'docker',
    buildLinuxVitestDockerArgs(process.argv.slice(2)),
    { stdio: [tar.stdout, 'inherit', 'inherit'] },
  );
  tar.stdin.end(files.join('\0'));
  for (const [name, child] of [
    ['tar', tar],
    ['Docker', docker],
  ]) {
    child.on('error', (error) => {
      console.error(`${name} is required: ${error.message}`);
      process.exit(1);
    });
  }
  tar.on('close', (code) => {
    if (code !== 0) {
      console.error(`tar exited with ${code}`);
      docker.kill();
    }
  });
  docker.on('close', (code) => process.exit(code ?? 1));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
