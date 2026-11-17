import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompanionServer } from './server.js';

const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
});

async function setup({ claim = () => true, add } = {}) {
  const pairing = { claim: vi.fn(claim) };
  const devices = {
    add: vi.fn(
      add ??
        ((label) => ({
          device: { id: 'device-1', label },
          credential: 'c'.repeat(43),
        })),
    ),
  };
  // Port 0 picks a free port; Host must still match the bound authority.
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const server = createCompanionServer({
    address: '127.0.0.1',
    port,
    pairing,
    devices,
  });
  servers.push(server);
  await server.start();
  return { server, port, pairing, devices };
}

function request(
  port,
  { method = 'POST', path = '/m/api/v1/pair', headers = {}, body } = {},
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          host: `127.0.0.1:${port}`,
          'content-type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(Buffer.concat(chunks).toString() || 'null'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body !== undefined)
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

describe('companion server', () => {
  it('pairs with a valid code and returns the credential once', async () => {
    const { port, devices } = await setup();
    const result = await request(port, {
      body: { code: 'A'.repeat(22), label: 'Phone' },
      headers: { origin: `http://127.0.0.1:${port}` },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      credential: 'c'.repeat(43),
      device: { id: 'device-1', label: 'Phone' },
    });
    expect(devices.add).toHaveBeenCalledWith('Phone');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
  });

  it('returns one bounded error for any pairing failure', async () => {
    const { port, devices } = await setup({ claim: () => false });
    for (const body of [{ code: 'bad' }, 'not json', [1]])
      expect(await request(port, { body })).toMatchObject({
        status: 400,
        body: { error: 'pairing-failed' },
      });
    expect(devices.add).not.toHaveBeenCalled();
  });

  it('reports a full device list separately', async () => {
    const { port } = await setup({
      add: () => {
        throw Object.assign(new Error('full'), { companionStatus: 'full' });
      },
    });
    expect(
      await request(port, { body: { code: 'x', label: 'P' } }),
    ).toMatchObject({
      status: 409,
      body: { error: 'devices-full' },
    });
  });

  it('rejects a foreign Host or Origin, other routes and non-JSON bodies', async () => {
    const { port, pairing } = await setup();
    expect(
      (await request(port, { headers: { host: 'evil.test' }, body: {} }))
        .status,
    ).toBe(403);
    expect(
      (
        await request(port, {
          headers: { origin: 'http://evil.test' },
          body: {},
        })
      ).status,
    ).toBe(403);
    expect((await request(port, { method: 'GET' })).status).toBe(404);
    expect((await request(port, { path: '/ws', body: {} })).status).toBe(404);
    expect(
      (
        await request(port, {
          headers: { 'content-type': 'text/plain' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(pairing.claim).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies', async () => {
    const { port, pairing } = await setup();
    const result = await request(port, {
      body: { code: 'A'.repeat(22), label: 'x'.repeat(2000) },
    }).catch(() => ({ status: 'closed' }));
    expect([400, 'closed']).toContain(result.status);
    expect(pairing.claim).not.toHaveBeenCalled();
  });

  it('refuses every request while the feature gate is off', async () => {
    let gate = true;
    const pairing = { claim: vi.fn(() => true) };
    const probe = http.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    const server = createCompanionServer({
      address: '127.0.0.1',
      port,
      pairing,
      devices: { add: vi.fn() },
      isGateEnabled: () => gate,
    });
    servers.push(server);
    await server.start();
    gate = false;
    expect(
      await request(port, { body: { code: 'A'.repeat(22), label: 'P' } }),
    ).toMatchObject({ status: 503, body: { error: 'unavailable' } });
    expect(pairing.claim).not.toHaveBeenCalled();
  });

  it('reports a busy port and stops cleanly', async () => {
    const { server, port } = await setup();
    const second = createCompanionServer({
      address: '127.0.0.1',
      port,
      pairing: { claim: () => false },
      devices: {},
    });
    await expect(second.start()).rejects.toMatchObject({
      companionStatus: 'port-in-use',
    });
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });
});
