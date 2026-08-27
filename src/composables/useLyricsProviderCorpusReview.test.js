import { describe, expect, it, vi } from 'vitest';
import { useLyricsProviderCorpusReview } from './useLyricsProviderCorpusReview.js';

function candidate(overrides = {}) {
  return {
    id: 'candidate-0000000000000001',
    stratum: 'chinese-rap',
    languageTag: 'mandarin',
    catalogReach: 'mainstream',
    decision: 'pending',
    rejectionReason: null,
    reference: {
      title: '第一首',
      artist: '歌手甲',
      album: '專輯甲',
      durationSeconds: 181,
      firstReleaseDate: '2024-01-02',
    },
    evidence: {
      recordingMbid: '00000000-0000-4000-8000-000000000001',
      listenCount: 100,
      userCount: 25,
    },
    ...overrides,
  };
}

function dataset(candidates = [candidate()]) {
  const counts = {
    total: candidates.length,
    pending: candidates.filter((item) => item.decision === 'pending').length,
    approved: candidates.filter((item) => item.decision === 'approved').length,
    rejected: candidates.filter((item) => item.decision === 'rejected').length,
    replacementNeeded: candidates.filter((item) => item.decision === 'rejected')
      .length,
  };
  return {
    schemaVersion: 1,
    candidateSetId: 'lyrics-provider-private-candidates-v1',
    counts,
    canExport: counts.approved === counts.total,
    strata: [
      {
        id: 'chinese-rap',
        label: '中文饒舌',
        counts,
      },
      {
        id: 'chinese-pop',
        label: '中文流行',
        counts: {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          replacementNeeded: 0,
        },
      },
    ],
    candidates,
  };
}

describe('useLyricsProviderCorpusReview', () => {
  it('loads the fixed dataset, selects the first pending case, and seeds a controlled draft', async () => {
    const value = dataset([
      candidate({ decision: 'approved' }),
      candidate({
        id: 'candidate-0000000000000002',
        title: 'ignored',
        catalogReach: 'long-tail',
        reference: {
          title: '第二首',
          artist: '歌手乙',
          album: null,
          durationSeconds: 202,
          firstReleaseDate: null,
        },
      }),
    ]);
    const bridge = {
      loadLyricsProviderReview: vi.fn(async () => value),
    };
    const review = useLyricsProviderCorpusReview(bridge);

    await review.load();

    expect(review.selectedStratumId.value).toBe('chinese-rap');
    expect(review.decisionFilter.value).toBe('pending');
    expect(review.selectedCandidate.value?.id).toBe(
      'candidate-0000000000000002',
    );
    expect(review.draft).toMatchObject({
      title: '第二首',
      artist: '歌手乙',
      album: '',
      durationSeconds: 202,
      languageTag: 'mandarin',
      version: 'studio',
      eraTag: null,
      versionTrap: false,
    });
    expect(review.loading.value).toBe(false);
    expect(review.error.value).toBeNull();
  });

  it('filters by decision, reach, title, artist, candidate ID, or Recording MBID', async () => {
    const value = dataset([
      candidate(),
      candidate({
        id: 'candidate-0000000000000002',
        catalogReach: 'long-tail',
        reference: {
          title: 'Night Drive',
          artist: 'Artist B',
          album: null,
          durationSeconds: 200,
          firstReleaseDate: null,
        },
        evidence: {
          recordingMbid: '00000000-0000-4000-8000-000000000002',
          listenCount: 20,
          userCount: 4,
        },
      }),
    ]);
    const review = useLyricsProviderCorpusReview({
      loadLyricsProviderReview: vi.fn(async () => value),
    });
    await review.load();

    review.reachFilter.value = 'long-tail';
    review.query.value = '  artist b  ';
    expect(review.visibleCandidates.value.map(({ id }) => id)).toEqual([
      'candidate-0000000000000002',
    ]);

    review.reachFilter.value = 'all';
    review.query.value = 'candidate-0000000000000001';
    expect(review.visibleCandidates.value.map(({ id }) => id)).toEqual([
      'candidate-0000000000000001',
    ]);

    review.query.value = '00000000-0000-4000-8000-000000000001';
    expect(review.visibleCandidates.value.map(({ id }) => id)).toEqual([
      'candidate-0000000000000001',
    ]);

    review.decisionFilter.value = 'approved';
    expect(review.visibleCandidates.value).toEqual([]);
  });

  it('reconciles selection whenever a controlled filter changes', async () => {
    const pending = candidate();
    const approved = candidate({
      id: 'candidate-0000000000000002',
      decision: 'approved',
      catalogReach: 'long-tail',
      reference: {
        title: 'Night Drive',
        artist: 'Artist B',
        album: null,
        durationSeconds: 200,
        firstReleaseDate: null,
      },
      confirmation: {
        title: 'Night Drive',
        artist: 'Artist B',
        album: null,
        durationSeconds: 200,
        languageTag: 'multilingual',
        version: 'studio',
        eraTag: 'recent-release',
        versionTrap: false,
      },
    });
    const review = useLyricsProviderCorpusReview({
      loadLyricsProviderReview: vi.fn(async () => dataset([pending, approved])),
    });
    await review.load();

    review.setDecisionFilter('approved');
    expect(review.selectedCandidate.value?.id).toBe(approved.id);
    expect(review.draft.title).toBe('Night Drive');

    review.setReachFilter('mainstream');
    expect(review.selectedCandidate.value).toBeNull();

    review.setDecisionFilter('all');
    expect(review.selectedCandidate.value?.id).toBe(pending.id);
    review.setQuery('missing');
    expect(review.selectedCandidate.value).toBeNull();
  });

  it('sends an exact approval intent and advances to the next pending candidate', async () => {
    const first = candidate();
    const second = candidate({
      id: 'candidate-0000000000000002',
      catalogReach: 'long-tail',
      reference: {
        title: '第二首',
        artist: '歌手乙',
        album: null,
        durationSeconds: 202,
        firstReleaseDate: null,
      },
    });
    const initial = dataset([first, second]);
    const updated = dataset([{ ...first, decision: 'approved' }, second]);
    const bridge = {
      loadLyricsProviderReview: vi.fn(async () => initial),
      saveLyricsProviderReviewDecision: vi.fn(async () => updated),
    };
    const review = useLyricsProviderCorpusReview(bridge);
    await review.load();
    review.draft.title = '第一首（確認）';
    review.draft.album = '';
    review.draft.durationSeconds = 183;
    review.draft.eraTag = 'recent-release';
    review.draft.versionTrap = true;

    await review.approveAndNext();

    expect(bridge.saveLyricsProviderReviewDecision).toHaveBeenCalledWith({
      candidateId: first.id,
      decision: 'approved',
      confirmation: {
        title: '第一首（確認）',
        artist: '歌手甲',
        album: null,
        durationSeconds: 183,
        languageTag: 'mandarin',
        version: 'studio',
        eraTag: 'recent-release',
        versionTrap: true,
      },
    });
    expect(review.selectedCandidate.value?.id).toBe(second.id);
    expect(review.saving.value).toBe(false);
  });

  it('requires explicit 2010+ confirmation before approval', async () => {
    const saveLyricsProviderReviewDecision = vi.fn();
    const review = useLyricsProviderCorpusReview({
      loadLyricsProviderReview: vi.fn(async () => dataset()),
      saveLyricsProviderReviewDecision,
    });
    await review.load();

    expect(review.canApprove.value).toBe(false);
    expect(review.approvalBlocker.value).toBe(
      '請先確認這筆錄音於 2010 年或之後首次發行。',
    );
    expect(review.approvalField.value).toBe('eraTag');
    expect(review.approveAndNext()).toBe(false);
    expect(saveLyricsProviderReviewDecision).not.toHaveBeenCalled();

    review.draft.eraTag = 'recent-release';
    expect(review.canApprove.value).toBe(true);
    expect(review.approvalBlocker.value).toBe('');
    expect(review.approvalField.value).toBe('');
  });

  it.each([
    ['title', '', '請確認歌名。'],
    ['artist', '', '請確認歌手。'],
    ['durationSeconds', 0, '請確認有效的時長（1–86400 秒）。'],
    ['languageTag', '', '請確認語言。'],
    ['version', '', '請確認版本。'],
  ])(
    'describes the missing approval field %s',
    async (field, value, message) => {
      const review = useLyricsProviderCorpusReview({
        loadLyricsProviderReview: vi.fn(async () => dataset()),
      });
      await review.load();
      review.draft.eraTag = 'recent-release';
      review.draft[field] = value;

      expect(review.canApprove.value).toBe(false);
      expect(review.approvalBlocker.value).toBe(message);
      expect(review.approvalField.value).toBe(field);
    },
  );

  it('rejects with an allowlisted reason, advances, and keeps errors path-free', async () => {
    const first = candidate();
    const second = candidate({ id: 'candidate-0000000000000002' });
    const updated = dataset([
      {
        ...first,
        decision: 'rejected',
        rejectionReason: 'metadata-insufficient',
      },
      second,
    ]);
    const bridge = {
      loadLyricsProviderReview: vi.fn(async () => dataset([first, second])),
      saveLyricsProviderReviewDecision: vi
        .fn()
        .mockResolvedValueOnce(updated)
        .mockRejectedValueOnce(
          new Error('E:\\private\\reviews.json could not be replaced'),
        ),
    };
    const review = useLyricsProviderCorpusReview(bridge);
    await review.load();

    await review.rejectAndNext('metadata-insufficient');
    expect(bridge.saveLyricsProviderReviewDecision).toHaveBeenCalledWith({
      candidateId: first.id,
      decision: 'rejected',
      rejectionReason: 'metadata-insufficient',
    });
    expect(review.selectedCandidate.value?.id).toBe(second.id);

    await review.rejectAndNext('other');
    expect(review.error.value).toEqual({
      title: '審核決定未能儲存',
      message: '原始審核資料未變更，請重試。',
      actionLabel: '',
    });
    expect(JSON.stringify(review.error.value)).not.toMatch(/private|reviews/i);
  });

  it('exports only through the no-argument main-owned intent', async () => {
    const bridge = {
      loadLyricsProviderReview: vi.fn(async () =>
        dataset([candidate({ decision: 'approved' })]),
      ),
      exportLyricsProviderReviewCorpus: vi.fn(async () => ({
        exported: true,
        caseCount: 40,
      })),
    };
    const review = useLyricsProviderCorpusReview(bridge);
    await review.load();

    await expect(review.exportCorpus()).resolves.toBe(true);
    expect(bridge.exportLyricsProviderReviewCorpus).toHaveBeenCalledWith();
    expect(review.exported.value).toBe(true);
  });
});
