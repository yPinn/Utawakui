import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildNeteasePhaseReport,
  createNeteaseEvaluationPaths,
  createNeteaseSentinelStore,
  readNeteaseEvaluationJson,
  runNeteaseSmoke,
  runNextNeteaseSentinelSlot,
  validateNeteaseSmokeManifest,
  writeNeteaseEvaluationJson,
} from './lyrics-provider-netease-evaluation.mjs';
import {
  NETEASE_SENTINEL_REQUIRED_SLOTS,
  createNeteaseSentinelState,
  recordNeteaseSentinelObservation,
} from './lyrics-provider-netease-sentinel.mjs';

const temporaryRoots = [];

function makeTemporaryRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-netease-evaluation-test-'),
  );
  temporaryRoots.push(root);
  return root;
}

function reference(languageGroup) {
  return {
    title: `Synthetic ${languageGroup}`,
    artist: `Artist ${languageGroup}`,
    album: `Album ${languageGroup}`,
    durationSeconds: 180,
    version: 'studio',
  };
}

function manifest() {
  return {
    schemaVersion: 1,
    profileId: 'netease-yrc-evaluation-v1',
    cases: ['zh', 'en', 'ja', 'ko'].map((languageGroup) => ({
      caseId: `smoke-${languageGroup}-01`,
      languageGroup,
      manualSelectionConfirmed: false,
      reference: reference(languageGroup),
    })),
  };
}

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

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('private NetEase smoke manifest', () => {
  it('accepts only a bounded exact schema with every controlled language group', () => {
    expect(validateNeteaseSmokeManifest(manifest())).toEqual(manifest());
    expect(() =>
      validateNeteaseSmokeManifest({
        ...manifest(),
        cookie: 'forbidden',
      }),
    ).toThrow(/smoke manifest/i);
    expect(() =>
      validateNeteaseSmokeManifest({
        ...manifest(),
        cases: [
          ...manifest().cases.filter(
            ({ languageGroup }) => languageGroup !== 'ko',
          ),
          {
            caseId: 'smoke-zh-02',
            languageGroup: 'zh',
            manualSelectionConfirmed: false,
            reference: reference('zh'),
          },
        ],
      }),
    ).toThrow(/language groups/i);
    expect(() =>
      validateNeteaseSmokeManifest({
        ...manifest(),
        cases: [
          manifest().cases[0],
          manifest().cases[0],
          ...manifest().cases.slice(2),
        ],
      }),
    ).toThrow(/manifest case/i);
  });

  it('rejects invalid smoke execution options', async () => {
    await expect(runNeteaseSmoke(manifest())).rejects.toThrow(/smoke options/i);
  });

  it('returns aggregate smoke evidence without case ids or recording metadata', async () => {
    const probe = vi.fn(async () => observation());
    const times = [
      new Date('2026-08-28T00:00:00.000Z'),
      new Date('2026-08-28T00:00:10.000Z'),
    ];
    const report = await runNeteaseSmoke(manifest(), {
      probe,
      now: () => times.shift() || new Date('2026-08-28T00:00:10.000Z'),
    });

    expect(probe).toHaveBeenCalledTimes(4);
    expect(report).toMatchObject({
      schemaVersion: 1,
      profileId: 'netease-yrc-evaluation-v1',
      kind: 'interface-health-smoke',
      caseCount: 4,
      selectionCorrect: true,
      ambiguousCandidateCount: 0,
      ambiguousLanguageGroups: { zh: 0, en: 0, ja: 0, ko: 0 },
      totals: {
        attempts: 4,
        requestSucceeded: 4,
        catalogMatch: 4,
        capabilities: { T0: 0, T1: 0, T2: 4 },
      },
    });
    expect(JSON.stringify(report)).not.toMatch(
      /Synthetic|Artist|Album|smoke-zh|reference|lyrics|providerId/iu,
    );
  });

  it('requires owner confirmation only for non-exact matched candidates', async () => {
    const privateManifest = manifest();
    const reviewCandidates = [];
    const ambiguous = await runNeteaseSmoke(privateManifest, {
      probe: async () => ({
        observation: observation({ matchBand: 'strong' }),
        reviewCandidate: {
          title: 'Synthetic Candidate',
          artists: ['Candidate Artist'],
          album: null,
          durationSeconds: 184,
          matchBand: 'strong',
          durationDeltaSeconds: 4,
          versionMismatch: false,
        },
      }),
      onAmbiguousCandidate: (value) => reviewCandidates.push(value),
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });
    expect(ambiguous).toMatchObject({
      selectionCorrect: false,
      ambiguousCandidateCount: 4,
      ambiguousLanguageGroups: { zh: 1, en: 1, ja: 1, ko: 1 },
    });
    expect(reviewCandidates).toHaveLength(4);
    expect(reviewCandidates[0]).toEqual({
      languageGroup: 'zh',
      reference: reference('zh'),
      candidate: expect.objectContaining({
        title: 'Synthetic Candidate',
        matchBand: 'strong',
      }),
    });

    const confirmedManifest = {
      ...privateManifest,
      cases: privateManifest.cases.map((value) => ({
        ...value,
        manualSelectionConfirmed: true,
      })),
    };
    const confirmed = await runNeteaseSmoke(confirmedManifest, {
      probe: async () => observation({ matchBand: 'strong' }),
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });
    expect(confirmed).toMatchObject({
      selectionCorrect: true,
      ambiguousCandidateCount: 0,
    });
  });
});

describe('resumable NetEase sentinel persistence', () => {
  it('requires an absolute evaluation root and bounded valid JSON', () => {
    expect(() => createNeteaseEvaluationPaths('.')).toThrow(/project root/i);
    const root = makeTemporaryRoot();
    const filePath = path.join(root, 'state.json');
    writeNeteaseEvaluationJson(filePath, { safe: true });
    expect(readNeteaseEvaluationJson(filePath, 'test state')).toEqual({
      safe: true,
    });

    fs.writeFileSync(filePath, '{invalid', 'utf8');
    expect(() => readNeteaseEvaluationJson(filePath, 'test state')).toThrow(
      /is invalid/i,
    );
    fs.writeFileSync(filePath, 'x'.repeat(1024 * 1024 + 1), 'utf8');
    expect(() => readNeteaseEvaluationJson(filePath, 'test state')).toThrow(
      /size limit/i,
    );
  });

  it('atomically stores only validated aggregate state at fixed ignored paths', () => {
    const projectRoot = makeTemporaryRoot();
    const paths = createNeteaseEvaluationPaths(projectRoot);
    const store = createNeteaseSentinelStore({ projectRoot });
    const state = createNeteaseSentinelState({
      startedAt: '2026-08-28T00:00:00.000Z',
    });

    store.save(state);

    expect(store.load()).toEqual(state);
    expect(paths.sentinelStatePath).toBe(
      path.join(
        projectRoot,
        '.benchmarks',
        'lyrics-provider',
        'netease-sentinel',
        'state.json',
      ),
    );
    expect(
      fs
        .readdirSync(path.dirname(paths.sentinelStatePath))
        .filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
    expect(() => store.save({ ...state, songTitle: 'forbidden' })).toThrow(
      /sentinel state/i,
    );
  });

  it('rotates private cases in memory and persists exactly one aggregate slot', async () => {
    const projectRoot = makeTemporaryRoot();
    const store = createNeteaseSentinelStore({ projectRoot });
    const probe = vi.fn(async () => observation());

    const state = await runNextNeteaseSentinelSlot({
      manifest: manifest(),
      store,
      probe,
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });

    expect(state.attemptedSlots).toBe(1);
    expect(state.languageGroups.zh.attempts).toBe(1);
    expect(probe).toHaveBeenCalledWith(reference('zh'));
    expect(store.load()).toEqual(state);
    expect(JSON.stringify(state)).not.toContain('Synthetic zh');
  });

  it('rejects invalid slot options and leaves completed state unchanged', async () => {
    await expect(
      runNextNeteaseSentinelSlot({
        manifest: manifest(),
        store: {},
        probe: vi.fn(),
      }),
    ).rejects.toThrow(/slot options/i);

    const complete = {
      ...createNeteaseSentinelState({
        startedAt: '2026-08-28T00:00:00.000Z',
      }),
      attemptedSlots: NETEASE_SENTINEL_REQUIRED_SLOTS,
      complete: true,
    };
    const store = { load: vi.fn(() => complete), save: vi.fn() };
    const probe = vi.fn();
    await expect(
      runNextNeteaseSentinelSlot({
        manifest: manifest(),
        store,
        probe,
        now: () => new Date('2026-08-31T00:00:00.000Z'),
      }),
    ).resolves.toEqual(complete);
    expect(probe).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe('aggregate NetEase phase report', () => {
  it('rejects invalid report inputs and uncontrolled ambiguity keys', () => {
    const state = createNeteaseSentinelState({
      startedAt: '2026-08-28T00:00:00.000Z',
    });
    const activation = {
      profileId: 'netease-yrc-evaluation-v1',
      packageVersion: '4.40.1',
      lockSha256: 'a'.repeat(64),
      installedBytes: 1000,
    };
    expect(() =>
      buildNeteasePhaseReport({
        state,
        smokeReport: {},
        activation,
        generatedAt: '2026-08-31T00:00:00.000Z',
      }),
    ).toThrow(/report input/i);
    expect(() =>
      buildNeteasePhaseReport({
        state,
        smokeReport: {
          profileId: 'netease-yrc-evaluation-v1',
          kind: 'interface-health-smoke',
          selectionCorrect: true,
          ambiguousCandidateCount: 0,
          ambiguousLanguageGroups: {
            zh: 0,
            en: 0,
            ja: 0,
            ko: 0,
            songTitle: 1,
          },
        },
        activation,
        generatedAt: '2026-08-31T00:00:00.000Z',
      }),
    ).toThrow(/report input/i);
  });

  it('projects the fixed provisional decision without private smoke content', () => {
    let state = createNeteaseSentinelState({
      startedAt: '2026-08-28T00:00:00.000Z',
    });
    for (let index = 0; index < NETEASE_SENTINEL_REQUIRED_SLOTS; index += 1) {
      state = recordNeteaseSentinelObservation(state, {
        languageGroup: ['zh', 'en', 'ja', 'ko'][index % 4],
        observedAt: new Date(
          Date.UTC(2026, 7, 28, 0, index * 15),
        ).toISOString(),
        observation: observation(),
      });
    }
    const report = buildNeteasePhaseReport({
      state,
      smokeReport: {
        schemaVersion: 1,
        profileId: 'netease-yrc-evaluation-v1',
        kind: 'interface-health-smoke',
        selectionCorrect: true,
        ambiguousCandidateCount: 0,
      },
      activation: {
        profileId: 'netease-yrc-evaluation-v1',
        packageVersion: '4.40.1',
        lockSha256: 'a'.repeat(64),
        installedBytes: 1000,
      },
      generatedAt: '2026-08-31T00:00:00.000Z',
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      provisionalOutcome: 'technically-usable',
      observation: { attemptedSlots: 288, complete: true },
      runtime: {
        profileId: 'netease-yrc-evaluation-v1',
        packageVersion: '4.40.1',
      },
      productEligibility: 'requires-30-complete-local-days',
    });
    expect(JSON.stringify(report)).not.toMatch(
      /Synthetic|Artist|Album|reference|lyrics|providerId|runtimeRoot/iu,
    );
  });
});
