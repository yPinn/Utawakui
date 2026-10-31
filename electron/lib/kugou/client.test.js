import { describe, it, expect, vi } from 'vitest';
import { createKugouClient } from './client.js';
import { createLyricsRequestBudget } from '../lyricsProviders/requestPolicy.js';
import { createKugouAcquisitionProvider } from './acquisition.js';
const hash = 'a'.repeat(32);
const query = { title: 'Song', artist: 'Artist' };
const catalog = {
  data: {
    info: [{ hash, songname: 'Song', singername: 'Artist', duration: 180 }],
  },
};
const json = (value) => new Response(JSON.stringify(value));
describe('Kugou fixed-route request policy', () => {
  it('reports an essential download cooldown without another catalog or metadata request', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { 'Retry-After': '60' } }),
    );
    const client = createKugouClient({
      fetch,
      scheduler: { schedule: (start) => start() },
    });
    await client.download({ id: '123', accesskey: 'private', lrcid: 0 });
    expect(client.availability()).toMatchObject({
      status: 'error',
      reason: 'rate-limited',
      requestSource: 'cooldown',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [new Response(null, { status: 503 }), 'service-unavailable'],
    [new Response(null, { status: 404 }), 'http-error'],
    [json({ status: 0, error_code: 429 }), 'rate-limited'],
    [json({ status: 0, error_code: 500 }), 'service-unavailable'],
    [json({ status: 0, error_code: 7 }), 'provider-failure'],
    [json({ data: { info: {} } }), 'invalid-record'],
  ])(
    'classifies upstream failure without returning the body (%s)',
    async (response, reason) => {
      const c = createKugouClient({
        fetch: vi.fn(async () => response),
        scheduler: { schedule: (start) => start() },
      });
      expect(await c.search(query)).toMatchObject({ status: 'error', reason });
    },
  );
  it('rejects invalid query text and returns a bounded unavailable-transport failure', async () => {
    const c = createKugouClient({ fetch: null });
    expect(
      await c.search({ title: 'Song\nOther', artist: 'Artist' }),
    ).toMatchObject({ reason: 'invalid-request' });
    expect(await c.search(query)).toMatchObject({
      reason: 'fetch-unavailable',
    });
  });
  it('bounds three-endpoint HTTP work, retains choices and fresh-verifies the selection', async () => {
    const hashes = ['a', 'b', 'c'].map((value) => value.repeat(32));
    const lyrics = '[ti:Song]\n[ar:Artist]\n[00:01]One\n[00:02]Two';
    const fetch = vi.fn(async (url) => {
      if (url.pathname.includes('/song'))
        return json({
          data: {
            info: hashes.map((hash) => ({
              hash,
              songname: 'Song',
              singername: 'Artist',
              duration: 180,
            })),
          },
        });
      if (url.pathname === '/search')
        return json({
          candidates: [
            {
              id: String(hashes.indexOf(url.searchParams.get('hash')) + 1),
              accesskey: 'private',
              duration: 180000,
              lrcid: 0,
            },
          ],
        });
      return json({
        content: Buffer.from(
          lyrics.replace('Two', `Two ${url.searchParams.get('id')}`),
        ).toString('base64'),
      });
    });
    const c = createKugouClient({
      fetch,
      scheduler: { schedule: (start) => start() },
    });
    const persistRecord = vi.fn().mockReturnValue({ status: 'saved' });
    const p = createKugouAcquisitionProvider({ client: c, persistRecord });
    const track = { title: 'Song', artist: 'Artist', duration: 180 };
    const first = await p.searchCandidates(track);
    expect(first).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'request-budget-exhausted',
    });
    expect(first.candidates).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(5);
    const more = await p.searchCandidates(track, { mode: 'broaden' });
    expect(more.candidates).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(7);
    const selected = more.candidates[1];
    expect(
      await p.saveCandidate({
        track,
        candidateId: selected.id,
        expectedFingerprint: selected.previewFingerprint,
        trackDir: 'unused',
      }),
    ).toMatchObject({ status: 'saved' });
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(persistRecord).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(persistRecord.mock.calls[0])).not.toMatch(
      /private|accesskey|"hash"/,
    );
  });
  it('cancels queued work and times out active subscribers without another HTTP', async () => {
    const fetch = vi.fn(() => new Promise(() => {}));
    const c = createKugouClient({
      fetch,
      scheduler: { schedule: (start) => start() },
    });
    const controller = new AbortController();
    controller.abort();
    expect(await c.search(query, { signal: controller.signal })).toMatchObject({
      reason: 'cancelled',
    });
    expect(fetch).not.toHaveBeenCalled();
    const budget = createLyricsRequestBudget('kugou', { timeoutMs: 20 });
    try {
      expect(await c.search(query, { budget })).toMatchObject({
        reason: 'timeout',
      });
    } finally {
      budget.dispose();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('coalesces concurrent identical work and caches discovery, never fresh saves', async () => {
    const fetch = vi.fn(async () => json(catalog));
    const scheduler = { schedule: (start) => start() };
    const a = createKugouClient({ fetch, scheduler });
    const b = createKugouClient({ fetch, scheduler });
    const result = await Promise.all([a.search(query), b.search(query)]);
    expect(result[0].records[0]).toMatchObject({ hash, title: 'Song' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await a.search(query);
    expect(fetch).toHaveBeenCalledTimes(1);
    await a.search(query, { fresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0];
    expect(url.origin).toBe('https://mobileservice.kugou.com');
    expect(init.redirect).toBe('error');
  });
  it('charges actual HTTP across all three routes and preserves shared Retry-After', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { 'retry-after': '60' } }),
    );
    const c = createKugouClient({
      fetch,
      scheduler: { schedule: (start) => start() },
    });
    const budget = createLyricsRequestBudget('kugou', { maxAttempts: 1 });
    try {
      expect(await c.search(query, { budget })).toMatchObject({
        reason: 'rate-limited',
      });
      expect(
        await c.search({ ...query, title: 'Other' }, { budget }),
      ).toMatchObject({ reason: 'rate-limited', requestSource: 'cooldown' });
      expect(budget.attempts).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(await c.searchLyrics(hash, { budget })).toMatchObject({
        reason: 'request-budget-exhausted',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      budget.dispose();
    }
  });
  it('shares sustained starts across instances and endpoints', async () => {
    let time = 0;
    const starts = [];
    const fetch = vi.fn(async (url) => {
      starts.push(time);
      return json(url.pathname.includes('song') ? catalog : { candidates: [] });
    });
    const options = {
      fetch,
      now: () => time,
      wait: async (ms) => {
        time += ms;
      },
    };
    const a = createKugouClient(options);
    const b = createKugouClient(options);
    await a.search(query);
    await b.searchLyrics(hash);
    await a.search({ ...query, title: 'Other' });
    expect(starts).toEqual([0, 1000, 2000]);
  });
  it('rejects hostile ids, malformed JSON, oversized bodies and invalid utf8', async () => {
    const fetch = vi.fn(async () => new Response('{bad'));
    const c = createKugouClient({
      fetch,
      scheduler: { schedule: (start) => start() },
      maxResponseBytes: 1024,
    });
    expect(await c.searchLyrics('../hash')).toMatchObject({
      reason: 'invalid-request',
    });
    expect(
      await c.download({ id: '../id', accesskey: 'x', lrcid: 0 }),
    ).toMatchObject({ reason: 'invalid-request' });
    expect(fetch).not.toHaveBeenCalled();
    expect(await c.search(query)).toMatchObject({ reason: 'invalid-json' });
    fetch.mockImplementation(async () => new Response('x'.repeat(1100)));
    expect(await c.search(query)).toMatchObject({
      reason: 'response-too-large',
    });
    fetch.mockImplementation(async () =>
      json({ content: Buffer.from([255]).toString('base64') }),
    );
    expect(
      await c.download({ id: '123', accesskey: 'x', lrcid: 0 }),
    ).toMatchObject({ reason: 'invalid-record' });
  });
});
