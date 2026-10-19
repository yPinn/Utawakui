'use strict';

const { spawn } = require('node:child_process');
const { recipe } = require('./protocol.cjs');
const ENV_NAMES = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
]);

// All workers are direct children: no shell, inherited Python/Node injection, or grandchildren.
function createProcessGroup({
  timeoutMs = 1200000,
  maxMessageBytes = recipe.maxMessageBytes,
} = {}) {
  const children = new Set();
  let failure = null;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => ENV_NAMES.has(k.toUpperCase())),
  );
  Object.assign(env, {
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  });

  function fail(error) {
    failure ??= error;
    for (const entry of children) {
      entry.pending?.reject(failure);
      entry.pending = null;
      entry.child.kill();
    }
  }
  const deadline = setTimeout(
    () => fail(new Error('research deadline exceeded')),
    timeoutMs,
  );
  deadline.unref();

  function launch(executable, args) {
    if (failure) throw failure;
    const child = spawn(executable, args, {
      env:
        executable === process.execPath
          ? { ...env, ELECTRON_RUN_AS_NODE: '1' }
          : env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const entry = { child, pending: null, stderrBytes: 0, closed: false };
    entry.done = new Promise((resolve) => {
      child.on('close', () => {
        entry.closed = true;
        children.delete(entry);
        entry.pending?.reject(failure ?? new Error('research worker closed'));
        entry.pending = null;
        resolve();
      });
    });
    child.on('error', () => fail(new Error('research worker unavailable')));
    child.stdin.on('error', () =>
      fail(new Error('research worker input failed')),
    );
    child.stderr.on('data', (chunk) => {
      entry.stderrBytes += chunk.length;
      if (entry.stderrBytes > 16384)
        fail(new Error('research stderr exceeded limit'));
    });
    children.add(entry);
    return entry;
  }

  function rpc(executable, args) {
    const entry = launch(executable, args);
    let buffer = Buffer.alloc(0);
    entry.child.stdout.on('data', (chunk) => {
      if (failure) return;
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(10);
      if (
        buffer.length > maxMessageBytes ||
        (newline !== -1 && newline !== buffer.length - 1)
      ) {
        fail(new Error('research protocol byte limit'));
        return;
      }
      if (newline === -1) return;
      try {
        const message = JSON.parse(buffer.toString('utf8'));
        if (!entry.pending || message?.id !== entry.pending.id)
          throw new Error('unexpected response');
        const { resolve } = entry.pending;
        entry.pending = null;
        buffer = Buffer.alloc(0);
        resolve(message);
      } catch {
        fail(new Error('research protocol invalid'));
      }
    });
    return {
      request(message) {
        if (failure || entry.closed)
          return Promise.reject(failure ?? new Error('research worker closed'));
        if (entry.pending)
          return Promise.reject(new Error('research request already pending'));
        const bytes = Buffer.from(`${JSON.stringify(message)}\n`);
        if (bytes.length > maxMessageBytes)
          return Promise.reject(new Error('research request byte limit'));
        return new Promise((resolve, reject) => {
          entry.pending = { id: message.id, resolve, reject };
          entry.child.stdin.write(bytes);
        });
      },
    };
  }

  async function capture(executable, args, limit) {
    const entry = launch(executable, args);
    const chunks = [];
    let total = 0;
    entry.child.stdin.end();
    entry.child.stdout.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        fail(new Error('research decode byte limit'));
        return;
      }
      chunks.push(chunk);
    });
    let exitCode;
    entry.child.on('exit', (code) => {
      exitCode = code;
    });
    await entry.done;
    if (failure) throw failure;
    if (exitCode !== 0) throw new Error('research decode failed');
    return Buffer.concat(chunks);
  }

  async function close() {
    clearTimeout(deadline);
    const pending = [...children];
    fail(new Error('research job cancelled or closed'));
    const force = setTimeout(() => {
      for (const entry of children) entry.child.kill('SIGKILL');
    }, 250);
    try {
      await Promise.all(pending.map((e) => e.done));
    } finally {
      clearTimeout(force);
    }
  }
  return {
    rpc,
    capture,
    close,
    pids: () => [...children].map((e) => e.child.pid).filter(Boolean),
    check: () => {
      if (failure) throw failure;
    },
  };
}

module.exports = { createProcessGroup };
