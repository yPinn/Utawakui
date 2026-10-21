/* global __dirname, clearTimeout, console, module, process, require, setTimeout */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profiles = Object.freeze({
  'ui-component-lab': {
    prefix: 'utawakui-ui-component-lab-',
    environmentKey: 'UTAWAKUI_UI_LAB_USER_DATA',
    marker: 'UTAWAKUI_UI_LAB_COMPLETE:',
  },
  'studio-library-workspace': {
    prefix: 'utawakui-studio-library-capture-',
    environmentKey: 'UTAWAKUI_CAPTURE_USER_DATA',
    marker: 'UTAWAKUI_CAPTURE_COMPLETE:',
  },
});

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForClose(closed, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      closed,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve('close-timeout'), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runPrototypeCapture(name, options = {}) {
  if (!Object.hasOwn(profiles, name)) {
    throw new Error(
      'Usage: node prototypes/capture.cjs <ui-component-lab|studio-library-workspace>',
    );
  }
  const profile = profiles[name];
  const electronPath = options.electronPath ?? require('electron');
  const spawnProcess = options.spawnProcess ?? spawn;
  const spawnSyncProcess = options.spawnSyncProcess ?? spawnSync;
  const temporaryRoot = path.resolve(options.temporaryRoot ?? os.tmpdir());
  const captureDataDir = fs.mkdtempSync(
    path.join(temporaryRoot, profile.prefix),
  );
  const environment = {
    ...process.env,
    [profile.environmentKey]: captureDataDir,
  };
  // These children are Electron apps, even when the parent agent runs Node mode.
  delete environment.ELECTRON_RUN_AS_NODE;
  let child;
  let captureTimer;
  let resultCode;

  function terminateChild() {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
      return;
    if ((options.platform ?? process.platform) === 'win32') {
      const result = spawnSyncProcess(
        'taskkill.exe',
        ['/pid', String(child.pid), '/t', '/f'],
        { stdio: 'ignore', windowsHide: true },
      );
      if (result.status === 0) return;
    }
    child.kill('SIGKILL');
  }

  async function removeProfile() {
    if (
      path.dirname(captureDataDir) !== temporaryRoot ||
      !path.basename(captureDataDir).startsWith(profile.prefix) ||
      fs.lstatSync(captureDataDir).isSymbolicLink()
    ) {
      throw new Error('Refusing to remove unexpected capture profile');
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.rmSync(captureDataDir, { recursive: true, force: true });
        return;
      } catch (error) {
        if (attempt === 19) throw error;
        await delay(100);
      }
    }
  }

  try {
    child = spawnProcess(
      electronPath,
      [path.join(__dirname, name, 'capture-app')],
      {
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let captureCode = null;
    let spawnError;
    let complete;
    let failed;
    const captured = new Promise((resolve) => {
      complete = resolve;
    });
    const closed = new Promise((resolve) => child.on('close', resolve));
    const failure = new Promise((resolve) => {
      failed = resolve;
    });
    child.on('error', (error) => {
      spawnError = error;
      failed();
    });
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      (options.stdout ?? process.stdout).write(text);
      buffer += text;
      const match = buffer.match(new RegExp(`${profile.marker}(\\d+)`));
      if (match && captureCode === null) {
        captureCode = Number.parseInt(match[1], 10);
        complete();
      }
      buffer = buffer.slice(-256);
    });
    child.stderr.pipe(options.stderr ?? process.stderr);
    const deadline = new Promise((resolve) => {
      captureTimer = setTimeout(
        () => resolve('timeout'),
        options.captureTimeoutMs ?? 60_000,
      );
    });
    const outcome = await Promise.race([
      captured.then(() => 'captured'),
      closed.then(() => 'closed'),
      failure.then(() => 'spawn-error'),
      deadline,
    ]);
    clearTimeout(captureTimer);
    if (outcome !== 'closed') terminateChild();
    const closeCode = await waitForClose(
      closed,
      options.closeTimeoutMs ?? 5_000,
    );
    if (spawnError) throw spawnError;
    if (outcome === 'timeout' || closeCode === 'close-timeout') {
      throw new Error('Prototype capture exceeded its cleanup deadline');
    }
    if (captureCode === null) {
      throw new Error(
        `Prototype capture exited before completion (code ${closeCode})`,
      );
    }
    resultCode = captureCode;
  } finally {
    clearTimeout(captureTimer);
    terminateChild();
    await removeProfile();
  }
  (options.log ?? console.log)(
    'verified prototype child and temporary profile cleanup',
  );
  return resultCode;
}

module.exports = { runPrototypeCapture };

if (require.main === module) {
  const [name, ...extra] = process.argv.slice(2);
  if (extra.length) {
    console.error('Capture accepts exactly one prototype name');
    process.exitCode = 1;
  } else {
    runPrototypeCapture(name).then(
      (code) => {
        process.exitCode = code;
      },
      (error) => {
        console.error(error);
        process.exitCode = 1;
      },
    );
  }
}
