import { describe, expect, it, vi } from 'vitest';

import {
  WIKIDATA_DISCOVERY_QUERIES,
  fetchWikidataCandidateSeeds,
} from './lyrics-provider-corpus-sources.mjs';

const MBID = '00000000-0000-4000-8000-000000000001';

function wikidataResponse(type = 'artist') {
  const variable = type;
  return new Response(
    JSON.stringify({
      head: { vars: [variable, `${variable}Mbid`] },
      results: {
        bindings: [
          {
            [variable]: {
              type: 'uri',
              value: `http://www.wikidata.org/entity/${
                type === 'artist' ? 'Q123' : 'Q456'
              }`,
            },
            [`${variable}Mbid`]: { type: 'literal', value: MBID },
          },
        ],
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/sparql-results+json' },
    },
  );
}

describe('lyrics candidate open-metadata sources', () => {
  it('defines five fixed discovery queries without geography predicates', () => {
    expect(Object.keys(WIKIDATA_DISCOVERY_QUERIES)).toEqual([
      'chinese-rap',
      'chinese-pop',
      'english-catalog',
      'japanese-catalog',
      'korean-catalog',
    ]);
    for (const definition of Object.values(WIKIDATA_DISCOVERY_QUERIES)) {
      expect(definition.query).not.toMatch(
        /\bP27\b|\bP495\b|citizenship|country/iu,
      );
      expect(definition.query).toMatch(/LIMIT 250/u);
    }
  });

  it('uses work-level language plus genre for Chinese recording recall', () => {
    for (const id of ['chinese-rap', 'chinese-pop']) {
      const definition = WIKIDATA_DISCOVERY_QUERIES[id];
      expect(definition.seedType).toBe('work');
      expect(definition.query).toMatch(/P407/u);
      expect(definition.query).toMatch(/Q7850/u);
      expect(definition.query).toMatch(/Q9192/u);
      expect(definition.query).toMatch(/Q9186/u);
    }
    expect(WIKIDATA_DISCOVERY_QUERIES['chinese-rap'].query).toMatch(/Q11401/u);
    expect(WIKIDATA_DISCOVERY_QUERIES['chinese-pop'].query).toMatch(/Q37073/u);
  });

  it('uses work-level language seeds for English, Japanese, and Korean', () => {
    expect(WIKIDATA_DISCOVERY_QUERIES['english-catalog']).toEqual(
      expect.objectContaining({ seedType: 'work' }),
    );
    expect(WIKIDATA_DISCOVERY_QUERIES['english-catalog'].query).toMatch(
      /Q1860/u,
    );
    expect(WIKIDATA_DISCOVERY_QUERIES['japanese-catalog'].query).toMatch(
      /Q5287/u,
    );
    expect(WIKIDATA_DISCOVERY_QUERIES['korean-catalog'].query).toMatch(
      /Q9176/u,
    );
  });

  it('fetches only the fixed Wikidata endpoint with bounded request options', async () => {
    const fetchFn = vi.fn(async () => wikidataResponse('work'));
    const seeds = await fetchWikidataCandidateSeeds('chinese-rap', { fetchFn });

    expect(seeds).toEqual([
      {
        stratum: 'chinese-rap',
        seedType: 'work',
        wikidataId: 'Q456',
        musicbrainzId: MBID,
      },
    ]);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, options] = fetchFn.mock.calls[0];
    expect(new URL(url).origin).toBe('https://query.wikidata.org');
    expect(new URL(url).pathname).toBe('/sparql');
    expect(new URL(url).searchParams.get('query')).toBe(
      WIKIDATA_DISCOVERY_QUERIES['chinese-rap'].query,
    );
    expect(options).toEqual(
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          accept: 'application/sparql-results+json',
          'user-agent': expect.stringContaining('Utawakui'),
        }),
      }),
    );
  });

  it('parses work seeds and sorts/deduplicates source identifiers', async () => {
    const duplicate = await wikidataResponse('work').json();
    duplicate.results.bindings.push(duplicate.results.bindings[0]);
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify(duplicate), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(
      fetchWikidataCandidateSeeds('english-catalog', { fetchFn }),
    ).resolves.toEqual([
      {
        stratum: 'english-catalog',
        seedType: 'work',
        wikidataId: 'Q456',
        musicbrainzId: MBID,
      },
    ]);
  });

  it.each([
    ['unknown', async () => wikidataResponse('work'), /stratum/i],
    [
      'chinese-rap',
      async () => new Response('{}', { status: 400 }),
      /request failed/i,
    ],
    [
      'chinese-rap',
      async () =>
        new Response('{', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      /invalid JSON/i,
    ],
    [
      'chinese-rap',
      async () =>
        new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-length': '2000001',
          },
        }),
      /too large/i,
    ],
  ])(
    'rejects unsafe or malformed discovery responses',
    async (id, fetchFn, error) => {
      await expect(
        fetchWikidataCandidateSeeds(id, { fetchFn }),
      ).rejects.toThrow(error);
    },
  );

  it('enforces the streamed body limit when content-length is absent', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2_000_001));
            },
            cancel() {
              throw new Error('private stream cancellation failure');
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn }),
    ).rejects.toThrow(/too large/i);
  });

  it('retries bounded transient Wikidata failures', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(wikidataResponse('work'));
    const waitFn = vi.fn(async () => undefined);

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn, waitFn }),
    ).resolves.toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(waitFn).toHaveBeenCalledWith(1_000);
  });

  it('retries a Wikidata body transport failure after headers arrive', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('private body transport failure'));
            },
          }),
        ),
      )
      .mockResolvedValueOnce(wikidataResponse('work'));
    const waitFn = vi.fn(async () => undefined);

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn, waitFn }),
    ).resolves.toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(waitFn).toHaveBeenCalledWith(1_000);
  });

  it('retries a Wikidata transport rejection before headers arrive', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('private transport failure'))
      .mockResolvedValueOnce(wikidataResponse('work'));
    const waitFn = vi.fn(async () => undefined);

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn, waitFn }),
    ).resolves.toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(waitFn).toHaveBeenCalledWith(1_000);
  });

  it('bounds Wikidata retry exhaustion and fallback delays', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 503 }));
    const waitFn = vi.fn(async () => undefined);

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn, waitFn }),
    ).rejects.toThrow(/request failed/i);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(waitFn.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it('caps Wikidata Retry-After before retrying a 429', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          headers: { 'retry-after': '120' },
        }),
      )
      .mockResolvedValueOnce(wikidataResponse('work'));
    const waitFn = vi.fn(async () => undefined);

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn, waitFn }),
    ).resolves.toHaveLength(1);
    expect(waitFn).toHaveBeenCalledWith(60_000);
  });

  it('cancels declared-oversize and non-success response bodies', async () => {
    const cancellations = [];
    const responseWithPendingBody = (status, headers = {}) =>
      new Response(
        new ReadableStream({
          cancel() {
            cancellations.push(status);
          },
        }),
        { status, headers },
      );

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', {
        fetchFn: async () => responseWithPendingBody(400),
      }),
    ).rejects.toThrow(/request failed/i);
    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', {
        fetchFn: async () =>
          responseWithPendingBody(200, { 'content-length': '2000001' }),
      }),
    ).rejects.toThrow(/too large/i);
    expect(cancellations).toEqual([400, 200]);
  });

  it('rejects malformed binding schemas', async () => {
    const value = await wikidataResponse('work').json();
    value.results.bindings[0].unexpected = {
      type: 'literal',
      value: 'private',
    };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(value)));

    await expect(
      fetchWikidataCandidateSeeds('chinese-rap', { fetchFn }),
    ).rejects.toThrow(/binding.*fields/i);
  });

  it('aborts the complete request after the fixed timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(
        async (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      );
      const pending = fetchWikidataCandidateSeeds('chinese-rap', { fetchFn });
      const expectation = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(30_000);
      await expectation;
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timeout active while a response body is stalled', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(
        async (_url, { signal }) =>
          new Response(
            new ReadableStream({
              start(controller) {
                signal.addEventListener(
                  'abort',
                  () => controller.error(signal.reason),
                  { once: true },
                );
              },
            }),
            { status: 200 },
          ),
      );
      const pending = fetchWikidataCandidateSeeds('chinese-rap', { fetchFn });
      const expectation = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(30_000);
      await expectation;
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
