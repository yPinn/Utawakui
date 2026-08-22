import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useSeparation.js is a module-scope singleton that subscribes to
// window.Utawakui.onSeparationProgress at import time — resetModules +
// re-stubbing window before each dynamic import gives every test a fresh
// module instance instead of leaking inFlight/errors state between tests.
let progressCallback;
let runSeparationMock;
let selectSeparationResultMock;
let getFeatureConfirmationsMock;

const confirmedAudioProcessingFlow = {
  featureId: 'audio-processing-flow',
  noticeVersion: 'feature-notice-v3',
  confirmedAt: '2026-08-20T00:00:00.000Z',
  enabled: true,
};

function createStructuredAppError(payload) {
  return new Error(`UTAWAKUI_APP_ERROR:${JSON.stringify(payload)}`);
}

beforeEach(() => {
  vi.resetModules();
  runSeparationMock = vi.fn();
  selectSeparationResultMock = vi.fn();
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({
    'audio-processing-flow': confirmedAudioProcessingFlow,
  });
  vi.stubGlobal('window', {
    Utawakui: {
      getFeatureConfirmations: getFeatureConfirmationsMock,
      confirmFeatureGate: vi.fn(),
      onSeparationProgress: (callback) => {
        progressCallback = callback;
      },
      runSeparation: runSeparationMock,
      selectSeparationResult: selectSeparationResultMock,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function flushPromises() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

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
    progressCallback({ trackId: 't1', stage: 'loading-model' });
    expect(describeStage('t1')).toBe('載入模型中');
    progressCallback({ trackId: 't1', stage: 'decoding' });
    expect(describeStage('t1')).toBe('解碼中');
    progressCallback({ trackId: 't1', stage: 'writing' });
    expect(describeStage('t1')).toBe('寫入中');
  });

  it('does not present dependency downloads as separation run stages', async () => {
    const { describe: describeStage } = await loadSeparation();
    progressCallback({ trackId: 't1', stage: 'downloading-ffmpeg' });
    expect(describeStage('t1')).toBe('準備中');
    progressCallback({ trackId: 't1', stage: 'downloading-model' });
    expect(describeStage('t1')).toBe('準備中');
  });

  it('includes the percent for the separating stage and preserves the latest value', async () => {
    const { describe: describeStage } = await loadSeparation();
    progressCallback({ trackId: 't1', stage: 'separating', percent: 42 });
    expect(describeStage('t1')).toBe('分離中 42%');
    progressCallback({ trackId: 't1', stage: 'separating' });
    expect(describeStage('t1')).toBe('分離中 42%');
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

describe('inFlightPresetId()', () => {
  it('is null for a track with no in-flight entry', async () => {
    const { inFlightPresetId } = await loadSeparation();
    expect(inFlightPresetId('t1')).toBeNull();
  });

  it('reports the preset seeded by separate() before any progress event arrives', async () => {
    const { separate, inFlightPresetId } = await loadSeparation();
    const { useFeatureGates } = await import('./useFeatureGates.js');
    await useFeatureGates().refreshConfirmations();
    runSeparationMock.mockImplementation(() => new Promise(() => {}));
    const track = { id: 't1', title: 'Song' };

    separate(track, 'general');
    await flushPromises();

    expect(inFlightPresetId('t1')).toBe('general');
  });

  it('tracks the preset id carried by progress events', async () => {
    const { inFlightPresetId } = await loadSeparation();
    progressCallback({
      trackId: 't1',
      recipeId: 'general',
      stage: 'separating',
      percent: 10,
    });
    expect(inFlightPresetId('t1')).toBe('general');
  });

  it('clears once the run finishes', async () => {
    const { separate, inFlightPresetId } = await loadSeparation();
    runSeparationMock.mockResolvedValue({ stemsUrl: 'x' });
    const track = { id: 't1', title: 'Song' };

    await separate(track, 'general');

    expect(inFlightPresetId('t1')).toBeNull();
  });
});

describe('shared preset selection', () => {
  it('falls back to the track manifest and then the default preset', async () => {
    const { presetIdFor } = await loadSeparation();

    expect(
      presetIdFor({
        id: 't1',
        separation: { selectedRecipeId: 'general' },
      }),
    ).toBe('general');
    expect(presetIdFor({ id: 't2' })).toBe('general');
  });

  it('shares a pending preset choice across composable consumers per track', async () => {
    const first = await loadSeparation();
    const second = await loadSeparation();
    const track = { id: 't1', title: 'Song', separation: { results: {} } };

    await first.selectPreset(track, 'quick');

    expect(second.presetIdFor(track)).toBe('quick');
    expect(selectSeparationResultMock).not.toHaveBeenCalled();
    expect(second.presetIdFor({ id: 't2' })).toBe('general');
  });

  it('selects an existing result while retaining the shared choice', async () => {
    const { presetIdFor, selectPreset } = await loadSeparation();
    const track = {
      id: 't1',
      title: 'Song',
      separation: {
        results: { 'high-quality': { modelIds: ['kara2'], legacy: true } },
      },
    };

    await selectPreset(track, 'high-quality');

    expect(presetIdFor(track)).toBe('high-quality');
    expect(selectSeparationResultMock).toHaveBeenCalledWith(
      't1',
      'high-quality',
    );
  });

  it('allows an unknown legacy result to be selected for recovery but not generated', async () => {
    const { presetIdFor, selectPreset, separate } = await loadSeparation();
    const track = {
      id: 't1',
      title: 'Song',
      separation: {
        selectedRecipeId: 'old-experiment',
        results: { 'old-experiment': { legacy: true } },
      },
    };

    expect(presetIdFor(track)).toBe('old-experiment');
    await selectPreset(track, 'old-experiment');
    await separate(track, 'old-experiment');

    expect(selectSeparationResultMock).toHaveBeenCalledWith(
      't1',
      'old-experiment',
    );
    expect(runSeparationMock).not.toHaveBeenCalled();
  });

  it('keeps the previous shared choice when switching an existing result fails', async () => {
    const { presetIdFor, selectPreset } = await loadSeparation();
    const track = {
      id: 't1',
      title: 'Song',
      separation: {
        selectedRecipeId: 'quick',
        results: {
          'high-quality': { modelIds: ['kara2'], legacy: true },
        },
      },
    };
    selectSeparationResultMock.mockRejectedValue(new Error('boom'));

    await selectPreset(track, 'high-quality');

    expect(presetIdFor(track)).toBe('quick');
  });
});

describe('progressPercent()', () => {
  it('reports a stable numeric percentage across non-numeric progress stages', async () => {
    const { progressPercent } = await loadSeparation();

    progressCallback({ trackId: 't1', stage: 'separating', percent: 42 });
    expect(progressPercent('t1')).toBe(42);

    progressCallback({ trackId: 't1', stage: 'writing' });
    expect(progressPercent('t1')).toBe(42);
  });
});

describe('separate()', () => {
  it('is a no-op while the same track is already separating', async () => {
    const { separate, isSeparating } = await loadSeparation();
    const { useFeatureGates } = await import('./useFeatureGates.js');
    await useFeatureGates().refreshConfirmations();
    runSeparationMock.mockImplementation(() => new Promise(() => {}));
    const track = { id: 't1', title: 'Song' };

    separate(track);
    await flushPromises();
    expect(isSeparating('t1')).toBe(true);

    separate(track);
    expect(runSeparationMock).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight entry on success, with no error recorded', async () => {
    const { separate, isSeparating, state } = await loadSeparation();
    runSeparationMock.mockResolvedValue({ stemsUrl: 'utawakui-media://x' });
    const track = { id: 't1', title: 'Song' };

    await separate(track);

    expect(isSeparating('t1')).toBe(false);
    expect(state.errors.has('t1')).toBe(false);
  });

  it('clears the in-flight entry and records a message on failure', async () => {
    const { separate, isSeparating, state } = await loadSeparation();
    runSeparationMock.mockRejectedValue(new Error('boom'));
    const track = { id: 't1', title: 'Song' };

    await separate(track);

    expect(isSeparating('t1')).toBe(false);
    expect(state.errors.get('t1')).toBe('Song 分離失敗:boom');
  });

  it('forwards the recipe id to window.Utawakui.runSeparation', async () => {
    const { separate } = await loadSeparation();
    runSeparationMock.mockResolvedValue({ stemsUrl: 'x' });
    const track = { id: 't1', title: 'Song' };

    await separate(track, 'general');

    expect(runSeparationMock).toHaveBeenCalledWith('t1', 'general');
  });

  it('does not regenerate a legacy high-quality result', async () => {
    const { separate } = await loadSeparation();
    const track = { id: 't1', title: 'Song' };

    await separate(track, 'high-quality');

    expect(runSeparationMock).not.toHaveBeenCalled();
  });

  it('clears a previous error for the track when retried', async () => {
    const { separate, state } = await loadSeparation();
    const track = { id: 't1', title: 'Song' };

    runSeparationMock.mockRejectedValueOnce(new Error('first failure'));
    await separate(track);
    expect(state.errors.has('t1')).toBe(true);

    runSeparationMock.mockResolvedValueOnce({ stemsUrl: 'x' });
    await separate(track);
    expect(state.errors.has('t1')).toBe(false);
  });

  it('routes missing audio-processing dependencies to Settings with a short track error', async () => {
    const { separate, isSeparating, state } = await loadSeparation();
    const { useAppView } = await import('./useAppView.js');
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');
    runSeparationMock.mockRejectedValue(
      createStructuredAppError({
        code: 'FEATURE_DEPENDENCY_MISSING',
        severity: 'warning',
        title: '需要先準備音訊處理項目',
        message:
          '請先到設定頁準備「FFmpeg essentials build」，再執行這項音訊處理。',
        actionLabel: '前往設定',
        context: {
          featureId: 'audio-processing-flow',
          dependencyId: 'ffmpeg-gyan-essentials',
        },
      }),
    );
    const track = { id: 't1', title: '輕輕對你說' };

    await separate(track, 'quick');

    expect(isSeparating('t1')).toBe(false);
    expect(useAppView().activeView.value).toBe('settings');
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'audio-processing-flow',
      kind: 'setup',
      title: '需要準備音訊處理項目',
      message: '請先到設定準備音訊處理項目',
      actionLabel: '查看準備項目',
      source: 'separation',
      operation: 'run',
      context: {
        trackId: 't1',
        presetId: 'quick',
        dependencyId: 'ffmpeg-gyan-essentials',
      },
    });
    expect(state.errors.get('t1')).toBe('請先到設定準備音訊處理項目');
  });

  it('does not start separation when audio-processing-flow is not enabled', async () => {
    getFeatureConfirmationsMock.mockResolvedValue({});
    const { separate, isSeparating, state } = await loadSeparation();
    const { useAppView } = await import('./useAppView.js');
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');
    const track = { id: 't1', title: 'Song' };

    await separate(track);

    expect(isSeparating('t1')).toBe(false);
    expect(runSeparationMock).not.toHaveBeenCalled();
    expect(useAppView().activeView.value).toBe('settings');
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'audio-processing-flow',
      source: 'separation',
      operation: 'run',
    });
    expect(state.errors.get('t1')).toBe('請先到設定啟用音訊處理');
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
