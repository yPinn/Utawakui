import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as yaml from 'js-yaml';
import { createLrclibClient } from '../electron/lib/lrclib/client.js';
import { createNeteaseClient } from '../electron/lib/netease/client.js';
import { analyzeNeteaseLyrics } from '../electron/lib/netease/yrc.js';
import {
  createContractRecorder,
  createContractReplay,
  sanitizeProviderPayload,
  saveContractCassette,
  loadContractCassette,
  probeProvider,
} from './lyrics-provider-contracts.mjs';

const folders = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const folder of folders.splice(0))
    fs.rmSync(folder, { recursive: true, force: true });
});
const scheduler = { schedule: (operation) => operation(), deferFor: () => {} };
const query = { trackName: 'Contract song', artistName: 'Contract artist' };
function record() {
  return {
    id: 42,
    trackName: 'Private title',
    artistName: 'Private artist',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Private words\nSecond line',
    syncedLyrics:
      '[offset:+120]\n[00:01.00][00:05.00]Private words\n[00:03.00]Second line',
  };
}
function cassette(records, provider = 'lrclib') {
  return {
    schemaVersion: 1,
    provider,
    recordedAt: '2026-10-19T00:00:00.000Z',
    records,
  };
}

describe('provider response sanitization', () => {
  it('removes all free text while retaining timestamps, nulls, types and unknown field structure', () => {
    const original = {
      ...record(),
      optional: null,
      newField: { secret: 'token-private', number: 12 },
    };
    const clean = sanitizeProviderPayload(original);
    expect(JSON.stringify(clean)).not.toMatch(/Private|Second|token-private/);
    expect(clean.syncedLyrics).toBe(
      '[offset:+120]\n[00:01.00][00:05.00]xxxxxxx xxxxx\n[00:03.00]xxxxxx xxxx',
    );
    expect(clean).toMatchObject({
      id: 42,
      duration: 180,
      optional: null,
      newField: { number: 12 },
    });
    expect(original.trackName).toBe('Private title');
    expect(sanitizeProviderPayload(clean)).toEqual(clean);
  });

  it('retains YRC timing tuples and UTF-16 text lengths, including metadata JSON', () => {
    const raw = {
      yrc: {
        lyric:
          '{"t":0,"c":[{"tx":"Private credit"}]}\n[1000,2000](1000,1000,0)秘密(2000,1000,0)😀',
      },
    };
    const clean = sanitizeProviderPayload(raw);
    expect(clean.yrc.lyric).not.toMatch(/Private|秘密|😀/);
    expect(clean.yrc.lyric).toContain(
      '[1000,2000](1000,1000,0)xx(2000,1000,0)xx',
    );
    expect(
      analyzeNeteaseLyrics({ yrcLyrics: clean.yrc.lyric, lrcLyrics: '' })
        .capability.level,
    ).toBe('T2');
  });

  it('scrubs lyricsfile YAML without losing its word boundaries or format version', () => {
    const source =
      "version: '1.0'\nmetadata:\n  title: Secret\n  language: en\nlines:\n  - text: 'Secret words'\n    start_ms: 1000\n    end_ms: 2000\n    words:\n      - text: 'Secret '\n        start_ms: 1000\n        end_ms: 1500\n      - text: words\n        start_ms: 1500\n        end_ms: 2000\nplain: Secret words\n";
    const clean = sanitizeProviderPayload({ lyricsfile: source });
    expect(clean.lyricsfile).not.toMatch(/Secret/);
    const doc = yaml.load(clean.lyricsfile);
    expect(doc.version).toBe('1.0');
    expect(doc.lines[0].words.map((word) => word.text).join('')).toBe(
      doc.lines[0].text,
    );
    expect(doc.lines[0].words[1].start_ms).toBe(1500);
  });

  it('fails closed on oversized, deeply nested, aliased or tagged inputs', () => {
    expect(() =>
      sanitizeProviderPayload({ text: 'x'.repeat(4 * 1024 * 1024) }),
    ).toThrow(/budget/);
    let value = 'secret';
    for (let i = 0; i < 30; i++) value = { child: value };
    expect(() => sanitizeProviderPayload(value)).toThrow(/budget/);
    expect(() =>
      sanitizeProviderPayload({ lyricsfile: 'a: &a secret\nb: *a' }),
    ).toThrow(/YAML/);
    expect(() =>
      sanitizeProviderPayload({ lyricsfile: 'a: !!str secret' }),
    ).toThrow(/YAML/);
  });
});

describe('record and offline replay through production clients', () => {
  it('records sanitized responses, strips headers and exactly matches request query', async () => {
    const live = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(record()), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'secret-cookie',
          Authorization: 'secret-token',
        },
      }),
    );
    const recorder = createContractRecorder('lrclib', live);
    const client = createLrclibClient({ fetch: recorder.fetch, scheduler });
    expect((await client.getExact(query)).status).toBe('ok');
    const data = recorder.snapshot();
    expect(JSON.stringify(data)).not.toMatch(
      /Private|Contract song|secret-cookie|secret-token|Authorization|https:/,
    );
    const replay = createContractReplay(data);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network forbidden');
      }),
    );
    const offline = createLrclibClient({ fetch: replay.fetch, scheduler });
    expect((await offline.getExact(query)).status).toBe('ok');
    replay.assertConsumed();
    await expect(
      replay.fetch(new URL('https://lrclib.net/api/get?track_name=changed')),
    ).rejects.toThrow(/unrecorded/);
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('matches POST fields independent of field order and rejects changed values', async () => {
    const body = {
      code: 200,
      lrc: { lyric: '[00:01.00]Secret' },
      yrc: { lyric: '[1000,1000](1000,1000,0)Secret' },
    };
    const recorder = createContractRecorder(
      'netease',
      async () => new Response(JSON.stringify(body)),
    );
    const client = createNeteaseClient({ fetch: recorder.fetch, scheduler });
    expect((await client.getLyrics(42)).status).toBe('ok');
    const data = recorder.snapshot();
    const reordered = createContractReplay(data);
    const fields = new URLSearchParams({
      yrv: '0',
      ytv: '0',
      yv: '0',
      kv: '0',
      rv: '0',
      lv: '0',
      tv: '0',
      cp: 'false',
      id: '42',
    });
    expect(
      (
        await reordered.fetch(
          new URL('https://interface.music.163.com/api/song/lyric/v1'),
          { method: 'POST', body: fields },
        )
      ).status,
    ).toBe(200);
    reordered.assertConsumed();
    const replay = createContractReplay(data);
    const result = await createNeteaseClient({
      fetch: replay.fetch,
      scheduler,
    }).getLyrics(42);
    expect(result.status).toBe('ok');
    expect(analyzeNeteaseLyrics(result.record).capability.level).toBe('T2');
    replay.assertConsumed();
    const mismatch = createContractReplay(data);
    expect(
      (
        await createNeteaseClient({
          fetch: mismatch.fetch,
          scheduler,
        }).getLyrics(43)
      ).status,
    ).toBe('error');
    expect(() => mismatch.assertConsumed()).toThrow(/unconsumed/);
  });

  it('rejects non-allowlisted destinations before transport and refuses credentials', async () => {
    const transport = vi.fn();
    const recorder = createContractRecorder('lrclib', transport);
    for (const url of [
      'http://lrclib.net/api/get',
      'https://example.com/api/get',
      'https://lrclib.net/other',
      'https://user:pass@lrclib.net/api/get',
    ])
      await expect(recorder.fetch(new URL(url))).rejects.toThrow(/request/);
    await expect(
      recorder.fetch(new URL('https://lrclib.net/api/get'), {
        headers: { Cookie: 'private' },
      }),
    ).rejects.toThrow(/request/);
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not persist malformed JSON, oversized bodies or transport failures', async () => {
    for (const fetch of [
      async () => new Response('secret-not-json'),
      async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)),
      async () => {
        throw new Error('private host');
      },
    ]) {
      const recorder = createContractRecorder('lrclib', fetch);
      await expect(
        recorder.fetch(new URL('https://lrclib.net/api/get')),
      ).rejects.toThrow();
      expect(recorder.snapshot().records).toEqual([]);
    }
  });

  it('rejects invalid providers, unsafe keys, invalid lyric JSON and exhausted record budgets', async () => {
    expect(() => createContractRecorder('unknown')).toThrow(/provider/);
    expect(() => sanitizeProviderPayload({ 'private-key': 'secret' })).toThrow(
      /field/,
    );
    expect(() =>
      sanitizeProviderPayload({ lyric: '{not json secret}' }),
    ).toThrow(/metadata/);
    const recorder = createContractRecorder(
      'lrclib',
      async () => new Response('{}'),
    );
    for (let i = 0; i < 20; i++)
      await recorder.fetch(new URL('https://lrclib.net/api/get'));
    await expect(
      recorder.fetch(new URL('https://lrclib.net/api/get')),
    ).rejects.toThrow(/budget/);
    await expect(probeProvider('unknown')).rejects.toThrow(/provider/);
    await expect(
      probeProvider('lrclib', {
        fetch: async () => new Response(JSON.stringify([record()])),
        scheduler,
      }),
    ).rejects.toThrow(/detail/);
  });

  it('replays retries in sequence and reports unused or exhausted recordings', async () => {
    const live = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(record())));
    const recorder = createContractRecorder('lrclib', live);
    await createLrclibClient({ fetch: recorder.fetch, scheduler }).getExact(
      query,
    );
    const replay = createContractReplay(recorder.snapshot());
    expect(() => replay.assertConsumed()).toThrow(/unconsumed/);
    expect(
      (
        await createLrclibClient({ fetch: replay.fetch, scheduler }).getExact(
          query,
        )
      ).status,
    ).toBe('ok');
    replay.assertConsumed();
    await expect(
      replay.fetch(new URL('https://lrclib.net/api/get')),
    ).rejects.toThrow(/unrecorded/);
  });

  it('detects a recorded provider schema drift through the real normalizer', async () => {
    const recorder = createContractRecorder(
      'lrclib',
      async () =>
        new Response(JSON.stringify({ ...record(), trackName: null })),
    );
    await recorder.fetch(new URL('https://lrclib.net/api/get'));
    const replay = createContractReplay(recorder.snapshot());
    expect(
      (
        await createLrclibClient({ fetch: replay.fetch, scheduler }).getExact(
          {},
        )
      ).status,
    ).toBe('error');
    // Use the exact captured request to exercise normalization, not a key mismatch.
    const response = await replay.fetch(new URL('https://lrclib.net/api/get'));
    const client = createLrclibClient({
      fetch: async () => response,
      scheduler,
    });
    expect(await client.getExact(query)).toMatchObject({
      status: 'error',
      reason: 'invalid-record',
    });
  });
});

describe('cassette files and committed live contracts', () => {
  it('refuses overwrite, missing files, wrong versions and unsanitized strings', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-contract-'));
    folders.push(folder);
    const file = path.join(folder, 'contract.json');
    const data = cassette([]);
    saveContractCassette(file, data);
    expect(loadContractCassette(file)).toEqual(data);
    expect(() => saveContractCassette(file, data)).toThrow();
    expect(() =>
      loadContractCassette(path.join(folder, 'missing.json')),
    ).toThrow();
    expect(() => createContractReplay({ ...data, schemaVersion: 99 })).toThrow(
      /cassette/,
    );
    expect(() =>
      createContractReplay({
        ...data,
        records: [
          {
            key: 'x',
            status: 200,
            headers: {},
            body: { secret: 'private words' },
          },
        ],
      }),
    ).toThrow(/cassette/);
  });

  it('rejects oversized files and unsafe headers', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-contract-'));
    folders.push(folder);
    const file = path.join(folder, 'too-large.json');
    fs.writeFileSync(file, ' '.repeat(8 * 1024 * 1024 + 1));
    expect(() => loadContractCassette(file)).toThrow(/budget/);
    const live = createContractRecorder(
      'lrclib',
      async () => new Response(JSON.stringify(record())),
    );
    await live.fetch(new URL('https://lrclib.net/api/get'));
    const data = live.snapshot();
    data.records[0].headers.cookie = 'secret';
    expect(() => createContractReplay(data)).toThrow(/cassette/);
  });

  it('replays HTTP misses without saving an untrusted error body', async () => {
    const recorder = createContractRecorder(
      'lrclib',
      async () => new Response('private provider failure', { status: 404 }),
    );
    expect(
      await createLrclibClient({ fetch: recorder.fetch, scheduler }).getExact(
        query,
      ),
    ).toMatchObject({ status: 'unavailable', reason: 'not-found' });
    const data = recorder.snapshot();
    expect(data.records[0].body).toBeNull();
    const replay = createContractReplay(data);
    expect(
      await createLrclibClient({ fetch: replay.fetch, scheduler }).getExact(
        query,
      ),
    ).toMatchObject({ status: 'unavailable', reason: 'not-found' });
    replay.assertConsumed();
  });

  it.each(['lrclib', 'netease'])(
    'replays the checked-in %s capture without any network fallback',
    async (provider) => {
      const data = loadContractCassette(
        new URL(
          `./fixtures/lyrics-provider-contracts/${provider}.json`,
          import.meta.url,
        ),
      );
      expect(data.provider).toBe(provider);
      const network = vi.fn(() => {
        throw new Error('network forbidden');
      });
      vi.stubGlobal('fetch', network);
      const replay = createContractReplay(data);
      await probeProvider(provider, { fetch: replay.fetch, scheduler });
      replay.assertConsumed();
      expect(network).not.toHaveBeenCalled();
    },
  );
});
