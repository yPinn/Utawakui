'use strict';

const { spawn } = require('child_process');
const net = require('net');

const DEFAULT_READINESS_ATTEMPTS = 20;
const DEFAULT_READINESS_DELAY_MS = 250;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function canListenOnLoopback(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        resolve(typeof address === 'object' && address ? address.port : false),
      );
    });
  });
}

async function findAvailableLoopbackPort(preferredPort) {
  const preferred = await canListenOnLoopback(preferredPort);
  if (preferred) return preferred;
  const assigned = await canListenOnLoopback(0);
  if (!assigned) throw new Error('unable to reserve a loopback port');
  return assigned;
}

async function pingProvider(baseUrl, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetchImpl(`${baseUrl}/ping`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return {
      baseUrl,
      version:
        typeof body?.version === 'string' && body.version ? body.version : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function createBgutilProviderServer(options) {
  const {
    executablePath,
    port,
    spawnImpl = spawn,
    fetchImpl = fetch,
    readinessAttempts = DEFAULT_READINESS_ATTEMPTS,
    readinessDelayMs = DEFAULT_READINESS_DELAY_MS,
  } = options;
  const baseUrl = `http://127.0.0.1:${port}`;
  let child = null;
  let startPromise = null;

  async function waitUntilReady() {
    for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
      const ready = await pingProvider(baseUrl, fetchImpl);
      if (ready) return ready;
      if (attempt < readinessAttempts - 1) {
        await delay(readinessDelayMs);
      }
    }
    throw new Error('bgutil provider did not become ready');
  }

  function spawnServer() {
    child = spawnImpl(
      executablePath,
      ['server', '--host', '127.0.0.1', '--port', String(port)],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.on('close', () => {
      child = null;
      startPromise = null;
    });
    child.on('error', () => {
      child = null;
      startPromise = null;
    });
  }

  return {
    start() {
      if (startPromise) return startPromise;
      spawnServer();
      startPromise = waitUntilReady();
      return startPromise;
    },
    stop() {
      if (!child) return;
      const ownedChild = child;
      child = null;
      startPromise = null;
      ownedChild.kill();
    },
  };
}

module.exports = {
  createBgutilProviderServer,
  findAvailableLoopbackPort,
};
