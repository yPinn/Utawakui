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

describe('companion server page and reader socket', () => {
  async function freePort() {
    const probe = http.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    return port;
  }

  async function startWith(overrides = {}) {
    const port = await freePort();
    const readers = {
      attach: vi.fn((socket) => socket.send('hello')),
      closeAll: vi.fn(),
      closeDevice: vi.fn(),
    };
    const server = createCompanionServer({
      address: '127.0.0.1',
      port,
      pairing: { claim: () => false },
      devices: {},
      loadPage: () =>
        new Map([
          [
            '/m/',
            {
              body: Buffer.from('<html>phone</html>'),
              type: 'text/html; charset=utf-8',
            },
          ],
          [
            '/assets/a.js',
            { body: Buffer.from('x'), type: 'text/javascript; charset=utf-8' },
          ],
        ]),
      readers,
      ...overrides,
    });
    servers.push(server);
    await server.start();
    return { server, port, readers };
  }

  function get(port, path, headers = {}) {
    return new Promise((resolve, reject) => {
      http
        .get(
          {
            host: '127.0.0.1',
            port,
            path,
            headers: { host: `127.0.0.1:${port}`, ...headers },
          },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString(),
              }),
            );
          },
        )
        .on('error', reject);
    });
  }

  it('serves only allowlisted page files with a strict policy', async () => {
    const { port } = await startWith();
    const page = await get(port, '/m/');
    expect(page.status).toBe(200);
    expect(page.body).toBe('<html>phone</html>');
    expect(page.headers['content-security-policy']).toContain(
      `connect-src 'self' ws://127.0.0.1:${port}`,
    );
    expect(page.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    expect((await get(port, '/assets/a.js')).status).toBe(200);
    for (const path of [
      '/m',
      '/assets/../package.json',
      '/assets/b.js',
      '/index.html',
    ])
      expect((await get(port, path)).status).toBe(404);
  });

  async function openSocket(
    port,
    { origin, protocol = 'utawakui.companion.v1' } = {},
  ) {
    const { WebSocket } = await import('ws');
    return new Promise((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/m/ws`, protocol, {
        origin: origin ?? `http://127.0.0.1:${port}`,
      });
      socket.on('message', (data) => {
        resolve({ ok: true, message: String(data) });
        socket.close();
      });
      socket.on('unexpected-response', (_req, res) =>
        resolve({ ok: false, status: res.statusCode }),
      );
      socket.on('error', () => resolve({ ok: false, status: 'error' }));
    });
  }

  it('hands authenticated-protocol sockets from the exact origin to the reader hub', async () => {
    const { port, readers } = await startWith();
    expect(await openSocket(port)).toEqual({ ok: true, message: 'hello' });
    expect(readers.attach).toHaveBeenCalledOnce();
    expect(await openSocket(port, { origin: 'http://evil.test' })).toEqual({
      ok: false,
      status: 403,
    });
    expect(await openSocket(port, { protocol: 'other' })).toEqual({
      ok: false,
      status: 400,
    });
    expect(readers.attach).toHaveBeenCalledOnce();
  });

  it('closes readers when stopping and forwards device removal', async () => {
    const { server, readers } = await startWith();
    server.closeDevice('d1');
    expect(readers.closeDevice).toHaveBeenCalledWith('d1');
    await server.stop();
    expect(readers.closeAll).toHaveBeenCalled();
  });
});

describe('companion server commands', () => {
  async function startCommands({ dispatch, admit = () => null } = {}) {
    const probe = http.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    const commands = {
      admission: { admit: vi.fn(admit) },
      dispatch: vi.fn(dispatch ?? (async () => 'applied')),
    };
    const server = createCompanionServer({
      address: '127.0.0.1',
      port,
      pairing: { claim: () => false },
      devices: {
        authenticate: (credential) =>
          credential === 'k'.repeat(43) ? { id: 'd1' } : null,
      },
      commands,
    });
    servers.push(server);
    await server.start();
    return { port, commands };
  }

  const body = {
    command: 'player.next',
    sequence: 1,
    revision: 2,
    trackId: 'a',
  };
  const auth = { authorization: `Bearer ${'k'.repeat(43)}` };

  it('applies an authenticated, valid command and returns the outcome', async () => {
    const { port, commands } = await startCommands();
    const result = await request(port, {
      path: '/m/api/v1/command',
      headers: auth,
      body,
    });
    expect(result).toMatchObject({ status: 200, body: { result: 'applied' } });
    expect(commands.admission.admit).toHaveBeenCalledWith('d1', body);
    expect(commands.dispatch).toHaveBeenCalledWith({
      command: 'player.next',
      revision: 2,
      trackId: 'a',
    });
  });

  it('rejects missing credentials, invalid bodies and refused admission', async () => {
    const { port, commands } = await startCommands({
      admit: (_device, parsed) =>
        parsed.sequence === 9 ? 'rate-limited' : null,
    });
    expect(
      await request(port, { path: '/m/api/v1/command', body }),
    ).toMatchObject({ status: 401, body: { reason: 'unauthorized' } });
    expect(
      await request(port, {
        path: '/m/api/v1/command',
        headers: auth,
        body: { ...body, command: 'queue.clear' },
      }),
    ).toMatchObject({ status: 400, body: { reason: 'invalid' } });
    expect(
      await request(port, {
        path: '/m/api/v1/command',
        headers: auth,
        body: { ...body, sequence: 9 },
      }),
    ).toMatchObject({ status: 429, body: { reason: 'rate-limited' } });
    expect(commands.dispatch).not.toHaveBeenCalled();
  });

  it('reports renderer refusals and timeouts', async () => {
    const outcomes = ['stale', 'timed_out'];
    const { port } = await startCommands({
      dispatch: async () => outcomes.shift(),
    });
    expect(
      await request(port, { path: '/m/api/v1/command', headers: auth, body }),
    ).toMatchObject({
      status: 409,
      body: { result: 'rejected', reason: 'stale' },
    });
    expect(
      await request(port, {
        path: '/m/api/v1/command',
        headers: auth,
        body: { ...body, sequence: 2 },
      }),
    ).toMatchObject({ status: 504, body: { result: 'timed_out' } });
  });
});
