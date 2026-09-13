import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';

function createRequest({ method = 'POST', body, token, contentLength } = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.set('X-Utawakui-Feedback-Token', token);
  if (contentLength !== undefined) {
    headers.set('content-length', String(contentLength));
  }
  return new Request('https://relay.example.test/submit', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function basePayload(overrides = {}) {
  return {
    schemaVersion: 1,
    reportId: 'report-1',
    kind: 'bug',
    createdAt: '2026-09-13T00:00:00.000Z',
    description: '整首歌卡住',
    environment: { appVersion: '1.0.0', electronVersion: '30.0.0' },
    ...overrides,
  };
}

function createKv() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key) => store.get(key) ?? null),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback relay worker', () => {
  it('rejects non-POST methods', async () => {
    const response = await worker.fetch(createRequest({ method: 'GET' }), {});
    expect(response.status).toBe(405);
  });

  it('rejects a mismatched client token', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload(), token: 'wrong' }),
      { CLIENT_TOKEN: 'shh' },
    );
    expect(response.status).toBe(401);
  });

  it('rejects a payload larger than the declared content-length ceiling', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload(), contentLength: 10_000_000 }),
      {},
    );
    expect(response.status).toBe(413);
  });

  it('rejects malformed JSON', async () => {
    const request = new Request('https://relay.example.test/submit', {
      method: 'POST',
      body: 'not json',
    });
    const response = await worker.fetch(request, {});
    expect(response.status).toBe(400);
  });

  it('rejects a payload that fails validation', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload({ kind: 'nonsense' }) }),
      {},
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-kind' });
  });

  it('returns relay-not-configured when no webhook URL is bound', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      {},
    );
    expect(response.status).toBe(500);
  });

  it('rate-limits repeated requests from the same client', async () => {
    const kv = createKv();
    const env = {
      DISCORD_WEBHOOK_URL: 'https://discord.example/webhook',
      RATE_LIMIT_KV: kv,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    for (let i = 0; i < 20; i += 1) {
      const response = await worker.fetch(
        createRequest({ body: basePayload({ reportId: `r-${i}` }) }),
        env,
      );
      expect(response.status).toBe(200);
    }
    const limited = await worker.fetch(
      createRequest({ body: basePayload({ reportId: 'r-over' }) }),
      env,
    );
    expect(limited.status).toBe(429);
  });

  it('forwards a valid report to Discord and returns the reportId', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchImpl);
    const env = { DISCORD_WEBHOOK_URL: 'https://discord.example/webhook' };

    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reportId: 'report-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://discord.example/webhook');
  });

  it('reports discord-delivery-failed when Discord rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    const env = { DISCORD_WEBHOOK_URL: 'https://discord.example/webhook' };

    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      env,
    );

    expect(response.status).toBe(502);
  });
});
