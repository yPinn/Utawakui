import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PAYLOAD_BYTES } from './constants.js';
import worker from './index.js';

const CLIENT_MARKER = 'utawakui-desktop-feedback-v1';

function createRequest({
  method = 'POST',
  body,
  marker = CLIENT_MARKER,
  contentLength,
  url = 'https://relay.example.test/feedback/submit',
} = {}) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (marker !== null) headers.set('X-Utawakui-Client', marker);
  if (contentLength !== undefined) {
    headers.set('content-length', String(contentLength));
  }
  return new Request(url, {
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

function createEnv(overrides = {}) {
  return {
    CLIENT_MARKER,
    DISCORD_WEBHOOK_URL: 'https://discord.example/webhook',
    RATE_LIMIT_KV: createKv(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback relay worker', () => {
  it('rejects every path except the canonical submission path', async () => {
    const response = await worker.fetch(
      createRequest({
        body: basePayload(),
        url: 'https://relay.example.test/submit',
      }),
      createEnv(),
    );
    expect(response.status).toBe(404);
  });

  it('rejects non-POST methods', async () => {
    const response = await worker.fetch(createRequest({ method: 'GET' }), {});
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('fails closed when the public client marker is not configured', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      createEnv({ CLIENT_MARKER: undefined }),
    );
    expect(response.status).toBe(503);
  });

  it('fails closed when the rate-limit binding is missing', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      createEnv({ RATE_LIMIT_KV: undefined }),
    );
    expect(response.status).toBe(503);
  });

  it.each([null, 'wrong'])(
    'rejects a missing or mismatched public client marker',
    async (marker) => {
      const response = await worker.fetch(
        createRequest({ body: basePayload(), marker }),
        createEnv(),
      );
      expect(response.status).toBe(403);
    },
  );

  it('returns non-cacheable JSON responses with sniffing disabled', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload(), marker: 'wrong' }),
      createEnv(),
    );
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects a non-JSON request body before parsing it', async () => {
    const request = createRequest({ body: basePayload() });
    request.headers.set('Content-Type', 'text/plain');
    const response = await worker.fetch(request, createEnv());
    expect(response.status).toBe(415);
  });

  it('rejects a payload larger than the declared content-length ceiling', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload(), contentLength: 10_000_000 }),
      createEnv(),
    );
    expect(response.status).toBe(413);
  });

  it('bounds the streamed body even when content-length is absent', async () => {
    const request = new Request('https://relay.example.test/feedback/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Utawakui-Client': CLIENT_MARKER,
      },
      body: 'x'.repeat(MAX_PAYLOAD_BYTES + 1),
    });
    const response = await worker.fetch(request, createEnv());
    expect(response.status).toBe(413);
  });

  it('rejects malformed JSON', async () => {
    const request = new Request('https://relay.example.test/feedback/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Utawakui-Client': CLIENT_MARKER,
      },
      body: 'not json',
    });
    const response = await worker.fetch(request, createEnv());
    expect(response.status).toBe(400);
  });

  it('rejects a payload that fails validation', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload({ kind: 'nonsense' }) }),
      createEnv(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-kind' });
  });

  it('returns relay-not-configured when no webhook URL is bound', async () => {
    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      createEnv({ DISCORD_WEBHOOK_URL: undefined }),
    );
    expect(response.status).toBe(503);
  });

  it('rate-limits repeated requests from the same client', async () => {
    const kv = createKv();
    const env = {
      CLIENT_MARKER,
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
    const env = createEnv();

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
    const env = createEnv();

    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      env,
    );

    expect(response.status).toBe(502);
  });

  it('returns a bounded service error when the KV operation fails', async () => {
    const kv = createKv();
    kv.get.mockRejectedValue(new Error('private storage detail'));
    const response = await worker.fetch(
      createRequest({ body: basePayload() }),
      createEnv({ RATE_LIMIT_KV: kv }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service-unavailable' });
  });
});
