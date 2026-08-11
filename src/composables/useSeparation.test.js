import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useSeparation.js is a module-scope singleton that subscribes to
// window.Utawakui.onSeparationProgress at import time — resetModules +
// re-stubbing window before each dynamic import gives every test a fresh
// module instance instead of leaking inFlight/errors state between tests.
let progressCallback;
let separateTrackMock;
let selectSeparationResultMock;

beforeEach(() => {
  vi.resetModules();
  separateTrackMock = vi.fn();
  selectSeparationResultMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      onSeparationProgress: (callback) => {
        progressCallback = callback;
      },
      separateTrack: separateTrackMock,
      selectSeparationResult: selectSeparationResultMock,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadSeparation() {
  const { useSeparation } = await import('./useSeparation.js');
  return useSeparation();
}

describe('describe()', () => {
  it('returns 準備中 before any progress event has arrived for a track', async () => {
    const { describe: describeStage } = await loadSeparation();
    expect(describeStage('t1')).toBe('準備中');
  });

  it('maps each known stage to its label', async () => {
    const { describe: describeStage } = await loadSeparation();
    progressCallback({ trackId: 't1', stage: 'downloading-model' });
    expect(describeStage('t1')).toBe('下載模型中');
    progressCallback({ trackId: 't1', stage: 'loading-model' });
    expect(describeStage('t1')).toBe('載入模型中');
    progressCallback({ trackId: 't1', stage: 'decoding' });
    expect(describeStage('t1')).toBe('解碼中');
    progressCallback({ trackId: 't1', stage: 'writing' });
    expect(describeStage('t1')).toBe('寫入中');
  });

  it('includes the percent for the separating stage, defaulting to 0', async () => {
    const { describe: describeStage } = await loadSeparation();
    progressCallback({ trackId: 't1', stage: 'separating', percent: 42 });
    expect(describeStage('t1')).toBe('分離中 42%');
    progressCallback({ trackId: 't1', stage: 'separating' });
    expect(describeStage('t1')).toBe('分離中 0%');
  });

  it('falls back to 準備中 for an unrecognized stage', async () => {
    const { describe: describeStage } = await loadSeparation();
    progressCallback({ trackId: 't1', stage: 'some-future-stage' });
    expect(describeStage('t1')).toBe('準備中');
  });
});

describe('isSeparating()', () => {
  it('is true only for a track with an in-flight entry', async () => {
    const { isSeparating } = await loadSeparation();
    progressCallback({ trackId: 't1', stage: 'decoding' });
    expect(isSeparating('t1')).toBe(true);
    expect(isSeparating('t2')).toBe(false);
  });
});

describe('separate()', () => {
  it('is a no-op while the same track is already separating', async () => {
    const { separate, isSeparating } = await loadSeparation();
    separateTrackMock.mockImplementation(() => new Promise(() => {}));
    const track = { id: 't1', title: 'Song' };

    separate(track);
    expect(isSeparating('t1')).toBe(true);

    separate(track);
    expect(separateTrackMock).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight entry on success, with no error recorded', async () => {
    const { separate, isSeparating, state } = await loadSeparation();
    separateTrackMock.mockResolvedValue({ stemsUrl: 'utawakui-media://x' });
    const track = { id: 't1', title: 'Song' };

    await separate(track);

    expect(isSeparating('t1')).toBe(false);
    expect(state.errors.has('t1')).toBe(false);
  });

  it('clears the in-flight entry and records a message on failure', async () => {
    const { separate, isSeparating, state } = await loadSeparation();
    separateTrackMock.mockRejectedValue(new Error('boom'));
    const track = { id: 't1', title: 'Song' };

    await separate(track);

    expect(isSeparating('t1')).toBe(false);
    expect(state.errors.get('t1')).toBe('Song 分離失敗:boom');
  });

  it('forwards the preset id to window.Utawakui.separateTrack', async () => {
    const { separate } = await loadSeparation();
    separateTrackMock.mockResolvedValue({ stemsUrl: 'x' });
    const track = { id: 't1', title: 'Song' };

    await separate(track, 'high-quality');

    expect(separateTrackMock).toHaveBeenCalledWith('t1', 'high-quality');
  });

  it('clears a previous error for the track when retried', async () => {
    const { separate, state } = await loadSeparation();
    const track = { id: 't1', title: 'Song' };

    separateTrackMock.mockRejectedValueOnce(new Error('first failure'));
    await separate(track);
    expect(state.errors.has('t1')).toBe(true);

    separateTrackMock.mockResolvedValueOnce({ stemsUrl: 'x' });
    await separate(track);
    expect(state.errors.has('t1')).toBe(false);
  });
});

describe('selectResult()', () => {
  it('forwards trackId/presetId to window.Utawakui.selectSeparationResult', async () => {
    const { selectResult } = await loadSeparation();
    selectSeparationResultMock.mockResolvedValue({ ok: true });
    const track = { id: 't1', title: 'Song' };

    await selectResult(track, 'inst-hq3');

    expect(selectSeparationResultMock).toHaveBeenCalledWith('t1', 'inst-hq3');
  });

  it('records a message on failure, distinct from separate() failures', async () => {
    const { selectResult, state } = await loadSeparation();
    selectSeparationResultMock.mockRejectedValue(new Error('boom'));
    const track = { id: 't1', title: 'Song' };

    await selectResult(track, 'inst-hq3');

    expect(state.errors.get('t1')).toBe('Song 切換失敗:boom');
  });

  it('clears a previous error for the track on success', async () => {
    const { selectResult, state } = await loadSeparation();
    const track = { id: 't1', title: 'Song' };

    selectSeparationResultMock.mockRejectedValueOnce(new Error('first'));
    await selectResult(track, 'inst-hq3');
    expect(state.errors.has('t1')).toBe(true);

    selectSeparationResultMock.mockResolvedValueOnce({ ok: true });
    await selectResult(track, 'inst-hq3');
    expect(state.errors.has('t1')).toBe(false);
  });
});
