import { describe, expect, it } from 'vitest';
import {
  NETEASE_SENTINEL_REQUIRED_SLOTS,
  createNeteaseSentinelState,
  decideNeteaseSentinelOutcome,
  recordNeteaseSentinelObservation,
  validateNeteaseSentinelState,
} from './lyrics-provider-netease-sentinel.mjs';

function observation(overrides = {}) {
  return {
    providerId: 'netease',
    request: { status: 'ok', durationMs: 250, failureCode: null },
    catalogStatus: 'match',
    matchBand: 'exact',
    reviewVerdict: 'unreviewed',
    capability: 'T2',
    timingValidation: 'valid',
    ...overrides,
  };
}

describe('NetEase aggregate-only sentinel state', () => {
  it('starts with an exact content-free schema and four controlled language groups', () => {
    const state = createNeteaseSentinelState({
      startedAt: '2026-08-28T00:00:00.000Z',
    });

    expect(state).toMatchObject({
      schemaVersion: 1,
      profileId: 'netease-yrc-evaluation-v1',
      requiredSlots: 288,
      attemptedSlots: 0,
      complete: false,
      languageGroups: {
        zh: { attempts: 0 },
        en: { attempts: 0 },
        ja: { attempts: 0 },
        ko: { attempts: 0 },
      },
      intervals: [],
    });
    expect(JSON.stringify(state)).not.toMatch(
      /title|artist|album|lyrics|providerId|url|cookie|path/iu,
    );
  });

  it('aggregates capability, missing YRC, latency, match, and categorical failures without per-song rows', () => {
    let state = createNeteaseSentinelState({
      startedAt: '2026-08-28T00:00:00.000Z',
    });
    state = recordNeteaseSentinelObservation(state, {
      languageGroup: 'zh',
      observedAt: '2026-08-28T00:00:10.000Z',
      observation: observation(),
    });
    state = recordNeteaseSentinelObservation(state, {
      languageGroup: 'en',
      observedAt: '2026-08-28T00:15:10.000Z',
      observation: observation({
        request: { status: 'ok', durationMs: 1250, failureCode: null },
        capability: 'T1',
        timingValidation: 'not-applicable',
      }),
    });
    state = recordNeteaseSentinelObservation(state, {
      languageGroup: 'ja',
      observedAt: '2026-08-28T00:30:10.000Z',
      observation: observation({
        request: {
          status: 'failed',
          durationMs: 10_000,
          failureCode: 'timeout',
        },
        catalogStatus: 'not-evaluated',
        matchBand: null,
        reviewVerdict: null,
        capability: null,
        timingValidation: 'not-applicable',
      }),
    });

    expect(state.attemptedSlots).toBe(3);
    expect(state.totals).toMatchObject({
      requestSucceeded: 2,
      requestFailed: 1,
      catalogMatch: 2,
      catalogMiss: 0,
      capabilities: { T0: 0, T1: 1, T2: 1 },
      yrcMissing: 1,
      failures: { timeout: 1 },
      latency: {
        count: 3,
        sumMs: 11_500,
        buckets: {
          upTo500: 1,
          upTo1000: 0,
          upTo3000: 1,
          upTo10000: 1,
          over10000: 0,
        },
      },
    });
    expect(state.languageGroups).toMatchObject({
      zh: { attempts: 1 },
      en: { attempts: 1 },
      ja: { attempts: 1 },
      ko: { attempts: 0 },
    });
    expect(state.intervals).toHaveLength(1);
    expect(state.intervals[0]).not.toHaveProperty('observations');
    expect(JSON.stringify(state)).not.toContain('Synthetic');
    expect(() => validateNeteaseSentinelState(state)).not.toThrow();
    expect(() =>
      validateNeteaseSentinelState({
        ...state,
        songTitle: 'must never persist',
      }),
    ).toThrow(/sentinel state/i);
    expect(() =>
      validateNeteaseSentinelState({
        ...state,
        totals: {
          ...state.totals,
          failures: { 'private provider error': 1 },
        },
      }),
    ).toThrow(/sentinel state/i);
  });

  it('requires all 288 attempted slots and caps the state at 72 aggregate intervals', () => {
    let state = createNeteaseSentinelState({
      startedAt: '2026-08-28T00:00:00.000Z',
    });
    const languages = ['zh', 'en', 'ja', 'ko'];
    for (let index = 0; index < NETEASE_SENTINEL_REQUIRED_SLOTS; index += 1) {
      state = recordNeteaseSentinelObservation(state, {
        languageGroup: languages[index % languages.length],
        observedAt: new Date(
          Date.UTC(2026, 7, 28, 0, index * 15),
        ).toISOString(),
        observation: observation(),
      });
    }

    expect(state.attemptedSlots).toBe(288);
    expect(state.complete).toBe(true);
    expect(state.intervals).toHaveLength(72);
    expect(() =>
      recordNeteaseSentinelObservation(state, {
        languageGroup: 'zh',
        observedAt: '2026-09-01T00:00:00.000Z',
        observation: observation(),
      }),
    ).toThrow(/complete/i);
  });
});

describe('NetEase provisional decision bands', () => {
  it('marks a complete clean 95% sentinel technically usable', () => {
    expect(
      decideNeteaseSentinelOutcome({
        complete: true,
        smokeSelectionCorrect: true,
        attemptedSlots: 288,
        requestSucceeded: 274,
        requestFailed: 14,
        hardFailureCount: 0,
        schemaDriftCount: 0,
        validatedT2Count: 1,
      }),
    ).toBe('technically-usable');
  });

  it('keeps sparse YRC evidence and the 90-95% band experimental', () => {
    expect(
      decideNeteaseSentinelOutcome({
        complete: true,
        smokeSelectionCorrect: true,
        attemptedSlots: 288,
        requestSucceeded: 270,
        requestFailed: 18,
        hardFailureCount: 0,
        schemaDriftCount: 0,
        validatedT2Count: 8,
      }),
    ).toBe('fallback-experimental-only');
    expect(
      decideNeteaseSentinelOutcome({
        complete: true,
        smokeSelectionCorrect: true,
        attemptedSlots: 288,
        requestSucceeded: 280,
        requestFailed: 8,
        hardFailureCount: 0,
        schemaDriftCount: 0,
        validatedT2Count: 0,
      }),
    ).toBe('fallback-experimental-only');
  });

  it.each([
    { complete: false, hardFailureCount: 0, schemaDriftCount: 0 },
    { complete: true, hardFailureCount: 1, schemaDriftCount: 0 },
    { complete: true, hardFailureCount: 0, schemaDriftCount: 1 },
    {
      complete: true,
      hardFailureCount: 0,
      schemaDriftCount: 0,
      requestSucceeded: 250,
      requestFailed: 38,
    },
  ])(
    'excludes incomplete, drifting, hard-failed, or sub-90% runs %#',
    (input) => {
      expect(
        decideNeteaseSentinelOutcome({
          smokeSelectionCorrect: true,
          attemptedSlots: input.complete ? 288 : 200,
          requestSucceeded: 288,
          requestFailed: 0,
          validatedT2Count: 1,
          ...input,
        }),
      ).toBe('unstable-exclude');
    },
  );
});
