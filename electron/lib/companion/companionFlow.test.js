import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { createCompanionDeviceStore } from './deviceStore.js';
import { createPairingCodes } from './pairing.js';
import { createPairingApprovals } from './pairingApproval.js';
import { createReaderHub } from './readerHub.js';
import { createCompanionServer } from './server.js';

// End-to-end: real pairing codes, device store, reader hub and listener.
const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text),
  decryptString: (buffer) => String(buffer),
};

async function freePort() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startFlow() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-companion-flow-'),
  );
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const port = await freePort();
  const devices = createCompanionDeviceStore({
    filePath: path.join(dir, 'devices.bin'),
    safeStorage,
  });
  const pairing = createPairingCodes();
  let snapshot = { state: { revision: 1 } };
  const listeners = new Set();
  const readerCounts = [];
  const readers = createReaderHub({
    devices,
    snapshots: {
      get: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    onReaderCount: (count) => readerCounts.push(count),
  });
  const approvals = createPairingApprovals();
  const server = createCompanionServer({
    address: '127.0.0.1',
    port,
    pairing,
    devices,
    readers,
    approvals,
  });
  await server.start();
  cleanups.push(() => server.stop());
  const origin = `http://127.0.0.1:${port}`;
  return {
    port,
    origin,
    devices,
    pairing,
    approvals,
    readers,
    readerCounts,
    publish(next) {
      snapshot = next;
      for (const listener of listeners) listener(next);
    },
  };
}

function postPair(flow, body, path = '/m/api/v1/pair') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: flow.port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${flow.port}`,
          origin: flow.origin,
          'content-type': 'application/json',
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

function openReader(flow, credential) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${flow.port}/m/ws`,
    'utawakui.companion.v1',
    { origin: flow.origin },
  );
  const messages = [];
  const closed = new Promise((resolve) =>
    socket.on('close', (code) => resolve(code)),
  );
  socket.on('message', (data) => messages.push(JSON.parse(String(data))));
  socket.on('open', () =>
    socket.send(JSON.stringify({ type: 'auth', credential })),
  );
  cleanups.push(() => socket.terminate());
  return { socket, messages, closed };
}

describe('companion pairing and reading flow', () => {
  it('pairs once, streams snapshots and disconnects on removal', async () => {
    const flow = await startFlow();
    const { code } = flow.pairing.begin();
    const requested = await postPair(flow, { code, label: 'Pixel' });
    expect(requested.status).toBe(202);
    expect(flow.devices.list()).toEqual([]);
    expect((await postPair(flow, { code, label: 'Again' })).status).toBe(400);

    // Nothing pairs until the computer approves the shown match code.
    const request = flow.approvals.status();
    expect(request).toMatchObject({
      label: 'Pixel',
      matchCode: requested.body.matchCode,
    });
    flow.approvals.approve(
      request.id,
      (label) => flow.devices.add(label).credential,
    );
    const paired = await postPair(
      flow,
      { claimToken: requested.body.claimToken },
      '/m/api/v1/pair/status',
    );
    expect(paired.status).toBe(200);
    expect(flow.devices.list()).toEqual([
      expect.objectContaining({ label: 'Pixel' }),
    ]);
    paired.body.device = flow.devices.list()[0];

    const reader = openReader(flow, paired.body.credential);
    await expect.poll(() => reader.messages.length).toBe(1);
    expect(reader.messages[0].snapshot).toEqual({ state: { revision: 1 } });
    flow.publish({ state: { revision: 2 } });
    await expect.poll(() => reader.messages.length).toBe(2);
    expect(reader.messages[1].snapshot.state.revision).toBe(2);
    expect(flow.readerCounts.at(-1)).toBe(1);

    flow.devices.revoke(paired.body.device.id);
    flow.readers.closeDevice(paired.body.device.id);
    expect(await reader.closed).toBe(4401);
    // Server-side release fires after the close handshake, possibly after the client.
    await expect.poll(() => flow.readerCounts.at(-1)).toBe(0);

    const stale = openReader(flow, paired.body.credential);
    expect(await stale.closed).toBe(4401);
    expect(stale.messages).toEqual([]);
  });
});
