import { describe, expect, it, vi } from 'vitest';
import {
  createProviderRequestGuard,
  parseRetryAfterMs,
} from './providerServiceCooldown.js';

describe('provider service cooldown', () => {
  it('isolates origins while sharing a transport across guard instances', async () => {
    let currentTime = 1000;
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('', { status: 429, headers: { 'Retry-After': '60' } }),
        ),
      );
    const first = createProviderRequestGuard(fetch, { now: () => currentTime });
    const second = createProviderRequestGuard(fetch, {
      now: () => currentTime,
    });
    await first.fetch('https://one.test/private?key=secret');
    await second.fetch('https://one.test/other');
    expect(fetch).toHaveBeenCalledOnce();
    await second.fetch('https://two.test/other');
    expect(fetch).toHaveBeenCalledTimes(2);
    currentTime += 60_000;
    await second.fetch('https://one.test/other');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not let a late successful response undo a newer service failure', async () => {
    let release;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const guard = createProviderRequestGuard(fetch);
    const late = guard.fetch('https://one.test/old');
    await guard.fetch('https://one.test/busy');
    release(new Response('ok'));
    await late;
    expect((await guard.fetch('https://one.test/new')).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('backs off failures to five minutes and resets after a later success', async () => {
    let currentTime = 1000;
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 502 })),
      );
    const guard = createProviderRequestGuard(fetch, { now: () => currentTime });
    for (const delay of [
      5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000,
    ]) {
      const count = fetch.mock.calls.length;
      await guard.fetch('https://one.test/');
      currentTime += delay - 1;
      await guard.fetch('https://one.test/');
      expect(fetch).toHaveBeenCalledTimes(count + 1);
      currentTime += 1;
    }
    fetch.mockResolvedValueOnce(new Response('ok'));
    await guard.fetch('https://one.test/');
    await guard.fetch('https://one.test/');
    const count = fetch.mock.calls.length;
    currentTime += 5000;
    await guard.fetch('https://one.test/');
    expect(fetch).toHaveBeenCalledTimes(count + 1);
  });

  it.each(['invalid', '-1', '9'.repeat(400), 'Tue, 20 Oct 2020 00:00:00 GMT'])(
    'uses fallback for invalid or expired deadline %s',
    async (header) => {
      let currentTime = Date.UTC(2026, 9, 20);
      const fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response('', {
            status: 429,
            headers: { 'Retry-After': header },
          }),
        ),
      );
      const guard = createProviderRequestGuard(fetch, {
        now: () => currentTime,
      });
      await guard.fetch('https://one.test/');
      currentTime += 29_999;
      await guard.fetch('https://one.test/');
      expect(fetch).toHaveBeenCalledOnce();
      currentTime += 1;
      await guard.fetch('https://one.test/');
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('honors an HTTP date without waiting and never shortens an active deadline', async () => {
    let currentTime = Date.UTC(2026, 9, 20);
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response('', {
        status: 503,
        headers: {
          'Retry-After': new Date(currentTime + 3_600_000).toUTCString(),
        },
      }),
    );
    const guard = createProviderRequestGuard(fetch, { now: () => currentTime });
    await guard.fetch('https://one.test/');
    guard.recordFailure('https://one.test/', 429);
    currentTime += 3_599_999;
    await guard.fetch('https://one.test/');
    expect(fetch).toHaveBeenCalledOnce();
    currentTime += 1;
    fetch.mockResolvedValueOnce(new Response('ok'));
    expect((await guard.fetch('https://one.test/')).ok).toBe(true);
  });

  it('does not impose a cooldown for ordinary not-found or create a missing transport', async () => {
    expect(createProviderRequestGuard(null).fetch).toBeNull();
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 404 })),
      );
    const guard = createProviderRequestGuard(fetch);
    guard.recordFailure('https://one.test/', 404);
    await guard.fetch('https://one.test/');
    await guard.fetch('https://one.test/');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
  });

  it('preserves cancellation before any network request including while cooling down', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }));
    const guard = createProviderRequestGuard(fetch);
    await guard.fetch('https://one.test/');
    const controller = new AbortController();
    controller.abort();
    await expect(
      guard.fetch('https://one.test/', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
