import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLrclibRequestScheduler } from '../electron/lib/lrclib/scheduler.js';
import { runPrivateLyricsCorpus } from './lyrics-provider-corpus-runner.mjs';
import {
  createFixedLrclibEvaluationFetch,
  createLrclibEvaluationProbe,
  toLrclibEvaluationObservation,
} from './lyrics-provider-lrclib.mjs';
import {
  createLyricsProviderProbeRegistry,
  FIXED_LYRICS_PROVIDER_DESCRIPTORS,
} from './lyrics-provider-probe-registry.mjs';

function reference(overrides = {}) {
  return {
    title: 'Synthetic Evaluation Song',
    artist: 'Synthetic Evaluation Artist',
    album: 'Synthetic Evaluation Album',
    durationSeconds: 180,
    version: 'studio',
    ...overrides,
  };
}

function candidate(overrides = {}) {
  const capability = overrides.capability || { level: 'T1', partial: false };
  const compatibility =
    overrides.compatibility ||
    (capability.level === 'T2'
      ? { t0: false, t1: true, t2: !capability.partial }
      : capability.level === 'T1'
        ? { t0: true, t1: true, t2: false }
        : { t0: true, t1: false, t2: false });
  return {
    id: 42,
    trackName: 'Synthetic Evaluation Song',
    artistName: 'Synthetic Evaluation Artist',
    albumName: 'Synthetic Evaluation Album',
    duration: 180,
    instrumental: false,
    lineCount: 2,
    segmentCount: capability.level === 'T2' ? 2 : 0,
    previewLines: [{ start: 1, text: 'PRIVATE RAW LYRIC MUST NOT CROSS' }],
    capability,
    compatibility,
    warnings: [],
    matchBand: 'exact',
    matchReasons: ['title-exact', 'artist-exact'],
    durationDelta: 0,
    durationDeltaSigned: 0,
    previewFingerprint: 'a'.repeat(64),
    ...overrides,
  };
}

function clock() {
  const values = [100, 125];
  return () => values.shift() ?? 125;
}

describe('LRCLIB evaluation observation', () => {
  it.each([
    [{ level: 'T0', partial: false }, 'T0', 'not-applicable'],
    [{ level: 'T1', partial: false }, 'T1', 'not-applicable'],
    [{ level: 'T2', partial: false }, 'T2', 'valid'],
    [{ level: 'T2', partial: true }, 'partial-T2', 'partial'],
  ])(
    'maps a reviewed provider capability truthfully: %o',
    (capability, expectedCapability, timingValidation) => {
      expect(
        toLrclibEvaluationObservation(
          {
            status: 'ok',
            candidate: candidate({ capability }),
            durationMs: 25,
          },
          { reviewVerdict: 'unreviewed' },
        ),
      ).toEqual({
        providerId: 'lrclib',
        request: { status: 'ok', durationMs: 25, failureCode: null },
        catalogStatus: 'match',
        matchBand: 'exact',
        reviewVerdict: 'unreviewed',
        capability: expectedCapability,
        timingValidation,
      });
    },
  );

  it('keeps catalog miss distinct from request failure', () => {
    expect(
      toLrclibEvaluationObservation({ status: 'miss', durationMs: 10 }),
    ).toMatchObject({
      request: { status: 'ok', failureCode: null },
      catalogStatus: 'miss',
    });
    expect(
      toLrclibEvaluationObservation({
        status: 'error',
        reason: 'timeout',
        durationMs: 20,
      }),
    ).toMatchObject({
      request: { status: 'failed', failureCode: 'timeout' },
      catalogStatus: 'not-evaluated',
    });
  });

  it.each([
    [{ status: 'ok', candidate: candidate(), durationMs: 25 }, {}],
    [{ status: 'miss', durationMs: 25, providerBody: 'PRIVATE' }, {}],
    [
      {
        status: 'error',
        reason: 'timeout',
        durationMs: 25,
        providerBody: 'PRIVATE',
      },
      {},
    ],
    [
      {
        status: 'ok',
        candidate: candidate({ matchBand: 'weak' }),
        durationMs: 25,
      },
      { reviewVerdict: 'unreviewed' },
    ],
    [{ status: 'error', reason: 'secret-provider-body', durationMs: 25 }, {}],
  ])('fails closed for malformed projection input %#', (result, options) => {
    expect(() => toLrclibEvaluationObservation(result, options)).toThrow(
      /invalid LRCLIB evaluation/i,
    );
  });
});

describe('fixed LRCLIB evaluation transport', () => {
  it('allows only the official origin and forces redirect rejection', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    const fixedFetch = createFixedLrclibEvaluationFetch(fetch);

    await fixedFetch('https://lrclib.net/api/search?track_name=Synthetic', {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect(url.origin).toBe('https://lrclib.net');
    expect(options).toMatchObject({
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });

    await expect(
      fixedFetch('https://example.invalid/api/search'),
    ).rejects.toThrow(/invalid LRCLIB evaluation origin/i);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns null when fetch is unavailable', () => {
    expect(createFixedLrclibEvaluationFetch(null)).toBeNull();
  });
});

describe('LRCLIB evaluation probe', () => {
  it('rejects ambiguous transport and injected-search options', () => {
    expect(() =>
      createLrclibEvaluationProbe({
        fetch: vi.fn(),
        searchCandidates: vi.fn(),
      }),
    ).toThrow(/invalid LRCLIB evaluation probe options/i);
  });

  it('uses the production acquisition path and reports unavailable fetch', async () => {
    const probe = createLrclibEvaluationProbe({ fetch: null, now: clock() });

    await expect(
      probe({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'fetch-unavailable' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('settles a stalled response body at the acquisition-wide deadline', async () => {
    const fetch = vi.fn(async (_url, options) => {
      const body = new ReadableStream({
        start(controller) {
          options.signal.addEventListener(
            'abort',
            () => controller.error(options.signal.reason),
            { once: true },
          );
        },
      });
      return new Response(body);
    });
    const probe = createLrclibEvaluationProbe({
      fetch,
      scheduler: createLrclibRequestScheduler({ intervalMs: 0 }),
      probeTimeoutMs: 20,
    });

    await expect(
      probe({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'timeout' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('cancels a long Retry-After scheduler wait at the probe deadline', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('', {
        status: 429,
        headers: { 'Retry-After': '60' },
      }),
    );
    const probe = createLrclibEvaluationProbe({
      fetch,
      scheduler: createLrclibRequestScheduler({ intervalMs: 0 }),
      probeTimeoutMs: 20,
    });

    await expect(
      probe({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'timeout' },
      catalogStatus: 'not-evaluated',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('composes the private reference into the existing acquisition shape and returns no provider text', async () => {
    const searchCandidates = vi.fn().mockResolvedValue({
      provider: 'lrclib',
      status: 'ok',
      candidates: [candidate()],
      groups: { best: [candidate()], related: [] },
      invalidRecordCount: 0,
    });
    const probe = createLrclibEvaluationProbe({
      searchCandidates,
      now: clock(),
    });

    const result = await probe({
      providerId: 'lrclib',
      reference: reference(),
    });

    expect(searchCandidates).toHaveBeenCalledWith({
      title: 'Synthetic Evaluation Song',
      artist: 'Synthetic Evaluation Artist',
      album: 'Synthetic Evaluation Album',
      duration: 180,
    });
    expect(result).toMatchObject({
      providerId: 'lrclib',
      catalogStatus: 'match',
      matchBand: 'exact',
      reviewVerdict: 'unreviewed',
      capability: 'T1',
      request: { durationMs: 25 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('PRIVATE RAW LYRIC');
    expect(serialized).not.toContain('Synthetic Evaluation Song');
    expect(serialized).not.toContain('previewFingerprint');
  });

  it('uses the first production-ranked candidate and preserves partial T2 truthfully', async () => {
    const probe = createLrclibEvaluationProbe({
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'lrclib',
        status: 'ok',
        candidates: [
          candidate({
            id: 2,
            matchBand: 'strong',
            capability: { level: 'T2', partial: true },
          }),
          candidate({ id: 1, capability: { level: 'T0', partial: false } }),
        ],
        groups: { best: [], related: [] },
        invalidRecordCount: 0,
      }),
      now: clock(),
    });

    await expect(
      probe({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject({
      matchBand: 'strong',
      capability: 'partial-T2',
      timingValidation: 'partial',
    });
  });

  it.each([
    [
      {
        provider: 'lrclib',
        status: 'ok',
        candidates: [],
        groups: {},
        invalidRecordCount: 0,
      },
      { request: { status: 'ok' }, catalogStatus: 'miss' },
    ],
    [
      {
        provider: 'lrclib',
        status: 'ok',
        candidates: [],
        groups: {},
        invalidRecordCount: 2,
      },
      { request: { status: 'failed', failureCode: 'invalid-record' } },
    ],
    [
      { provider: 'lrclib', status: 'error', reason: 'rate-limited' },
      { request: { status: 'failed', failureCode: 'rate-limited' } },
    ],
    [
      {
        provider: 'lrclib',
        status: 'unavailable',
        reason: 'fetch-unavailable',
      },
      { request: { status: 'failed', failureCode: 'fetch-unavailable' } },
    ],
    [
      {
        provider: 'lrclib',
        status: 'ok',
        candidates: [
          candidate({
            capability: { level: 'T2', partial: false },
            compatibility: { t0: false, t1: true, t2: false },
          }),
        ],
        groups: { best: [], related: [] },
        invalidRecordCount: 0,
      },
      { request: { status: 'failed', failureCode: 'invalid-record' } },
    ],
  ])('classifies acquisition outcome %#', async (acquisition, expected) => {
    const probe = createLrclibEvaluationProbe({
      searchCandidates: vi.fn().mockResolvedValue(acquisition),
      now: clock(),
    });
    await expect(
      probe({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject(expected);
  });

  it('treats instrumental or unsupported records as catalog misses', async () => {
    for (const capability of ['instrumental', 'unsupported']) {
      const probe = createLrclibEvaluationProbe({
        searchCandidates: vi.fn().mockResolvedValue({
          provider: 'lrclib',
          status: 'ok',
          candidates: [
            candidate({ capability: { level: capability, partial: false } }),
          ],
          groups: { best: [], related: [] },
          invalidRecordCount: 0,
        }),
        now: clock(),
      });
      await expect(
        probe({ providerId: 'lrclib', reference: reference() }),
      ).resolves.toMatchObject({ catalogStatus: 'miss' });
    }
  });

  it('sanitizes thrown errors, unknown failure reasons, and invalid probe inputs', async () => {
    const secret = 'PRIVATE ERROR BODY';
    const thrown = createLrclibEvaluationProbe({
      searchCandidates: vi.fn().mockRejectedValue(new Error(secret)),
      now: clock(),
    });
    const unknown = createLrclibEvaluationProbe({
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'lrclib',
        status: 'error',
        reason: secret,
      }),
      now: clock(),
    });

    await expect(
      thrown({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'probe-error' },
    });
    await expect(
      unknown({ providerId: 'lrclib', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'provider-failure' },
    });
    await expect(
      thrown({ providerId: 'amll', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-request' },
    });
    expect(
      JSON.stringify(
        await thrown({ providerId: 'lrclib', reference: reference() }),
      ),
    ).not.toContain(secret);
  });
});

describe('fixed lyrics provider probe registry', () => {
  it('returns a frozen LRCLIB/AMLL registry with no dynamic provider surface', () => {
    const lrclib = vi.fn();
    const amll = vi.fn();
    const registry = createLyricsProviderProbeRegistry({ lrclib, amll });

    expect(registry).toEqual({ lrclib, amll });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(FIXED_LYRICS_PROVIDER_DESCRIPTORS.map(({ id }) => id)).toEqual(
      Object.keys(registry),
    );
    expect(Object.isFrozen(FIXED_LYRICS_PROVIDER_DESCRIPTORS)).toBe(true);
  });

  it('feeds the fixed registry into the private corpus runner without exposing references', async () => {
    const privateCorpus = JSON.parse(
      fs.readFileSync(
        new URL(
          './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const lrclib = createLrclibEvaluationProbe({
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'lrclib',
        status: 'ok',
        candidates: [candidate()],
        groups: { best: [candidate()], related: [] },
        invalidRecordCount: 0,
      }),
    });
    const amll = async () => ({
      providerId: 'amll',
      request: { status: 'ok', durationMs: 10, failureCode: null },
      catalogStatus: 'miss',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
      timingValidation: 'not-applicable',
    });

    const result = await runPrivateLyricsCorpus(privateCorpus, {
      requiredCaseCount: 2,
      probes: createLyricsProviderProbeRegistry({ lrclib, amll }),
    });

    expect(result.report.providers.lrclib.summary).toMatchObject({
      observedCaseCount: 2,
      reviewedMatchCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain('Synthetic Private Title');
  });

  it.each([
    null,
    {},
    { lrclib: vi.fn() },
    { lrclib: vi.fn(), amll: vi.fn(), dynamic: vi.fn() },
    { lrclib: null, amll: vi.fn() },
  ])('rejects invalid or dynamic registry input %#', (value) => {
    expect(() => createLyricsProviderProbeRegistry(value)).toThrow(
      /fixed lyrics provider probe registry/i,
    );
  });
});
