import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  evaluateLyricsProviderBenchmark,
  normalizeProbeOutcome,
  validateLyricsProviderBenchmark,
} from './lyrics-provider-evaluation.mjs';

function observation(
  providerId,
  {
    requestStatus = 'ok',
    durationMs = 100,
    failureCode = null,
    catalogStatus = 'match',
    matchBand = 'exact',
    reviewVerdict = 'correct',
    capability = 'T1',
    timingValidation = 'not-applicable',
  } = {},
) {
  return {
    providerId,
    request: { status: requestStatus, durationMs, failureCode },
    catalogStatus,
    matchBand,
    reviewVerdict,
    capability,
    timingValidation,
  };
}

function benchmark() {
  return {
    schemaVersion: 1,
    benchmarkId: 'lyrics-provider-synthetic-v1',
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
      minimumCases: 4,
      requiredTags: [
        { tag: 'english', minimumCases: 2 },
        { tag: 'mandarin', minimumCases: 2 },
      ],
      minimumReviewedMatches: 2,
      minimumRequestSuccessRate: 0.9,
      maximumFalseMatchRate: 0.4,
      minimumIncrementalCoverageRate: 0.2,
      minimumUniqueValidT2Count: 2,
    },
    cases: [
      {
        id: 'english-mainstream',
        tags: ['english', 'mainstream'],
        reference: {
          title: 'Synthetic Song One',
          artist: 'Example Artist',
          album: 'Example Album',
          durationSeconds: 180,
          version: 'studio',
        },
        observations: [
          observation('lrclib'),
          observation('amll', {
            durationMs: 100,
            capability: 'T2',
            timingValidation: 'valid',
          }),
        ],
      },
      {
        id: 'mandarin-independent',
        tags: ['mandarin', 'independent'],
        reference: {
          title: '合成歌曲二',
          artist: '範例歌手',
          album: null,
          durationSeconds: 210,
          version: 'studio',
        },
        observations: [
          observation('lrclib', {
            durationMs: 110,
            catalogStatus: 'miss',
            matchBand: null,
            reviewVerdict: null,
            capability: null,
          }),
          observation('amll', {
            durationMs: 200,
            capability: 'T2',
            timingValidation: 'valid',
          }),
        ],
      },
      {
        id: 'english-live',
        tags: ['english', 'live'],
        reference: {
          title: 'Synthetic Song Three',
          artist: 'Example Artist',
          album: 'Live Example',
          durationSeconds: 240,
          version: 'live',
        },
        observations: [
          observation('lrclib', {
            requestStatus: 'failed',
            durationMs: 8000,
            failureCode: 'timeout',
            catalogStatus: 'not-evaluated',
            matchBand: null,
            reviewVerdict: null,
            capability: null,
          }),
          observation('amll', {
            durationMs: 300,
            catalogStatus: 'miss',
            matchBand: null,
            reviewVerdict: null,
            capability: null,
          }),
        ],
      },
      {
        id: 'mandarin-remaster',
        tags: ['mandarin', 'remaster'],
        reference: {
          title: '合成歌曲四',
          artist: '範例歌手',
          album: '重製範例',
          durationSeconds: 200,
          version: 'remaster',
        },
        observations: [
          observation('lrclib', { durationMs: 120 }),
          observation('amll', {
            durationMs: 400,
            reviewVerdict: 'incorrect',
            capability: 'T2',
            timingValidation: 'invalid',
          }),
        ],
      },
    ],
  };
}

describe('lyrics provider benchmark contract', () => {
  it('accepts a path-free metadata and outcome document', () => {
    expect(validateLyricsProviderBenchmark(benchmark())).toEqual(benchmark());
  });

  it('rejects provider payloads, paths, credentials, and duplicate observations', () => {
    const withPayload = structuredClone(benchmark());
    withPayload.cases[0].observations[0].rawLyrics = 'not allowed';
    expect(() => validateLyricsProviderBenchmark(withPayload)).toThrow(
      /invalid fields/i,
    );

    const withPath = structuredClone(benchmark());
    withPath.cases[0].reference.audioPath = 'C:\\Music\\song.wav';
    expect(() => validateLyricsProviderBenchmark(withPath)).toThrow(
      /invalid fields/i,
    );

    const withToken = structuredClone(benchmark());
    withToken.providers[1].token = 'secret';
    expect(() => validateLyricsProviderBenchmark(withToken)).toThrow(
      /invalid fields/i,
    );

    const duplicate = structuredClone(benchmark());
    duplicate.cases[0].observations.push(
      structuredClone(duplicate.cases[0].observations[0]),
    );
    expect(() => validateLyricsProviderBenchmark(duplicate)).toThrow(
      /duplicate provider observation/i,
    );

    const missing = structuredClone(benchmark());
    missing.cases[0].observations.pop();
    expect(() => validateLyricsProviderBenchmark(missing)).toThrow(
      /one observation per provider/i,
    );
  });
});

describe('normalized probe outcomes', () => {
  it('keeps a catalog miss distinct from a request failure', () => {
    expect(
      normalizeProbeOutcome(
        observation('amll', {
          catalogStatus: 'miss',
          matchBand: null,
          reviewVerdict: null,
          capability: null,
        }),
      ),
    ).toMatchObject({ request: { status: 'ok' }, catalogStatus: 'miss' });

    expect(
      normalizeProbeOutcome(
        observation('amll', {
          requestStatus: 'failed',
          failureCode: 'rate-limited',
          catalogStatus: 'not-evaluated',
          matchBand: null,
          reviewVerdict: null,
          capability: null,
        }),
      ),
    ).toMatchObject({
      request: { status: 'failed', failureCode: 'rate-limited' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('rejects false full-T2 claims and result data attached to failures', () => {
    expect(() =>
      normalizeProbeOutcome(
        observation('amll', {
          capability: 'T2',
          timingValidation: 'partial',
        }),
      ),
    ).toThrow(/T2 timing validation/i);

    expect(() =>
      normalizeProbeOutcome(
        observation('amll', {
          requestStatus: 'failed',
          failureCode: 'timeout',
        }),
      ),
    ).toThrow(/failed request/i);
  });

  it.each([
    [null, /must be an object/i],
    [{ mutate: (value) => (value.providerId = '..') }, /provider id/i],
    [
      { mutate: (value) => (value.request.status = 'unknown') },
      /request status/i,
    ],
    [{ mutate: (value) => (value.request.durationMs = -1) }, /duration/i],
    [
      { mutate: (value) => (value.catalogStatus = 'unknown') },
      /catalog status/i,
    ],
    [{ mutate: (value) => (value.matchBand = 'weak') }, /match band/i],
    [
      { mutate: (value) => (value.timingValidation = 'unknown') },
      /timing validation/i,
    ],
    [
      { mutate: (value) => (value.request.failureCode = 'timeout') },
      /successful request/i,
    ],
    [
      { mutate: (value) => (value.catalogStatus = 'not-evaluated') },
      /must evaluate/i,
    ],
    [
      {
        mutate: (value) => {
          value.catalogStatus = 'miss';
        },
      },
      /catalog miss/i,
    ],
    [{ mutate: (value) => (value.reviewVerdict = null) }, /catalog match/i],
    [
      {
        mutate: (value) => {
          value.capability = 'partial-T2';
          value.timingValidation = 'invalid';
        },
      },
      /partial T2/i,
    ],
    [
      {
        mutate: (value) => {
          value.capability = 'T1';
          value.timingValidation = 'valid';
        },
      },
      /T0\/T1/i,
    ],
  ])('rejects malformed outcome contract %#', (scenario, pattern) => {
    if (scenario === null) {
      expect(() => normalizeProbeOutcome(null)).toThrow(pattern);
      return;
    }
    const value = observation('amll');
    scenario.mutate(value);
    expect(() => normalizeProbeOutcome(value)).toThrow(pattern);
  });
});

describe('benchmark validation failures', () => {
  it.each([
    [
      (value) => (value.schemaVersion = 2),
      /unsupported lyrics provider benchmark/i,
    ],
    [(value) => (value.providers = []), /providers are invalid/i],
    [
      (value) => {
        for (let index = 2; index <= 8; index += 1) {
          const providerId = `candidate-${index}`;
          value.providers.push({
            ...structuredClone(value.providers[1]),
            id: providerId,
            profileId: `${providerId}-profile`,
          });
          for (const benchmarkCase of value.cases) {
            benchmarkCase.observations.push(observation(providerId));
          }
        }
      },
      /providers are invalid/i,
    ],
    [
      (value) => value.providers.push(structuredClone(value.providers[1])),
      /provider ids must be unique/i,
    ],
    [(value) => (value.providers[1].id = '__proto__'), /provider id/i],
    [(value) => (value.providers[1].mode = 'unknown'), /provider mode/i],
    [(value) => (value.providers[1].accessMode = 'unknown'), /access mode/i],
    [
      (value) => (value.providers[1].tokenRefresh = 'unknown'),
      /token refresh/i,
    ],
    [(value) => (value.providers[1].boundedPayload = null), /payload bound/i],
    [
      (value) => (value.providers[0].mode = 'candidate'),
      /exactly one baseline/i,
    ],
    [
      (value) => (value.acceptance.requiredTags = null),
      /required tags must be an array/i,
    ],
    [
      (value) =>
        (value.acceptance.requiredTags = Array.from(
          { length: 33 },
          (_, index) => ({ tag: `required-${index}`, minimumCases: 1 }),
        )),
      /required tags are invalid/i,
    ],
    [
      (value) =>
        value.acceptance.requiredTags.push(
          structuredClone(value.acceptance.requiredTags[0]),
        ),
      /required tags must be unique/i,
    ],
    [
      (value) => (value.acceptance.minimumRequestSuccessRate = 2),
      /between 0 and 1/i,
    ],
    [(value) => (value.cases = []), /benchmark cases are invalid/i],
    [
      (value) => value.cases.push(structuredClone(value.cases[0])),
      /case ids must be unique/i,
    ],
    [(value) => (value.cases[0].tags = []), /case tags are invalid/i],
    [
      (value) => {
        value.cases.forEach((benchmarkCase, caseIndex) => {
          benchmarkCase.tags = Array.from(
            { length: 16 },
            (_, tagIndex) => `tag-${caseIndex}-${tagIndex}`,
          );
        });
        const extraCase = structuredClone(value.cases[0]);
        extraCase.id = 'distinct-tag-overflow';
        extraCase.tags = ['tag-overflow'];
        value.cases.push(extraCase);
      },
      /distinct tags are invalid/i,
    ],
    [(value) => (value.cases[0].tags[0] = 'constructor'), /case tag/i],
    [
      (value) => value.cases[0].tags.push(value.cases[0].tags[0]),
      /case tags must be unique/i,
    ],
    [
      (value) => (value.cases[0].reference.durationSeconds = 0),
      /reference duration/i,
    ],
    [
      (value) => (value.cases[0].reference.title = 'bad\ntitle'),
      /reference title/i,
    ],
    [
      (value) => (value.cases[0].observations = null),
      /observations must be an array/i,
    ],
    [
      (value) => (value.cases[0].observations[1].providerId = 'unknown'),
      /unknown provider/i,
    ],
  ])('fails closed for malformed benchmark %#', (mutate, pattern) => {
    const value = benchmark();
    mutate(value);
    expect(() => validateLyricsProviderBenchmark(value)).toThrow(pattern);
  });
});

describe('lyrics provider evaluation', () => {
  it('reports request health, misses, false matches, incremental coverage, and valid T2 separately', () => {
    const report = evaluateLyricsProviderBenchmark(benchmark());

    expect(report.decision).toBe('advance-to-sentinel');
    expect(report.providers.amll).toMatchObject({
      decision: 'advance-to-sentinel',
      summary: {
        caseCount: 4,
        requestSuccessRate: 1,
        requestFailureCount: 0,
        catalogMissCount: 1,
        reviewedMatchCount: 3,
        correctMatchCount: 2,
        incorrectMatchCount: 1,
        falseMatchRate: 0.333333,
        coverageRate: 0.5,
        incrementalCoverageCount: 1,
        incrementalCoverageRate: 0.25,
        uniqueValidT2Count: 2,
        invalidT2Count: 1,
        p50LatencyMs: 200,
        p95LatencyMs: 400,
        rateLimitedRate: 0,
      },
    });
    expect(report.providers.amll.groups.mandarin).toMatchObject({
      caseCount: 2,
      correctMatchCount: 1,
      incorrectMatchCount: 1,
    });
    expect(report.providers.lrclib.summary).toMatchObject({
      requestSuccessRate: 0.75,
      requestFailureCount: 1,
      catalogMissCount: 1,
    });
  });

  it('reports match bands separately and excludes related matches from eligibility gates', () => {
    const input = benchmark();
    for (const benchmarkCase of input.cases) {
      const candidate = benchmarkCase.observations.find(
        ({ providerId }) => providerId === 'amll',
      );
      if (candidate.catalogStatus === 'match') candidate.matchBand = 'related';
    }

    const candidate = evaluateLyricsProviderBenchmark(input).providers.amll;

    expect(candidate.decision).toBe('insufficient-data');
    expect(candidate.summary).toMatchObject({
      reviewedMatchCount: 3,
      eligibleReviewedMatchCount: 0,
      eligibleIncrementalCoverageRate: 0,
      eligibleUniqueValidT2Count: 0,
      matchBands: {
        exact: { reviewedMatchCount: 0, falseMatchRate: null },
        strong: { reviewedMatchCount: 0, falseMatchRate: null },
        related: {
          reviewedMatchCount: 3,
          correctMatchCount: 2,
          incorrectMatchCount: 1,
          falseMatchRate: 0.333333,
        },
      },
    });
  });

  describe('lyrics provider evaluation CLI', () => {
    it('evaluates a synthetic fixture and atomically writes a bounded report', () => {
      const fixturePath = new URL(
        './fixtures/lyrics-provider-evaluation/synthetic-pass.json',
        import.meta.url,
      );
      const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      expect(validateLyricsProviderBenchmark(fixture)).toEqual(fixture);

      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'utawakui-lyrics-provider-evaluation-'),
      );
      try {
        const outputPath = path.join(tempDir, 'report.json');
        const result = spawnSync(
          process.execPath,
          [
            fileURLToPath(
              new URL('./lyrics-provider-evaluation.mjs', import.meta.url),
            ),
            fileURLToPath(fixturePath),
            outputPath,
          ],
          { encoding: 'utf8', windowsHide: true },
        );

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout.trim()).toBe(path.resolve(outputPath));
        expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toMatchObject({
          schemaVersion: 1,
          benchmarkId: fixture.benchmarkId,
          decision: 'advance-to-sentinel',
        });
        expect(fs.existsSync(`${outputPath}.tmp`)).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects overwriting the benchmark input', () => {
      const fixturePath = new URL(
        './fixtures/lyrics-provider-evaluation/synthetic-pass.json',
        import.meta.url,
      );
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL('./lyrics-provider-evaluation.mjs', import.meta.url),
          ),
          fileURLToPath(fixturePath),
          fileURLToPath(fixturePath),
        ],
        { encoding: 'utf8', windowsHide: true },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/must not overwrite/i);
    });

    it('preserves an input whose name matches the old fixed temporary path', () => {
      const fixturePath = fileURLToPath(
        new URL(
          './fixtures/lyrics-provider-evaluation/synthetic-pass.json',
          import.meta.url,
        ),
      );
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'utawakui-lyrics-provider-temp-collision-'),
      );
      try {
        const outputPath = path.join(tempDir, 'report.json');
        const inputPath = `${outputPath}.tmp`;
        const originalInput = fs.readFileSync(fixturePath, 'utf8');
        fs.writeFileSync(inputPath, originalInput);

        const result = spawnSync(
          process.execPath,
          [
            fileURLToPath(
              new URL('./lyrics-provider-evaluation.mjs', import.meta.url),
            ),
            inputPath,
            outputPath,
          ],
          { encoding: 'utf8', windowsHide: true },
        );

        expect(result.status).toBe(0);
        expect(fs.readFileSync(inputPath, 'utf8')).toBe(originalInput);
        expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toMatchObject({
          benchmarkId: 'lyrics-provider-synthetic-v1',
        });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('prints a report to stdout when no output path is provided', () => {
      const fixturePath = fileURLToPath(
        new URL(
          './fixtures/lyrics-provider-evaluation/synthetic-pass.json',
          import.meta.url,
        ),
      );
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL('./lyrics-provider-evaluation.mjs', import.meta.url),
          ),
          fixturePath,
        ],
        { encoding: 'utf8', windowsHide: true },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        decision: 'advance-to-sentinel',
      });
    });

    it('rejects missing and oversized input', () => {
      const scriptPath = fileURLToPath(
        new URL('./lyrics-provider-evaluation.mjs', import.meta.url),
      );
      const missing = spawnSync(process.execPath, [scriptPath], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(missing.status).toBe(1);
      expect(missing.stderr).toMatch(/usage:/i);

      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'utawakui-lyrics-provider-oversized-'),
      );
      try {
        const oversizedPath = path.join(tempDir, 'oversized.json');
        fs.writeFileSync(oversizedPath, ' '.repeat(8 * 1024 * 1024 + 1));
        const oversized = spawnSync(
          process.execPath,
          [scriptPath, oversizedPath],
          {
            encoding: 'utf8',
            windowsHide: true,
          },
        );
        expect(oversized.status).toBe(1);
        expect(oversized.stderr).toMatch(/exceeds the size limit/i);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  it('fails a candidate independently when request health and match safety miss their gates', () => {
    const input = benchmark();
    input.cases[1].observations[1] = observation('amll', {
      requestStatus: 'failed',
      durationMs: 5000,
      failureCode: 'rate-limited',
      catalogStatus: 'not-evaluated',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
    });

    const report = evaluateLyricsProviderBenchmark(input);
    expect(report.decision).toBe('no-go');
    expect(report.providers.amll.decision).toBe('no-go');
    expect(report.providers.amll.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'request-success-rate', passed: false }),
        expect.objectContaining({ id: 'false-match-rate', passed: false }),
      ]),
    );
  });

  it('reports an unknown false-match rate as insufficient data instead of zero', () => {
    const input = benchmark();
    for (const benchmarkCase of input.cases) {
      benchmarkCase.observations[1] = observation('amll', {
        catalogStatus: 'miss',
        matchBand: null,
        reviewVerdict: null,
        capability: null,
      });
    }

    const report = evaluateLyricsProviderBenchmark(input);
    expect(report.providers.amll.summary.falseMatchRate).toBeNull();
    expect(report.providers.amll.decision).toBe('insufficient-data');
    expect(report.decision).toBe('insufficient-data');
  });

  it.each([
    {
      field: 'accessMode',
      value: 'manual-cookie',
      gateId: 'access-mode',
    },
    {
      field: 'tokenRefresh',
      value: 'unverified',
      gateId: 'token-refresh',
    },
    {
      field: 'boundedPayload',
      value: false,
      gateId: 'bounded-payload',
    },
  ])(
    'blocks operationally unsafe provider profile: $field',
    ({ field, value, gateId }) => {
      const input = benchmark();
      input.providers[1][field] = value;

      const report = evaluateLyricsProviderBenchmark(input);
      expect(report.providers.amll.decision).toBe('no-go');
      expect(report.providers.amll.gates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: gateId, passed: false }),
        ]),
      );
    },
  );
});
