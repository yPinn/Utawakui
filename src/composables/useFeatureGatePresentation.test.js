import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let updatedCallback;
let progressCallback;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', {
    Utawakui: {
      listFeatureDependencies: vi.fn().mockResolvedValue([]),
      prepareFeatureDependency: vi.fn(),
      onFeatureDependenciesUpdated: (callback) => {
        updatedCallback = callback;
        return vi.fn();
      },
      onFeatureDependencyProgress: (callback) => {
        progressCallback = callback;
        return vi.fn();
      },
      getFeatureConfirmations: vi.fn().mockResolvedValue({}),
      confirmFeatureGate: vi.fn(),
      getYtdlpStatus: vi.fn().mockResolvedValue({}),
      checkYtdlpUpdate: vi.fn().mockRejectedValue(new Error('offline')),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadPresentation(options) {
  const { useFeatureGatePresentation } =
    await import('./useFeatureGatePresentation.js');
  return useFeatureGatePresentation(options);
}

function findGateRow(presentation, gateId) {
  return presentation.featureGateRows.value.find((row) => row.id === gateId);
}

function findItem(presentation, gateId, dependencyId) {
  return findGateRow(presentation, gateId).items.find(
    (item) => item.id === dependencyId,
  );
}

describe('useFeatureGatePresentation', () => {
  it('renders the disclosure value for each of the four registry dependencies', async () => {
    const presentation = await loadPresentation();

    expect(
      findItem(presentation, 'provider-flow', 'yt-dlp-provider-tool').value,
    ).toBe('yt-dlp / GPLv3+ / 隨附');
    expect(
      findItem(presentation, 'audio-processing-flow', 'ffmpeg-gyan-essentials')
        .value,
    ).toBe('Gyan FFmpeg / GPLv3 / latest release');
    expect(
      findItem(presentation, 'audio-processing-flow', 'uvr-mdxnet-kara-2')
        .value,
    ).toBe('UVR 模型 / MIT');
    expect(
      findItem(presentation, 'audio-processing-flow', 'uvr-mdxnet-inst-hq-3')
        .value,
    ).toBe('UVR 模型 / MIT');
  });

  it('defaults to a warning tone with only the refresh advanced action when nothing is installed', async () => {
    const presentation = await loadPresentation();
    const item = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );

    expect(item.statusTone).toBe('warning');
    expect(item.advancedActions).toHaveLength(1);
    expect(item.advancedActions[0].id).toBe('refresh');
  });

  it('switches to a success tone and gains repair/remove actions once installed', async () => {
    const presentation = await loadPresentation();

    updatedCallback([
      {
        id: 'ffmpeg-gyan-essentials',
        featureId: 'audio-processing-flow',
        kind: 'binary',
        name: 'FFmpeg essentials build',
        version: 'release',
        displayVersion: 'latest release',
        license: 'GPL-3.0',
        installed: true,
      },
    ]);

    const item = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );
    expect(item.statusTone).toBe('success');
    expect(item.status).toBe('已準備');
    expect(item.advancedActions.map((action) => action.id)).toEqual([
      'refresh',
      'repair',
      'remove',
    ]);
  });

  it('reports an info tone and download-percent status while a progress event is in flight', async () => {
    const presentation = await loadPresentation();

    progressCallback({
      dependencyId: 'ffmpeg-gyan-essentials',
      stage: 'downloading',
      percent: 42,
    });

    const item = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );
    expect(item.statusTone).toBe('info');
    expect(item.status).toBe('下載 42%');
  });

  it('surfaces the caller-supplied ytdlpMessage ref as the yt-dlp item description', async () => {
    const { shallowRef } = await import('vue');
    const ytdlpMessage = shallowRef('已更新至 2024.01.01');
    const presentation = await loadPresentation({ ytdlpMessage });

    const item = findItem(
      presentation,
      'provider-flow',
      'yt-dlp-provider-tool',
    );
    expect(item.description).toBe('已更新至 2024.01.01');
  });

  it('carries each gate registry entry’s declaration body onto its row', async () => {
    const presentation = await loadPresentation();

    const row = findGateRow(presentation, 'provider-flow');
    expect(Array.isArray(row.body)).toBe(true);
    expect(row.body.length).toBeGreaterThan(0);
    expect(row.body.every((line) => typeof line === 'string')).toBe(true);
  });

  it("always routes the ffmpeg row's primary action through the source modal", async () => {
    const presentation = await loadPresentation();
    const item = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );

    expect(item.actionLabel).toBe('準備音訊轉換工具');

    updatedCallback([
      {
        id: 'ffmpeg-gyan-essentials',
        featureId: 'audio-processing-flow',
        kind: 'binary',
        name: 'FFmpeg essentials build',
        license: 'GPL-3.0',
        installed: true,
        source: 'managed',
      },
    ]);

    const installedItem = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );
    expect(installedItem.actionLabel).toBe('FFmpeg 來源設定');
  });

  it('reports source: "system" as a distinct value and status once active', async () => {
    const presentation = await loadPresentation();

    updatedCallback([
      {
        id: 'ffmpeg-gyan-essentials',
        featureId: 'audio-processing-flow',
        kind: 'binary',
        name: 'FFmpeg essentials build',
        license: 'GPL-3.0',
        installed: true,
        source: 'system',
      },
    ]);

    const item = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );
    expect(item.value).toBe('系統安裝的 FFmpeg');
    expect(item.status).toBe('使用系統版本');
    expect(item.statusTone).toBe('success');
  });

  it('hints "可用系統版本" when not installed but a system FFmpeg was detected', async () => {
    const { shallowRef } = await import('vue');
    const systemFfmpegDetection = shallowRef({
      available: true,
      ok: true,
      path: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      version: '7.1-full_build-www.gyan.dev',
    });
    const presentation = await loadPresentation({ systemFfmpegDetection });

    const item = findItem(
      presentation,
      'audio-processing-flow',
      'ffmpeg-gyan-essentials',
    );
    expect(item.status).toBe('可用系統版本');
    expect(item.statusTone).toBe('info');
  });
});
