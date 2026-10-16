import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const probePath = fileURLToPath(
  new URL('./settings-window-layout-probe.cjs', import.meta.url),
);
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;
const probeUserData = mkdtempSync(join(tmpdir(), 'utawakui-settings-layout-'));
childEnvironment.UTAWAKUI_SETTINGS_LAYOUT_USER_DATA = probeUserData;

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  rmSync(probeUserData, { recursive: true, force: true });
}

const child = spawn(electronPath, [probePath], {
  env: childEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let stdout = '';
let stderr = '';

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const timeout = setTimeout(() => {
  child.kill();
}, 60_000);

child.on('error', (error) => {
  clearTimeout(timeout);
  cleanup();
  console.error(`Unable to start the Settings layout probe: ${error.message}`);
  process.exitCode = 1;
});

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  cleanup();
  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
  if (signal) {
    console.error(`Settings layout probe terminated by ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
