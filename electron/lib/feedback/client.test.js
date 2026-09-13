import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';
import { buildFeedbackUserAgent, createFeedbackClient } from './client.js';

const require = createRequire(import.meta.url);
const packageMetadata = require('../../../package.json');

const samplePayload = { reportId: 'report-1', kind: 'bug', description: 'x' };

describe('buildFeedbackUserAgent', () => {
  it('identifies the package version', () => {
    expect(buildFeedbackUserAgent()).toBe(
      `Utawakui/${packageMetadata.version} (feedback)`,
    );
  });
});

describe('createFeedbackClient', () => {
  it('posts the payload as JSON with the expected headers', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reportId: 'server-assigned-id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
      clientToken: 'shh',
    });

    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'ok',
      reportId: 'server-assigned-id',
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://relay.example.test/submit');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.body).toBe(JSON.stringify(samplePayload));
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Utawakui-Feedback-Token']).toBe('shh');
  });

  it('falls back to the payload reportId when the relay omits one', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });

    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'ok',
      reportId: 'report-1',
    });
  });

  it('reports fetch-unavailable when no fetch implementation exists', async () => {
    const client = createFeedbackClient({
      fetch: undefined,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'fetch-unavailable',
    });
  });

  it('reports endpoint-not-configured when baseUrl is empty', async () => {
    const client = createFeedbackClient({ fetch: vi.fn(), baseUrl: '' });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'endpoint-not-configured',
    });
  });

  it('classifies an abort error as a timeout', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
    });
  });

  it('classifies a generic network error as offline', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'offline',
    });
  });

  it('maps a 429 response to rate-limited', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'rate-limited',
    });
  });

  it('maps a 5xx response to service-unavailable', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'service-unavailable',
    });
  });

  it('maps another non-2xx response to a generic http-error with status', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 400 }));
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'http-error',
      httpStatus: 400,
    });
  });

  it('reports invalid-json when the response body cannot be parsed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('not json', { status: 200 }));
    const client = createFeedbackClient({
      fetch,
      baseUrl: 'https://relay.example.test/submit',
    });
    await expect(client.submit(samplePayload)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-json',
    });
  });
});
