import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrivateLyricsReviewManifest } from '../../scripts/lyrics-provider-corpus-review.mjs';
import { createLegacyV2CandidateSet } from '../../scripts/lyrics-provider-corpus-test-fixtures.mjs';
import reviewServiceModule from './lyricsProviderCorpusReview.js';

const {
  createLyricsProviderCorpusReviewService,
  loadLyricsProviderReviewContract,
} = reviewServiceModule;
const temporaryDirectories = [];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-lyrics-corpus-review-'),
  );
  temporaryDirectories.push(workspaceRoot);
  const directory = path.join(workspaceRoot, '.benchmarks', 'lyrics-provider');
  const candidates = {
    schemaVersion: 1,
    candidateSetId: 'lyrics-provider-private-candidates-v4',
    status: 'needs-review',
    policy: { targetCount: 2 },
    candidates: [
      {
        id: 'candidate-0000000000000001',
        stratum: 'chinese-rap',
        languageTag: 'mandarin',
        catalogReach: 'mainstream',
        reviewStatus: 'needs-review',
        reference: {
          title: '第一首',
          artist: '歌手甲',
          album: '專輯甲',
          durationSeconds: 181,
          firstReleaseDate: '2024-01-02',
        },
        source: {
          recordingMbid: '00000000-0000-4000-8000-000000000001',
          primaryArtistMbid: 'private-primary-artist-id',
          workQid: 'Q123',
          workMbid: null,
          listenCount: 100,
          userCount: 25,
        },
      },
      {
        id: 'candidate-0000000000000002',
        stratum: 'chinese-rap',
        languageTag: 'multilingual',
        catalogReach: 'long-tail',
        reviewStatus: 'needs-review',
        reference: {
          title: '第二首',
          artist: '歌手乙',
          album: null,
          durationSeconds: 202,
          firstReleaseDate: '2010',
        },
        source: {
          recordingMbid: '00000000-0000-4000-8000-000000000002',
          primaryArtistMbid: 'another-private-primary-artist-id',
          workQid: null,
          workMbid: 'private-work-id',
          listenCount: 2,
          userCount: 1,
        },
      },
    ],
  };
  const reviews = {
    schemaVersion: 1,
    candidateSetId: candidates.candidateSetId,
    candidateSetSha256: 'fixture-digest',
    status: 'in-review',
    reviews: candidates.candidates.map((candidate) => ({
      candidateId: candidate.id,
      decision: 'pending',
      rejectionReason: null,
      stratum: null,
      languageTag: null,
      version: null,
      eraTag: null,
      versionTrap: null,
      reference: null,
    })),
  };
  writeJson(path.join(directory, 'candidates.json'), candidates);
  writeJson(path.join(directory, 'reviews.json'), reviews);

  const contract = {
    currentCandidateSetId: 'lyrics-provider-private-candidates-v4',
    validatePrivateLyricsCandidateSet: vi.fn((value) => structuredClone(value)),
    validatePrivateLyricsReviewManifest: vi.fn((candidateValue, value) => {
      if (
        value.candidateSetId !== candidateValue.candidateSetId ||
        value.candidateSetSha256 !== 'fixture-digest'
      ) {
        throw new TypeError('private review manifest digest is invalid');
      }
      return structuredClone(value);
    }),
    exportReviewedLyricsCorpus: vi.fn((candidateValue, reviewValue) => {
      if (
        reviewValue.reviews.some((review) => review.decision !== 'approved')
      ) {
        throw new TypeError('all candidate reviews must be approved');
      }
      return {
        schemaVersion: 1,
        corpusId: 'fixture-corpus-v4',
        cases: candidateValue.candidates.map((candidate) => ({
          id: candidate.id,
        })),
      };
    }),
  };
  const service = createLyricsProviderCorpusReviewService({
    workspaceRoot,
    loadReviewContract: async () => contract,
  });
  return { workspaceRoot, directory, candidates, reviews, contract, service };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('lyrics provider corpus review service', () => {
  it('loads the existing legacy v2 shape without making it exportable', async () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-lyrics-corpus-review-v2-'),
    );
    temporaryDirectories.push(workspaceRoot);
    const directory = path.join(
      workspaceRoot,
      '.benchmarks',
      'lyrics-provider',
    );
    const candidates = createLegacyV2CandidateSet();
    const reviews = createPrivateLyricsReviewManifest(candidates);
    writeJson(path.join(directory, 'candidates.json'), candidates);
    writeJson(path.join(directory, 'reviews.json'), reviews);
    const service = createLyricsProviderCorpusReviewService({
      workspaceRoot,
      loadReviewContract: () =>
        loadLyricsProviderReviewContract(path.resolve('.')),
    });

    await expect(service.load()).resolves.toMatchObject({
      candidateSetId: 'lyrics-provider-private-candidates-v2',
      counts: { total: 100, pending: 100 },
      canExport: false,
    });
    const pre2010Candidate = candidates.candidates.find(
      ({ reference }) => reference.firstReleaseDate === '2000',
    );
    await expect(
      service.saveDecision({
        candidateId: pre2010Candidate.id,
        decision: 'approved',
        confirmation: {
          title: pre2010Candidate.reference.title,
          artist: pre2010Candidate.reference.artist,
          album: null,
          durationSeconds: pre2010Candidate.reference.durationSeconds,
          languageTag: pre2010Candidate.languageTag,
          version: 'studio',
          eraTag: 'recent-release',
          versionTrap: false,
        },
      }),
    ).rejects.toThrow(/before 2010/i);
    await expect(service.exportCorpus()).rejects.toThrow(
      /legacy v2.*cannot be exported/i,
    );
    expect(fs.existsSync(path.join(directory, 'corpus.json'))).toBe(false);
  });

  it('combines the split candidate and review contracts for the default runtime loader', async () => {
    const contract = await loadLyricsProviderReviewContract(path.resolve('.'));

    expect(contract).toMatchObject({
      currentCandidateSetId: 'lyrics-provider-private-candidates-v4',
      validatePrivateLyricsCandidateSet: expect.any(Function),
      validatePrivateLyricsReviewManifest: expect.any(Function),
      exportReviewedLyricsCorpus: expect.any(Function),
    });
  });

  it('loads only a bounded path-free renderer projection with five strata', async () => {
    const value = fixture();

    const dataset = await value.service.load();

    expect(dataset).toMatchObject({
      schemaVersion: 1,
      candidateSetId: value.candidates.candidateSetId,
      counts: {
        total: 2,
        pending: 2,
        approved: 0,
        rejected: 0,
        replacementNeeded: 0,
      },
      canExport: false,
    });
    expect(dataset.strata.map(({ id }) => id)).toEqual([
      'chinese-rap',
      'chinese-pop',
      'english-catalog',
      'japanese-catalog',
      'korean-catalog',
    ]);
    expect(dataset.candidates[0]).toMatchObject({
      id: 'candidate-0000000000000001',
      decision: 'pending',
      reference: value.candidates.candidates[0].reference,
      evidence: {
        recordingMbid: '00000000-0000-4000-8000-000000000001',
        listenCount: 100,
        userCount: 25,
      },
    });
    expect(JSON.stringify(dataset)).not.toMatch(
      /candidateSetSha256|primaryArtistMbid|workQid|workMbid|benchmarks|reviews\.json/i,
    );
  });

  it('derives only allowlisted lookup actions from a validated candidate', async () => {
    const value = fixture();
    const candidateId = 'candidate-0000000000000001';

    await expect(
      value.service.resolveLookupAction({
        candidateId,
        action: 'copy-candidate-id',
      }),
    ).resolves.toEqual({ effect: 'copy', value: candidateId });
    await expect(
      value.service.resolveLookupAction({
        candidateId,
        action: 'copy-recording-mbid',
      }),
    ).resolves.toEqual({
      effect: 'copy',
      value: '00000000-0000-4000-8000-000000000001',
    });
    await expect(
      value.service.resolveLookupAction({
        candidateId,
        action: 'copy-artist-title',
      }),
    ).resolves.toEqual({ effect: 'copy', value: '歌手甲 第一首' });
    await expect(
      value.service.resolveLookupAction({
        candidateId,
        action: 'open-musicbrainz-recording',
      }),
    ).resolves.toEqual({
      effect: 'open-external',
      value:
        'https://musicbrainz.org/recording/00000000-0000-4000-8000-000000000001',
    });

    await expect(
      value.service.resolveLookupAction({
        candidateId,
        action: 'copy-recording-mbid',
        url: 'https://untrusted.example',
      }),
    ).rejects.toThrow(/invalid/i);
    await expect(
      value.service.resolveLookupAction({ candidateId, action: 'copy-path' }),
    ).rejects.toThrow(/invalid/i);
    await expect(
      value.service.resolveLookupAction({
        candidateId: 'candidate-ffffffffffffffff',
        action: 'copy-candidate-id',
      }),
    ).rejects.toThrow(/invalid/i);
  });

  it('accepts an exact approval intent, derives stratum, and atomically replaces reviews', async () => {
    const value = fixture();
    const intent = {
      candidateId: 'candidate-0000000000000001',
      decision: 'approved',
      confirmation: {
        title: '第一首（確認）',
        artist: '歌手甲',
        album: null,
        durationSeconds: 183,
        languageTag: 'mandarin',
        version: 'studio',
        eraTag: 'recent-release',
        versionTrap: false,
      },
    };

    const dataset = await value.service.saveDecision(intent);
    const saved = JSON.parse(
      fs.readFileSync(path.join(value.directory, 'reviews.json'), 'utf8'),
    );

    expect(saved.reviews[0]).toEqual({
      candidateId: intent.candidateId,
      decision: 'approved',
      rejectionReason: null,
      stratum: 'chinese-rap',
      languageTag: 'mandarin',
      version: 'studio',
      eraTag: 'recent-release',
      versionTrap: false,
      reference: {
        title: '第一首（確認）',
        artist: '歌手甲',
        album: null,
        durationSeconds: 183,
        version: 'studio',
      },
    });
    expect(dataset.counts).toMatchObject({ approved: 1, pending: 1 });
    expect(
      fs
        .readdirSync(value.directory)
        .filter((filename) => filename.endsWith('.tmp')),
    ).toEqual([]);

    await expect(
      value.service.saveDecision({ ...intent, path: 'E:\\untrusted.json' }),
    ).rejects.toThrow(/invalid/i);
    await expect(
      value.service.saveDecision({
        candidateId: intent.candidateId,
        decision: 'approved',
        confirmation: { ...intent.confirmation, providerId: 'lrclib' },
      }),
    ).rejects.toThrow(/invalid/i);
  });

  it.each([null, 'older-release'])(
    'rejects approval without explicit 2010+ confirmation: %s',
    async (eraTag) => {
      const value = fixture();
      await expect(
        value.service.saveDecision({
          candidateId: 'candidate-0000000000000001',
          decision: 'approved',
          confirmation: {
            title: '第一首',
            artist: '歌手甲',
            album: null,
            durationSeconds: 181,
            languageTag: 'mandarin',
            version: 'studio',
            eraTag,
            versionTrap: false,
          },
        }),
      ).rejects.toThrow(/era/i);
    },
  );

  it('records rejection as replacement-needed without persisting free-form text', async () => {
    const value = fixture();

    const dataset = await value.service.saveDecision({
      candidateId: 'candidate-0000000000000002',
      decision: 'rejected',
      rejectionReason: 'metadata-insufficient',
    });

    const saved = JSON.parse(
      fs.readFileSync(path.join(value.directory, 'reviews.json'), 'utf8'),
    );
    expect(saved.reviews[1]).toMatchObject({
      decision: 'rejected',
      rejectionReason: 'metadata-insufficient',
      reference: null,
    });
    expect(dataset.counts).toMatchObject({
      rejected: 1,
      replacementNeeded: 1,
    });
    await expect(
      value.service.saveDecision({
        candidateId: 'candidate-0000000000000002',
        decision: 'rejected',
        rejectionReason: 'other',
        notes: 'private free-form notes',
      }),
    ).rejects.toThrow(/invalid/i);
  });

  it('fails closed on digest mismatch and gates export until every review is approved', async () => {
    const value = fixture();
    const reviewsPath = path.join(value.directory, 'reviews.json');
    const broken = { ...value.reviews, candidateSetSha256: 'wrong' };
    writeJson(reviewsPath, broken);

    await expect(value.service.load()).rejects.toThrow(/digest/i);

    writeJson(reviewsPath, value.reviews);
    await expect(value.service.exportCorpus()).rejects.toThrow(/approved/i);
    expect(fs.existsSync(path.join(value.directory, 'corpus.json'))).toBe(
      false,
    );

    const confirmations = value.candidates.candidates.map((candidate) => ({
      candidateId: candidate.id,
      decision: 'approved',
      confirmation: {
        title: candidate.reference.title,
        artist: candidate.reference.artist,
        album: candidate.reference.album,
        durationSeconds: candidate.reference.durationSeconds,
        languageTag: candidate.languageTag,
        version: 'studio',
        eraTag: 'recent-release',
        versionTrap: false,
      },
    }));
    for (const intent of confirmations)
      await value.service.saveDecision(intent);

    await expect(value.service.load()).resolves.toMatchObject({
      canExport: true,
      counts: { approved: 2, pending: 0 },
    });

    await expect(value.service.exportCorpus()).resolves.toEqual({
      exported: true,
      caseCount: 2,
    });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(value.directory, 'corpus.json'), 'utf8'),
      ).corpusId,
    ).toBe('fixture-corpus-v4');
  });
});
