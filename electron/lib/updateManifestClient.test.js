import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  RELEASE_REPOSITORY,
  manifestUrlForVersion,
  createUpdateManifestClient,
} from './updateManifestClient.js';

const require = createRequire(import.meta.url);
const packageMetadata = require('../../package.json');

describe('manifestUrlForVersion', () => {
  it('builds a fixed GitHub Releases asset URL from the version alone', () => {
    expect(manifestUrlForVersion('0.4.0')).toBe(
      `https://github.com/${RELEASE_REPOSITORY}/releases/download/v0.4.0/update-manifest.json`,
    );
  });
});

describe('createUpdateManifestClient', () => {
  it('fetches and parses the manifest for the given version', async () => {
    const manifestBody = { version: '0.4.0', signature: 'abc' };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(manifestBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createUpdateManifestClient({ fetch });

    await expect(client.fetchManifest('0.4.0')).resolves.toEqual({
      status: 'ok',
      value: manifestBody,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(manifestUrlForVersion('0.4.0'));
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('follow');
    expect(init.headers['User-Agent']).toBe(
      `Utawakui/${packageMetadata.version} (update-manifest)`,
    );
  });

  it('reports a bounded reason for a non-2xx response without throwing', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('not found', { status: 404 }));
    const client = createUpdateManifestClient({ fetch });

    await expect(client.fetchManifest('0.4.0')).resolves.toEqual({
      status: 'error',
      reason: 'http-error',
      httpStatus: 404,
    });
  });

  it('reports invalid-json for a non-JSON body instead of throwing', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('not json', { status: 200 }));
    const client = createUpdateManifestClient({ fetch });

    await expect(client.fetchManifest('0.4.0')).resolves.toEqual({
      status: 'error',
      reason: 'invalid-json',
    });
  });

  it('classifies a transport failure as offline', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('network down'));
    const client = createUpdateManifestClient({ fetch });

    await expect(client.fetchManifest('0.4.0')).resolves.toEqual({
      status: 'error',
      reason: 'offline',
    });
  });

  it('rejects a missing/empty version without making a request', async () => {
    const fetch = vi.fn();
    const client = createUpdateManifestClient({ fetch });

    await expect(client.fetchManifest('')).resolves.toEqual({
      status: 'error',
      reason: 'invalid-version',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports fetch-unavailable when no fetch implementation exists', async () => {
    const client = createUpdateManifestClient({ fetch: undefined });

    await expect(client.fetchManifest('0.4.0')).resolves.toEqual({
      status: 'error',
      reason: 'fetch-unavailable',
    });
  });
});
