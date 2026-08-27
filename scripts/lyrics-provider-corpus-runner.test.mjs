import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  runPrivateLyricsCorpus,
  validatePrivateLyricsCorpus,
} from './lyrics-provider-corpus-runner.mjs';

function observation(providerId, overrides = {}) {
  return {
    providerId,
    request: {
      status: overrides.requestStatus || 'ok',
      durationMs: overrides.durationMs ?? 25,
      failureCode: overrides.failureCode ?? null,
    },
    catalogStatus: overrides.catalogStatus || 'match',
    matchBand:
      overrides.matchBand === undefined ? 'exact' : overrides.matchBand,
    reviewVerdict:
      overrides.reviewVerdict === undefined
        ? 'correct'
        : overrides.reviewVerdict,
    capability:
      overrides.capability === undefined ? 'T1' : overrides.capability,
    timingValidation: overrides.timingValidation || 'not-applicable',
  };
}

function corpus() {
  return {
    schemaVersion: 1,
    corpusId: 'lyrics-provider-private-synthetic-v1',
    baselineProviderId: 'lrclib',
    providers: [
      {
        id: 'lrclib',
        mode: 'baseline',
        profileId: 'lrclib-http-v1',
        accessMode: 'none',
        tokenRefresh: 'not-required',
        boundedPayload: true,
      },
      {
        id: 'amll',
        mode: 'candidate',
        profileId: 'amll-http-v1',
        accessMode: 'none',
        tokenRefresh: 'not-required',
        boundedPayload: true,
      },
    ],
    acceptance: {
      minimumCases: 2,
      requiredTags: [
        { tag: 'english-catalog', minimumCases: 1 },
        { tag: 'chinese-pop', minimumCases: 1 },
      ],
      minimumReviewedMatches: 1,
      minimumRequestSuccessRate: 0.5,
      maximumFalseMatchRate: 0.1,
      minimumIncrementalCoverageRate: 0.5,
      minimumUniqueValidT2Count: 1,
    },
    cases: [
      {
        id: 'case-001',
        tags: ['english', 'english-catalog', 'mainstream', 'studio'],
        goldStatus: 'reviewed',
        reference: {
          title: 'Synthetic Private Title One',
          artist: 'Synthetic Private Artist',
          album: 'Synthetic Private Album',
          durationSeconds: 180,
          version: 'studio',
        },
      },
      {
        id: 'case-002',
        tags: ['mandarin', 'chinese-pop', 'long-tail', 'live'],
        goldStatus: 'reviewed',
        reference: {
          title: '合成私有標題二',
          artist: '合成私有歌手',
          album: null,
          durationSeconds: 220,
          version: 'live',
        },
      },
    ],
  };
}

function fullCorpus() {
  const value = corpus();
  const strata = [
    ['chinese-rap', 'mandarin'],
    ['chinese-pop', 'mandarin'],
    ['english-catalog', 'english'],
    ['japanese-catalog', 'japanese'],
    ['korean-catalog', 'korean'],
  ];
  value.acceptance.minimumCases = 40;
  value.acceptance.minimumReviewedMatches = 20;
  value.acceptance.requiredTags = strata.map(([tag]) => ({
    tag,
    minimumCases: 8,
  }));
  value.cases = strata.flatMap((tags, stratumIndex) =>
    Array.from({ length: 8 }, (_, caseIndex) => ({
      id: `case-${String(stratumIndex * 8 + caseIndex + 1).padStart(3, '0')}`,
      tags: [
        ...tags,
        caseIndex < 7 ? 'mainstream' : 'long-tail',
        'studio',
        'recent-release',
      ],
      goldStatus: 'reviewed',
      reference: {
        title: `Synthetic title ${stratumIndex}-${caseIndex}`,
        artist: `Synthetic artist ${stratumIndex}-${caseIndex}`,
        album: null,
        durationSeconds: 180,
        version: 'studio',
      },
    })),
  );
  return value;
}

describe('private lyrics corpus validation', () => {
  it('requires 40 cases by default but permits an explicit synthetic test size', () => {
    expect(() => validatePrivateLyricsCorpus(corpus())).toThrow(/40 cases/i);
    expect(
      validatePrivateLyricsCorpus(corpus(), { requiredCaseCount: 2 }),
    ).toEqual(corpus());
  });

  it('accepts the committed synthetic non-song corpus fixture', () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        new URL(
          './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(
      validatePrivateLyricsCorpus(fixture, { requiredCaseCount: 2 }),
    ).toEqual(fixture);
  });

  it('accepts an exactly 40-case corpus through the production default', () => {
    expect(validatePrivateLyricsCorpus(fullCorpus()).cases).toHaveLength(40);
  });

  it('requires exactly 8 cases in each owner-approved corpus stratum', () => {
    const value = fullCorpus();
    value.cases[0].tags = value.cases[0].tags.map((tag) =>
      tag === 'chinese-rap' ? 'chinese-pop' : tag,
    );
    expect(() => validatePrivateLyricsCorpus(value)).toThrow(
      /exactly 8 cases/i,
    );
  });

  it('requires exactly 7 mainstream and 1 long-tail case per stratum', () => {
    const value = fullCorpus();
    value.cases[7].tags = value.cases[7].tags.map((tag) =>
      tag === 'long-tail' ? 'mainstream' : tag,
    );
    value.cases[8].tags = value.cases[8].tags.map((tag) =>
      tag === 'mainstream' ? 'long-tail' : tag,
    );
    expect(() => validatePrivateLyricsCorpus(value)).toThrow(
      /7 mainstream.*1 long-tail/i,
    );
  });

  it('requires every production case to be confirmed as a 2010+ release', () => {
    const value = fullCorpus();
    value.cases[0].tags = value.cases[0].tags.filter(
      (tag) => tag !== 'recent-release',
    );
    expect(() => validatePrivateLyricsCorpus(value)).toThrow(/recent-release/i);
  });

  it.each([
    [(value) => (value.corpusId = 'private-song-title'), /opaque corpus id/i],
    [(value) => (value.cases = null), /cases must be an array/i],
    [(value) => (value.cases[0].path = 'C:\\private\\song.mp3'), /fields/i],
    [(value) => (value.cases[0].reference.url = 'https://secret'), /fields/i],
    [(value) => (value.cases[0].lyrics = 'private lyrics'), /fields/i],
    [(value) => (value.cases[0].goldStatus = 'draft'), /gold status/i],
    [(value) => (value.cases[0].id = 'famous-song-title'), /opaque case id/i],
    [(value) => value.cases[0].tags.push('private-title'), /controlled tags/i],
    [(value) => value.cases[0].tags.push('mainland-china'), /controlled tags/i],
    [
      (value) => value.cases[0].tags.push('long-tail'),
      /exactly one catalog reach/i,
    ],
    [
      (value) =>
        (value.cases[0].tags = value.cases[0].tags.map((tag) =>
          tag === 'english' ? 'mandarin' : tag,
        )),
      /language.*stratum/i,
    ],
    [
      (value) => value.cases[0].tags.push('multilingual'),
      /exactly one language/i,
    ],
    [
      (value) =>
        (value.cases[0].tags = value.cases[0].tags.map((tag) =>
          tag === 'mainstream' ? 'independent' : tag,
        )),
      /controlled tags/i,
    ],
    [
      (value) =>
        (value.cases[0].tags = value.cases[0].tags.filter(
          (tag) => tag !== 'english-catalog',
        )),
      /corpus stratum/i,
    ],
    [(value) => value.cases[0].tags.push('chinese-pop'), /corpus stratum/i],
    [
      (value) =>
        (value.cases[0].tags = ['english-catalog', 'mainstream', 'studio']),
      /language tag/i,
    ],
    [
      (value) =>
        (value.cases[0].tags = ['english', 'english-catalog', 'studio']),
      /catalog reach tag/i,
    ],
    [
      (value) =>
        (value.cases[0].tags = ['english', 'english-catalog', 'mainstream']),
      /version tag must match/i,
    ],
    [
      (value) => (value.cases[0].reference.version = 'remix'),
      /version tag must match/i,
    ],
    [(value) => value.cases[0].tags.push('remix'), /version tag must match/i],
    [(value) => (value.cases[1].id = 'case-001'), /case ids/i],
    [(value) => (value.providers[0].credential = 'secret'), /fields/i],
    [(value) => (value.providers[1].id = 'private-title'), /provider id/i],
    [
      (value) => (value.providers[1].profileId = 'private-title'),
      /profile id/i,
    ],
    [
      (value) => (value.acceptance.requiredTags[0].tag = 'private-title'),
      /controlled required tags/i,
    ],
    [
      (value) => {
        value.baselineProviderId = 'amll';
        value.providers[0].mode = 'candidate';
        value.providers[1].mode = 'baseline';
      },
      /LRCLIB baseline/i,
    ],
    [
      (value) => {
        value.providers[0] = {
          ...value.providers[0],
          id: 'netease',
          profileId: 'netease-yrc-reverse-v1',
        };
      },
      /LRCLIB baseline/i,
    ],
    [
      (value) => (value.acceptance.requiredTags[0].tag = 'cantonese'),
      /required tag must occur/i,
    ],
  ])('rejects private corpus boundary violations %#', (mutate, pattern) => {
    const value = corpus();
    mutate(value);
    expect(() =>
      validatePrivateLyricsCorpus(value, { requiredCaseCount: 2 }),
    ).toThrow(pattern);
  });
});

describe('private lyrics corpus runner', () => {
  it('runs all 40 private cases through every declared probe', async () => {
    const result = await runPrivateLyricsCorpus(fullCorpus(), {
      probes: {
        lrclib: async () => observation('lrclib'),
        amll: async () => observation('amll'),
      },
    });

    expect(result.run).toEqual({
      caseCount: 40,
      providerCount: 2,
      observationCount: 80,
    });
    expect(result.cases).toHaveLength(40);
    expect(JSON.stringify(result)).not.toContain('Synthetic Private Title');
  });

  it('keeps private references in memory and returns only opaque cases plus aggregates', async () => {
    const seen = [];
    const result = await runPrivateLyricsCorpus(corpus(), {
      requiredCaseCount: 2,
      probes: {
        lrclib: async (input) => {
          seen.push(structuredClone(input));
          return observation('lrclib');
        },
        amll: async (input) => {
          seen.push(structuredClone(input));
          return observation('amll', {
            capability: 'T2',
            timingValidation: 'valid',
          });
        },
      },
    });

    expect(seen).toHaveLength(4);
    expect(seen[0]).toMatchObject({
      caseId: 'case-001',
      tags: ['english', 'english-catalog', 'mainstream', 'studio'],
      reference: { title: 'Synthetic Private Title One' },
    });
    expect(result).toMatchObject({
      schemaVersion: 1,
      corpusId: 'lyrics-provider-private-synthetic-v1',
      baselineProviderId: 'lrclib',
      run: { caseCount: 2, providerCount: 2, observationCount: 4 },
      cases: [
        {
          id: 'case-001',
          tags: ['english', 'english-catalog', 'mainstream', 'studio'],
        },
        {
          id: 'case-002',
          tags: ['mandarin', 'chinese-pop', 'long-tail', 'live'],
        },
      ],
      report: { benchmarkId: 'lyrics-provider-private-synthetic-v1' },
    });
    const serialized = JSON.stringify(result);
    for (const privateValue of [
      'Synthetic Private Title One',
      'Synthetic Private Artist',
      'Synthetic Private Album',
      '合成私有標題二',
      '合成私有歌手',
      'durationSeconds',
      'reference',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('enforces bounded concurrency and preserves deterministic case/provider order', async () => {
    let active = 0;
    let maximumActive = 0;
    const probe = async ({ providerId }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(providerId === 'lrclib' ? 8 : 1);
      active -= 1;
      return observation(providerId);
    };

    const result = await runPrivateLyricsCorpus(corpus(), {
      requiredCaseCount: 2,
      concurrency: 2,
      probes: { lrclib: probe, amll: probe },
    });

    expect(maximumActive).toBe(2);
    expect(result.cases.map(({ id }) => id)).toEqual(['case-001', 'case-002']);
    expect(
      result.cases.flatMap(({ observations }) =>
        observations.map(({ providerId }) => providerId),
      ),
    ).toEqual(['lrclib', 'amll', 'lrclib', 'amll']);
  });

  it('isolates thrown, malformed, and provider-timed-out probes without exposing error text', async () => {
    const secret = 'Synthetic Private Title One';
    const thrown = await runPrivateLyricsCorpus(corpus(), {
      requiredCaseCount: 2,
      probes: {
        lrclib: vi
          .fn()
          .mockRejectedValueOnce(new Error(`failed for ${secret}`))
          .mockResolvedValueOnce(observation('wrong-provider')),
        amll: vi
          .fn()
          .mockResolvedValueOnce(
            observation('amll', {
              requestStatus: 'failed',
              failureCode: 'timeout',
              catalogStatus: 'not-evaluated',
              matchBand: null,
              reviewVerdict: null,
              capability: null,
            }),
          )
          .mockResolvedValueOnce(
            observation('amll', {
              catalogStatus: 'miss',
              matchBand: null,
              reviewVerdict: null,
              capability: null,
            }),
          ),
      },
    });

    expect(
      thrown.cases.flatMap(({ observations }) =>
        observations.map(({ request }) => request.failureCode),
      ),
    ).toEqual(['probe-error', 'timeout', 'invalid-observation', null]);
    expect(JSON.stringify(thrown)).not.toContain(secret);
    expect(thrown.report.providers.lrclib.summary).toMatchObject({
      requestFailureCount: 2,
      catalogMissCount: 0,
    });
    expect(thrown.report.providers.amll.summary).toMatchObject({
      requestFailureCount: 1,
      catalogMissCount: 1,
    });
  });

  it('replaces an unapproved provider failure code instead of reflecting it', async () => {
    const secretFailure = 'synthetic-private-title-one';
    const result = await runPrivateLyricsCorpus(corpus(), {
      requiredCaseCount: 2,
      probes: {
        lrclib: async () =>
          observation('lrclib', {
            requestStatus: 'failed',
            failureCode: secretFailure,
            catalogStatus: 'not-evaluated',
            matchBand: null,
            reviewVerdict: null,
            capability: null,
          }),
        amll: async () => observation('amll'),
      },
    });

    expect(result.cases[0].observations[0].request.failureCode).toBe(
      'invalid-observation',
    );
    expect(JSON.stringify(result)).not.toContain(secretFailure);
  });

  it('rejects missing, extra, and non-function provider probes', async () => {
    await expect(
      runPrivateLyricsCorpus(corpus(), {
        requiredCaseCount: 2,
        probes: null,
      }),
    ).rejects.toThrow(/provider probes/i);
    await expect(
      runPrivateLyricsCorpus(corpus(), {
        requiredCaseCount: 2,
        probes: { lrclib: async () => observation('lrclib') },
      }),
    ).rejects.toThrow(/provider probes/i);
    await expect(
      runPrivateLyricsCorpus(corpus(), {
        requiredCaseCount: 2,
        probes: {
          lrclib: async () => observation('lrclib'),
          amll: async () => observation('amll'),
          extra: async () => observation('extra'),
        },
      }),
    ).rejects.toThrow(/provider probes/i);
    await expect(
      runPrivateLyricsCorpus(corpus(), {
        requiredCaseCount: 2,
        probes: { lrclib: null, amll: async () => observation('amll') },
      }),
    ).rejects.toThrow(/provider probes/i);
  });

  it.each([
    ['requiredCaseCount', 0],
    ['requiredCaseCount', 201],
    ['concurrency', 0],
    ['concurrency', 5],
  ])('rejects an invalid bounded option: %s=%s', async (key, value) => {
    await expect(
      runPrivateLyricsCorpus(corpus(), {
        requiredCaseCount: 2,
        probes: {
          lrclib: async () => observation('lrclib'),
          amll: async () => observation('amll'),
        },
        [key]: value,
      }),
    ).rejects.toThrow(new RegExp(key, 'i'));
  });

  it('rejects ad hoc runner options instead of silently accepting a fake hard timeout', async () => {
    await expect(
      runPrivateLyricsCorpus(corpus(), {
        requiredCaseCount: 2,
        concurrency: 1,
        probes: {
          lrclib: async () => observation('lrclib'),
          amll: async () => observation('amll'),
        },
        probeTimeoutMs: 20,
      }),
    ).rejects.toThrow(/runner options.*fields/i);
  });
});
