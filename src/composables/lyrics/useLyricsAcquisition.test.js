import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLyricsAcquisition } from './useLyricsAcquisition.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness({ gate = vi.fn().mockResolvedValue(true) } = {}) {
  const state = {
    tracks: [{ id: 'track' }, { id: 'other' }],
    selectedTrackId: 'track',
    candidateSearch: {
      trackId: 'track',
      providerId: 'lrclib',
      candidates: [],
      groups: { best: [], related: [] },
      recordingGroups: { best: [], related: [] },
    },
    manualSave: { isSaving: false, error: null },
  };
  const save = vi.fn();
  const search = vi
    .fn()
    .mockResolvedValue({ provider: 'lrclib', status: 'ok', candidates: [] });
  vi.stubGlobal('window', {
    Utawakui: {
      saveLyricsProviderCandidate: save,
      searchLyricsProviderCandidates: search,
    },
  });
  const refreshLibrary = vi.fn().mockResolvedValue();
  const selectSource = vi.fn();
  return {
    state,
    save,
    search,
    refreshLibrary,
    selectSource,
    ...useLyricsAcquisition({
      state,
      selectedTrack: { value: state.tracks[0] },
      requireFeatureGate: gate,
      reportLyricsError: vi.fn((_error, _operation, fallback) => fallback),
      refreshLibrary,
      selectSource,
    }),
  };
}

const candidate = {
  id: 42,
  matchBand: 'exact',
  previewFingerprint: 'a'.repeat(64),
};
afterEach(() => vi.unstubAllGlobals());

describe('candidate save lifetime', () => {
  it('uses the Kugou source label for fresh verification failures and retains choices', async () => {
    const h = harness();
    h.state.candidateSearch.providerId = 'all';
    const choice = {
      ...candidate,
      providerId: 'kugou',
      candidateKey: 'kugou:42',
    };
    h.state.candidateSearch.candidates = [choice];
    h.save.mockResolvedValue({
      provider: 'kugou',
      status: 'error',
      reason: 'rate-limited',
    });
    await h.saveLyricsProviderCandidate('kugou', choice, 'track');
    expect(h.state.manualSave.error).toContain('酷狗音樂');
    expect(h.state.candidateSearch.candidates).toEqual([choice]);
    expect(h.selectSource).not.toHaveBeenCalled();
  });
  it('does not restore retained choices after an older broaden fails in a new search generation', async () => {
    const h = harness();
    h.search.mockResolvedValueOnce({ status: 'ok', candidates: [candidate] });
    await h.searchLyricsProviderCandidates('lrclib', {
      query: { title: 'First' },
    });
    const reply = deferred();
    h.search.mockReturnValueOnce(reply.promise);
    const more = h.searchLyricsProviderCandidates('lrclib', {
      query: { title: 'First' },
      mode: 'broaden',
    });
    await vi.waitFor(() => expect(h.search).toHaveBeenCalledTimes(2));
    h.clearCandidateSearch();
    h.search.mockResolvedValueOnce({
      status: 'ok',
      candidates: [{ ...candidate, id: 99 }],
    });
    await h.searchLyricsProviderCandidates('lrclib', {
      query: { title: 'Second' },
    });
    reply.reject(new Error('old private failure'));
    await more;
    expect(h.state.candidateSearch.candidates.map((value) => value.id)).toEqual(
      [99],
    );
    expect(h.state.candidateSearch.error).toBeNull();
    expect(h.state.candidateSearch.partial).toBe(false);
  });
  it.each(['typed', 'exception'])(
    'retains comparison choices after a %s broaden failure',
    async (kind) => {
      const h = harness();
      h.search.mockResolvedValueOnce({
        provider: 'lrclib',
        status: 'ok',
        candidates: [candidate],
      });
      await h.searchLyricsProviderCandidates('lrclib', {
        query: { title: 'Song', artist: 'Artist' },
      });
      if (kind === 'typed')
        h.search.mockResolvedValueOnce({
          provider: 'lrclib',
          status: 'error',
          reason: 'offline',
          candidates: [],
          groups: null,
        });
      else h.search.mockRejectedValueOnce(new Error('private transport body'));
      await h.searchLyricsProviderCandidates('lrclib', {
        query: { title: 'Song', artist: 'Artist' },
        mode: 'broaden',
      });
      expect(h.state.candidateSearch).toMatchObject({
        status: 'ok',
        partial: true,
        error: null,
        candidates: [candidate],
      });
      expect(h.state.candidateSearch.providerStatuses).toEqual([
        expect.objectContaining({ status: 'error' }),
      ]);
    },
  );
  it('reports an active gate refusal only to the save operation', async () => {
    const h = harness({ gate: vi.fn().mockResolvedValue(false) });
    await h.saveLyricsProviderCandidate('lrclib', candidate);
    expect(h.state.manualSave.error).toBeTruthy();
    expect(h.state.candidateSearch.error).toBeUndefined();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.state.manualSave.isSaving).toBe(false);
  });

  it('pins the submitted query before the asynchronous feature gate', async () => {
    const gate = deferred();
    const h = harness({ gate: () => gate.promise });
    h.save.mockResolvedValue({ status: 'error', reason: 'busy' });
    const query = { title: 'Original', artist: 'Singer' };
    const submitted = { ...candidate };
    const saving = h.saveLyricsProviderCandidate(
      'lrclib',
      submitted,
      'track',
      query,
    );
    query.title = 'Edited';
    submitted.id = 999;
    gate.resolve(true);
    await saving;
    expect(h.save).toHaveBeenCalledWith(
      'lrclib',
      'track',
      42,
      candidate.previewFingerprint,
      { query: { title: 'Original', artist: 'Singer' } },
    );
  });

  it('distinguishes a committed save whose library refresh failed', async () => {
    const h = harness();
    h.save.mockResolvedValue({
      status: 'saved',
      source: { filename: 'lrclib-42.lrc' },
    });
    h.refreshLibrary.mockRejectedValue(new Error('private list read path'));
    await h.saveLyricsProviderCandidate('lrclib', candidate);
    expect(h.state.manualSave.error).toBe(
      '歌詞已儲存，但清單更新未完成。請重新開啟歌詞清單。',
    );
    expect(h.selectSource).not.toHaveBeenCalled();
  });

  it('does not publish a late refresh failure into a newer save', async () => {
    const h = harness();
    const refresh = deferred();
    const reply = deferred();
    h.save
      .mockResolvedValueOnce({
        status: 'saved',
        source: { filename: 'lrclib-42.lrc' },
      })
      .mockReturnValueOnce(reply.promise);
    h.refreshLibrary.mockReturnValueOnce(refresh.promise);
    const first = h.saveLyricsProviderCandidate('lrclib', candidate);
    await vi.waitFor(() => expect(h.refreshLibrary).toHaveBeenCalledOnce());
    h.clearCandidateSearch();
    const second = h.saveLyricsProviderCandidate('lrclib', {
      ...candidate,
      id: 43,
    });
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    refresh.reject(new Error('private refresh error'));
    await first;
    expect(h.state.manualSave).toMatchObject({ error: null, isSaving: true });
    reply.resolve({ status: 'error', reason: 'busy' });
    await second;
  });

  it.each(['typed', 'exception'])(
    'ignores a late %s failure after leaving the search workspace',
    async (kind) => {
      const h = harness();
      const reply = deferred();
      h.save.mockReturnValue(reply.promise);
      const saving = h.saveLyricsProviderCandidate('lrclib', candidate);
      await vi.waitFor(() => expect(h.save).toHaveBeenCalledOnce());
      h.clearCandidateSearch();
      if (kind === 'typed')
        reply.resolve({ status: 'error', reason: 'service-unavailable' });
      else reply.reject(new Error('private provider body'));
      expect(await saving).toBeNull();
      expect(h.state.manualSave.error).toBeNull();
      expect(h.state.manualSave.isSaving).toBe(false);
    },
  );

  it('does not start a save or publish gate errors after its query generation changes', async () => {
    const gate = deferred();
    const h = harness({ gate: () => gate.promise });
    const saving = h.saveLyricsProviderCandidate('lrclib', candidate);
    h.clearCandidateSearch();
    gate.resolve(false);
    await saving;
    expect(h.save).not.toHaveBeenCalled();
    expect(h.state.candidateSearch.error).toBeNull();
    expect(h.state.manualSave.error).toBeNull();
  });

  it('does not send an allowed save after its pending gate becomes stale', async () => {
    const gate = deferred();
    const h = harness({ gate: () => gate.promise });
    const saving = h.saveLyricsProviderCandidate('lrclib', candidate);
    h.clearCandidateSearch();
    gate.resolve(true);
    await saving;
    expect(h.save).not.toHaveBeenCalled();
  });

  it('does not clear a newer attempt loading state or overwrite its error', async () => {
    const h = harness();
    const first = deferred();
    const second = deferred();
    h.save
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const oldSave = h.saveLyricsProviderCandidate('lrclib', candidate);
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    h.clearCandidateSearch();
    const newSave = h.saveLyricsProviderCandidate('lrclib', {
      ...candidate,
      id: 43,
    });
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    first.resolve({ status: 'error', reason: 'service-unavailable' });
    await oldSave;
    expect(h.state.manualSave).toMatchObject({ isSaving: true, error: null });
    second.resolve({ status: 'error', reason: 'busy' });
    await newSave;
    expect(h.state.manualSave.isSaving).toBe(false);
    expect(h.state.manualSave.error).toBeTruthy();
  });

  it('refreshes committed data but does not select or replace candidates in a newer query', async () => {
    const h = harness();
    const reply = deferred();
    h.save.mockReturnValue(reply.promise);
    const saving = h.saveLyricsProviderCandidate('lrclib', candidate);
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    await h.searchLyricsProviderCandidates('lrclib', {
      query: { title: 'New query' },
    });
    h.state.candidateSearch.candidates = [candidate];
    reply.resolve({ status: 'saved', source: { filename: 'lrclib-42.lrc' } });
    expect(await saving).toBeNull();
    expect(h.refreshLibrary).toHaveBeenCalledOnce();
    expect(h.selectSource).not.toHaveBeenCalled();
    expect(h.state.candidateSearch.candidates[0].alreadySaved).not.toBe(true);
  });

  it('ignores a failure when selection changes without a new query', async () => {
    const h = harness();
    const reply = deferred();
    h.save.mockReturnValue(reply.promise);
    const saving = h.saveLyricsProviderCandidate('lrclib', candidate);
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    h.state.selectedTrackId = 'other';
    reply.resolve({ status: 'error', reason: 'service-unavailable' });
    await saving;
    expect(h.state.manualSave.error).toBeNull();
  });

  it('retains partial warnings for a single-provider search', async () => {
    const h = harness();
    h.search.mockResolvedValue({
      provider: 'lrclib',
      status: 'ok',
      partial: true,
      reason: 'rate-limited',
      candidates: [candidate],
    });
    await h.searchLyricsProviderCandidates('lrclib', {});
    expect(h.state.candidateSearch.providerStatuses).toEqual([
      {
        provider: 'lrclib',
        status: 'ok',
        partial: true,
        reason: 'rate-limited',
      },
    ]);
    expect(h.state.candidateSearch.error).toBeNull();
  });

  it('distinguishes a save-time network verification failure from a persistence failure', async () => {
    const h = harness();
    h.save.mockResolvedValue({
      status: 'error',
      reason: 'service-unavailable',
    });
    await h.saveLyricsProviderCandidate('lrclib', candidate);
    expect(h.state.manualSave.error).toContain('驗證');
    h.save.mockRejectedValue(new Error('private filesystem path'));
    await h.saveLyricsProviderCandidate('lrclib', candidate);
    expect(h.state.manualSave.error).toBe('歌詞儲存未完成，請再試一次。');
    expect(h.state.manualSave.error).not.toContain('private');
  });
});

describe('source label backfill', () => {
  it('reports a disabled lyrics flow on the source action without calling IPC', async () => {
    const h = harness({ gate: vi.fn().mockResolvedValue(false) });
    h.state.sourceAction = { operation: null, attempt: 0, error: null };
    window.Utawakui.backfillLyricsSourceLabels = vi.fn();
    expect(await h.backfillSourceLabels()).toBeNull();
    expect(h.state.sourceAction).toEqual({
      operation: 'backfill-labels',
      attempt: 1,
      error: '請先到設定啟用歌詞來源',
    });
    expect(window.Utawakui.backfillLyricsSourceLabels).not.toHaveBeenCalled();
  });
});
