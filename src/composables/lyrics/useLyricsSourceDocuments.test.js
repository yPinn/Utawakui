import { reactive, shallowRef, readonly, isProxy } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLyricsSourceDocuments } from './useLyricsSourceDocuments.js';

afterEach(() => vi.unstubAllGlobals());

function setup(prepareLyrics) {
  let sequence = 0;
  const getTrackLyrics = vi.fn(async (id) => ({
    text: `${id}中文`,
    source: { filename: 'zh.vtt' },
    sourceSession: {
      id: `${id}-${++sequence}`,
      timingRevision: 't0',
      offsetRevision: 'o0',
    },
    timing: { status: 'missing', sourceFingerprint: 'a'.repeat(64) },
  }));
  vi.stubGlobal('window', { Utawakui: { getTrackLyrics } });
  const state = reactive({
    selectedSourceFilename: 'zh.vtt',
    selectedTrackId: 'a',
    timingSave: {},
    offsetSave: {},
    manualSave: {},
    lyricsText: '',
  });
  const selectedTrack = shallowRef({ id: 'a' });
  const reportLyricsError = vi.fn(() => 'load failed');
  const owner = useLyricsSourceDocuments({
    state,
    selectedTrack,
    prepareLyrics,
    reportLyricsError,
  });
  return { state, selectedTrack, owner, getTrackLyrics };
}

describe('lyrics source preparation boundary', () => {
  it('cancels a scoped offset before IPC and restores only its own preview without overwriting a newer edit', async () => {
    for (const newer of [false, true]) {
      const f = setup();
      await f.owner.loadSelectedLyrics();
      let current = true;
      window.Utawakui.setLyricsSourceOffset = vi.fn(
        async (_id, _name, offsetMs) => ({
          source: { offsetMs },
          sourceSession: {
            ...f.owner.sourceSession.value,
            offsetRevision: 'new',
          },
        }),
      );
      const old = f.owner.adjustOffset(0.1, { isCurrent: () => current });
      current = false;
      const fresh = newer ? f.owner.adjustOffset(0.1) : null;
      expect(await old).toBeNull();
      if (fresh) await fresh;
      expect(window.Utawakui.setLyricsSourceOffset).toHaveBeenCalledTimes(
        newer ? 1 : 0,
      );
      expect(f.state.offsetSeconds).toBe(newer ? 0.2 : 0);
      expect(f.state.offsetSave.isSaving).toBe(false);
    }
  });
  it('returns the offset owner persistence result rather than claiming an immediate save', async () => {
    const f = setup();
    await f.owner.loadSelectedLyrics();
    const saved = Promise.withResolvers();
    window.Utawakui.setLyricsSourceOffset = vi.fn(() => saved.promise);
    const task = f.owner.adjustOffset(0.1);
    expect(task).toBeInstanceOf(Promise);
    const value = {
      source: { offsetMs: 100 },
      sourceSession: { ...f.owner.sourceSession.value, offsetRevision: 'o1' },
    };
    saved.resolve(value);
    expect(await task).toEqual(value);
    expect(f.owner.sourceSession.value.offsetRevision).toBe('o1');
  });
  it('keeps the canonical identity and queued offset through a same-source refresh', async () => {
    const f = setup(),
      session = { id: 'stable', timingRevision: 't0', offsetRevision: 'o0' };
    f.getTrackLyrics.mockResolvedValue({
      text: 'Hello',
      source: { filename: 'zh.vtt' },
      sourceSession: session,
      timing: {
        status: 'current',
        sourceFingerprint: 'a'.repeat(64),
        document: { documentId: 'canonical' },
      },
    });
    await f.owner.loadSelectedLyrics();
    const offset = Promise.withResolvers();
    window.Utawakui.setLyricsSourceOffset = vi.fn(() => offset.promise);
    f.owner.adjustOffset(0.1);
    await Promise.resolve();
    const refresh = f.owner.loadSelectedLyrics();
    expect(f.owner.lyricsTiming.value.document?.documentId).toBe('canonical');
    expect(f.state.offsetSeconds).toBe(0.1);
    f.getTrackLyrics.mockResolvedValue({
      text: 'Hello',
      source: { filename: 'zh.vtt', offsetMs: 100 },
      sourceSession: { ...session, offsetRevision: 'o1' },
      timing: {
        status: 'current',
        sourceFingerprint: 'a'.repeat(64),
        document: { documentId: 'canonical' },
      },
    });
    offset.resolve({
      source: { offsetMs: 100 },
      sourceSession: { ...session, offsetRevision: 'o1' },
    });
    await refresh;
    expect(await f.owner.waitForSavedOffset()).toBe(true);
    expect(f.state.offsetSeconds).toBe(0.1);
  });
  it('does not discard a failed offset preview when refreshing the same source', async () => {
    const f = setup(),
      session = { id: 'stable', timingRevision: 't0', offsetRevision: 'o0' };
    f.getTrackLyrics.mockResolvedValue({
      text: 'Hello',
      source: { filename: 'zh.vtt' },
      sourceSession: session,
    });
    await f.owner.loadSelectedLyrics();
    window.Utawakui.setLyricsSourceOffset = vi.fn(async () => {
      throw Error('failed');
    });
    f.owner.adjustOffset(0.1);
    await f.owner.waitForSavedOffset();
    await f.owner.loadSelectedLyrics();
    expect(f.state.offsetSeconds).toBe(0.1);
    expect(f.state.offsetSave.error).toBeTruthy();
    expect(await f.owner.waitForSavedOffset()).toBe(false);
  });
  it('sends a plain captured session across the context bridge instead of a readonly Vue proxy', async () => {
    const f = setup();
    await f.owner.loadSelectedLyrics();
    const baseline = readonly(shallowRef(f.owner.sourceSession.value)).value;
    window.Utawakui.saveLyricsTiming = vi.fn(
      async (_track, _source, _fingerprint, document, session) => {
        expect(isProxy(session)).toBe(false);
        expect(isProxy(document)).toBe(false);
        return { document, sourceSession: session };
      },
    );
    expect(
      await f.owner.saveTimingDocument({ documentId: 'bridge' }, baseline),
    ).toEqual({ documentId: 'bridge' });
  });
  it('retains a committed timing result across its own same-source refresh without applying an older snapshot', async () => {
    const f = setup(),
      session = { id: 'same', timingRevision: 't0', offsetRevision: 'o0' };
    f.getTrackLyrics.mockResolvedValue({
      text: 'a中文',
      source: { filename: 'zh.vtt' },
      sourceSession: session,
      timing: { status: 'missing', sourceFingerprint: 'a'.repeat(64) },
    });
    await f.owner.loadSelectedLyrics();
    const pending = Promise.withResolvers();
    window.Utawakui.saveLyricsTiming = vi.fn(() => pending.promise);
    const save = f.owner.saveTimingDocument({ documentId: 'saved' });
    const next = { ...session, timingRevision: 't1' };
    f.getTrackLyrics.mockResolvedValue({
      text: 'a中文',
      source: { filename: 'zh.vtt' },
      sourceSession: next,
      timing: {
        status: 'current',
        sourceFingerprint: 'a'.repeat(64),
        document: { documentId: 'saved', fresh: true },
      },
    });
    await f.owner.loadSelectedLyrics();
    pending.resolve({ document: { documentId: 'saved' }, sourceSession: next });
    expect(await save).toEqual({ documentId: 'saved' });
    expect(f.owner.lyricsTiming.value.document.fresh).toBe(true);
    expect(f.state.timingSave.isSaving).toBe(false);
  });
  it('serializes offset saves and exposes only a settled saved-preview barrier', async () => {
    const f = setup();
    await f.owner.loadSelectedLyrics();
    const first = Promise.withResolvers(),
      second = Promise.withResolvers();
    window.Utawakui.setLyricsSourceOffset = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    f.owner.adjustOffset(0.1);
    f.owner.adjustOffset(0.1);
    await Promise.resolve();
    expect(window.Utawakui.setLyricsSourceOffset).toHaveBeenCalledTimes(1);
    const barrier = f.owner.waitForSavedOffset();
    first.resolve({
      source: { offsetMs: 100 },
      sourceSession: { ...f.owner.sourceSession.value, offsetRevision: 'o1' },
    });
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(window.Utawakui.setLyricsSourceOffset).toHaveBeenLastCalledWith(
      'a',
      'zh.vtt',
      200,
      expect.objectContaining({ offsetRevision: 'o1' }),
    );
    expect(f.state.offsetSave.isSaving).toBe(true);
    expect(f.state.offsetSeconds).toBe(0.2);
    second.resolve({
      source: { offsetMs: 200 },
      sourceSession: { ...f.owner.sourceSession.value, offsetRevision: 'o2' },
    });
    expect(await barrier).toBe(true);
    expect(f.owner.savedOffsetMs.value).toBe(200);
  });
  it.each([true, false])(
    'isolates an old timing save after A-B-A, including finally: success=%s',
    async (success) => {
      const f = setup();
      await f.owner.loadSelectedLyrics();
      const old = Promise.withResolvers(),
        next = Promise.withResolvers();
      window.Utawakui.saveLyricsTiming = vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise);
      const saved = f.owner.saveTimingDocument({ documentId: 'old' });
      f.state.selectedTrackId = 'b';
      f.selectedTrack.value = { id: 'b' };
      await f.owner.loadSelectedLyrics();
      f.state.selectedTrackId = 'a';
      f.selectedTrack.value = { id: 'a' };
      await f.owner.loadSelectedLyrics();
      const current = f.owner.saveTimingDocument({ documentId: 'new' });
      if (success) old.resolve({ document: { documentId: 'old' } });
      else old.reject(Error('private'));
      expect(await saved).toBeNull();
      expect(f.state.timingSave.isSaving).toBe(true);
      expect(f.state.timingSave.error).toBeNull();
      next.resolve({ document: { documentId: 'new' } });
      expect(await current).toEqual({ documentId: 'new' });
      expect(f.owner.lyricsTiming.value.document.documentId).toBe('new');
    },
  );
  it('cancels old authority on reload and refuses a draft from that older session', async () => {
    const f = setup();
    window.Utawakui.cancelLyricsSourceSession = vi.fn();
    window.Utawakui.saveLyricsTiming = vi.fn();
    await f.owner.loadSelectedLyrics();
    const old = f.owner.sourceSession.value;
    await f.owner.loadSelectedLyrics();
    expect(window.Utawakui.cancelLyricsSourceSession).toHaveBeenCalledWith(
      old.id,
    );
    expect(await f.owner.saveTimingDocument({}, old)).toBeNull();
    expect(window.Utawakui.saveLyricsTiming).not.toHaveBeenCalled();
  });
  it('does not let old offset failure or success change a newer source queue', async () => {
    const f = setup();
    await f.owner.loadSelectedLyrics();
    const old = Promise.withResolvers();
    window.Utawakui.setLyricsSourceOffset = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ source: { offsetMs: 100 } });
    f.owner.adjustOffset(0.1);
    await Promise.resolve();
    f.state.selectedTrackId = 'b';
    f.selectedTrack.value = { id: 'b' };
    await f.owner.loadSelectedLyrics();
    f.owner.adjustOffset(0.1);
    expect(await f.owner.waitForSavedOffset()).toBe(true);
    old.reject(Error('private'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.state.offsetSave).toMatchObject({ isSaving: false, error: null });
    expect(f.owner.savedOffsetMs.value).toBe(100);
  });
  it('loads optional estimates without delaying canonical lyrics and isolates late responses', async () => {
    const { state, selectedTrack, owner } = setup();
    let finish;
    window.Utawakui.getLyricsAcousticEstimate = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ status: 'stale' });
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('a中文');
    expect(state.isLoadingLyrics).toBe(false);
    selectedTrack.value = { id: 'b' };
    await owner.loadSelectedLyrics();
    await owner.waitForSelectedAcousticEstimate();
    finish({ status: 'ready', preview: { estimateId: 'old' } });
    await Promise.resolve();
    expect(owner.lyricsAcousticEstimate.value).toEqual({ status: 'stale' });
    expect(state.lyricsText).toBe('b中文');
  });

  it('preserves canonical playback when optional estimate loading fails', async () => {
    const { state, owner } = setup();
    window.Utawakui.getLyricsAcousticEstimate = vi
      .fn()
      .mockRejectedValue(new Error('private path'));
    await owner.loadSelectedLyrics();
    await owner.waitForSelectedAcousticEstimate();
    expect(owner.lyricsAcousticEstimate.value).toEqual({
      status: 'unavailable',
    });
    expect(state.lyricsText).toBe('a中文');
    expect(state.error).toBeNull();
  });
  it('loads immediately when no custom preparation step is provided', async () => {
    const { state, owner } = setup();
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('a中文');
    expect(state.isLoadingLyrics).toBe(false);
    expect(state.error).toBeNull();
  });

  it('keeps the loaded source and explains recovery when the label bridge is unavailable', async () => {
    const { state, owner } = setup();
    await owner.loadSelectedLyrics();
    expect(await owner.setSourceLabel('zh.vtt', '排練用')).toBeNull();
    expect(state.sourceAction).toMatchObject({
      operation: 'set-label',
      error: '請重新啟動應用程式後再試。',
    });
    expect(state.lyricsText).toBe('a中文');
    expect(state.selectedSourceFilename).toBe('zh.vtt');
    expect(state.sourceAction.isSaving).not.toBe(true);
  });
  it('does not publish Chinese text until preparation completes', async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { state, owner } = setup(() => pending);
    const load = owner.loadSelectedLyrics();
    await Promise.resolve();
    expect(state.lyricsText).toBe('');
    expect(state.isLoadingLyrics).toBe(true);
    resolve();
    await load;
    expect(state.lyricsText).toBe('a中文');
    expect(state.isLoadingLyrics).toBe(false);
  });

  it('discards a stale source while its converter is loading', async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { state, selectedTrack, owner } = setup(
      vi.fn().mockReturnValueOnce(pending),
    );
    const first = owner.loadSelectedLyrics();
    await Promise.resolve();
    selectedTrack.value = { id: 'b' };
    await owner.loadSelectedLyrics();
    resolve();
    await first;
    expect(state.lyricsText).toBe('b中文');
  });

  it('reports failed preparation and permits reloading the same source', async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockReturnValue(null);
    const { state, owner } = setup(prepare);
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('');
    expect(state.error).toBe('load failed');
    await owner.loadSelectedLyrics();
    expect(state.lyricsText).toBe('a中文');
    expect(state.error).toBeNull();
  });
});
