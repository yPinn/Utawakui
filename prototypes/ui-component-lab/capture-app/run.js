/* global __dirname, clearTimeout, console, process, require, setTimeout */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const captureAppDir = __dirname;
const electronPath = require('electron');
const tempPrefix = 'utawakui-ui-component-lab-';
const captureDataDir = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function removeCaptureData() {
  const expectedParent = path.resolve(os.tmpdir());
  const resolved = path.resolve(captureDataDir);
  if (
    path.dirname(resolved) !== expectedParent ||
    !path.basename(resolved).startsWith(tempPrefix)
  ) {
    throw new Error(`Refusing to remove unexpected capture path: ${resolved}`);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await delay(100);
    }
  }
}

function terminateCaptureTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const result = spawnSync(
      'taskkill.exe',
      ['/pid', String(child.pid), '/t', '/f'],
      { stdio: 'ignore', windowsHide: true },
    );
    if (result.status === 0) return;
  }
  child.kill('SIGKILL');
}

async function main() {
  let child;
  try {
    child = spawn(electronPath, [captureAppDir], {
      env: {
        ...process.env,
        UTAWAKUI_UI_LAB_USER_DATA: captureDataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let buffer = '';
    let captureCode = null;
    let spawnError = null;
    let finishCapture;
    let reportSpawnError;
    const captureFinished = new Promise((resolve) => {
      finishCapture = resolve;
    });
    const childClosed = new Promise((resolve) => {
      child.on('close', (code) => resolve(code));
    });
    const childFailed = new Promise((resolve) => {
      reportSpawnError = resolve;
    });
    child.on('error', (error) => {
      spawnError = error;
      reportSpawnError();
    });
    let timeoutId;
    const timedOut = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), 60_000);
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffer += text;
      const match = buffer.match(/UTAWAKUI_UI_LAB_COMPLETE:(\d+)/);
      if (match && captureCode === null) {
        captureCode = Number.parseInt(match[1], 10);
        finishCapture();
      }
      buffer = buffer.slice(-256);
    });
    child.stderr.pipe(process.stderr);

    const firstOutcome = await Promise.race([
      captureFinished.then(() => 'captured'),
      childClosed.then(() => 'closed'),
      childFailed.then(() => 'spawn-error'),
      timedOut,
    ]);
    clearTimeout(timeoutId);
    if (firstOutcome !== 'closed') terminateCaptureTree(child);
    const closeCode = await Promise.race([
      childClosed,
      delay(5_000).then(() => 'close-timeout'),
    ]);

    if (firstOutcome === 'timeout' || closeCode === 'close-timeout') {
      throw new Error('UI component lab capture exceeded its cleanup deadline');
    }
    if (spawnError) throw spawnError;
    if (captureCode === null) {
      throw new Error(
        `UI component lab capture exited before completion (code ${closeCode})`,
      );
    }
    process.exitCode = captureCode;
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      terminateCaptureTree(child);
    }
    await removeCaptureData();
  }
  console.log('verified UI lab process tree and temporary profile cleanup');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
