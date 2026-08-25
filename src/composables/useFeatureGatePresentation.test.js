import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES } from '../constants/featureGates.js';

let updatedCallback;
let progressCallback;
let confirmFeatureGateMock;
let getFeatureConfirmationsMock;
let listFeatureDependenciesMock;
let prepareFeatureDependencyMock;
let removeFeatureDependencyMock;
let repairFeatureDependencyMock;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function validConfirmation(featureId) {
  return {
    featureId,
    noticeVersion: FEATURE_GATES[featureId].noticeVersion,
    confirmedAt: '2026-08-25T12:00:00.000Z',
    enabled: true,
  };
}

beforeEach(() => {
  vi.resetModules();
  updatedCallback = undefined;
  progressCallback = undefined;
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({});
  confirmFeatureGateMock = vi
    .fn()
    .mockImplementation((featureId) =>
      Promise.resolve(validConfirmation(featureId)),
    );
  listFeatureDependenciesMock = vi.fn().mockResolvedValue([]);
  prepareFeatureDependencyMock = vi.fn();
  removeFeatureDependencyMock = vi.fn();
  repairFeatureDependencyMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      listFeatureDependencies: listFeatureDependenciesMock,
      prepareFeatureDependency: prepareFeatureDependencyMock,
      removeFeatureDependency: removeFeatureDependencyMock,
      repairFeatureDependency: repairFeatureDependencyMock,
      onFeatureDependenciesUpdated: (callback) => {
        updatedCallback = callback;
        return vi.fn();
      },
      onFeatureDependencyProgress: (callback) => {
        progressCallback = callback;
        return vi.fn();
      },
      getFeatureConfirmations: getFeatureConfirmationsMock,
      confirmFeatureGate: confirmFeatureGateMock,
      recordDiagnostic: vi.fn().mockResolvedValue({ ok: true }),
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

async function loadFeatureGateOwner() {
  const { useFeatureGates } = await import('./useFeatureGates.js');
  return useFeatureGates();
}

async function loadFeatureDependencyOwner() {
  const { useFeatureDependencies } =
    await import('./useFeatureDependencies.js');
  return useFeatureDependencies();
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
  it('projects the complete gate registry with concise labels and counts', async () => {
    getFeatureConfirmationsMock.mockResolvedValue({
      'provider-flow': validConfirmation('provider-flow'),
      'lyrics-flow': validConfirmation('lyrics-flow'),
    });
    const presentation = await loadPresentation();
    const gates = await loadFeatureGateOwner();

    await gates.refreshConfirmations();

    expect(presentation.featureGateRows.value.map(({ id }) => id)).toEqual(
      Object.keys(FEATURE_GATES),
    );
    expect(presentation.enabledGateCount.value).toBe(2);
    expect(findGateRow(presentation, 'provider-flow')).toMatchObject({
      title: '外部來源',
      status: '已啟用',
      tone: 'success',
      enabled: true,
    });
    expect(findGateRow(presentation, 'public-output-flow')).toMatchObject({
      title: '對外輸出',
      status: '未啟用',
      tone: 'gated',
      enabled: false,
    });
    const outputRow = findGateRow(presentation, 'public-output-flow');
    expect(presentation.gateActionLabel(outputRow)).toBe('啟用');
    expect(presentation.isGateActionDisabled(outputRow)).toBe(false);
  });

  it('enables a gate through its declaration and clears its setup request', async () => {
    const presentation = await loadPresentation();
    const gates = await loadFeatureGateOwner();
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');
    const access = useFeatureGateAccess();
    access.requestFeatureSetup('provider-flow');

    const enablePromise = presentation.enableFeature('provider-flow');
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe('provider-flow');
    });
    const pendingRow = findGateRow(presentation, 'provider-flow');
    expect(pendingRow.isBusy).toBe(true);
    expect(presentation.gateActionLabel(pendingRow)).toBe('等待確認');
    expect(presentation.isGateActionDisabled(pendingRow)).toBe(true);

    await gates.confirmPendingFeature();
    await enablePromise;

    const enabledRow = findGateRow(presentation, 'provider-flow');
    expect(access.state.request).toBeNull();
    expect(enabledRow.enabled).toBe(true);
    expect(presentation.gateActionLabel(enabledRow)).toBe('已啟用');
    expect(presentation.isGateActionDisabled(enabledRow)).toBe(true);
  });

  it('serializes gate enabling while confirmation state is loading', async () => {
    const deferred = createDeferred();
    getFeatureConfirmationsMock.mockReturnValue(deferred.promise);
    const presentation = await loadPresentation();
    const gates = await loadFeatureGateOwner();

    const enablePromise = presentation.enableFeature('provider-flow');
    const busyRow = findGateRow(presentation, 'provider-flow');
    expect(busyRow.isBusy).toBe(true);
    expect(presentation.gateActionLabel(busyRow)).toBe('處理中');
    expect(presentation.isGateActionDisabled(busyRow)).toBe(true);

    await presentation.enableFeature('lyrics-flow');
    expect(getFeatureConfirmationsMock).toHaveBeenCalledTimes(1);
    deferred.resolve({});
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe('provider-flow');
    });
    gates.cancelPendingFeature();
    await enablePromise;
  });

  it('disables other gates while one confirmation is being persisted', async () => {
    const deferred = createDeferred();
    confirmFeatureGateMock.mockReturnValue(deferred.promise);
    const presentation = await loadPresentation();
    const gates = await loadFeatureGateOwner();

    const enablePromise = presentation.enableFeature('provider-flow');
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe('provider-flow');
    });
    const confirmPromise = gates.confirmPendingFeature();

    const lyricsRow = findGateRow(presentation, 'lyrics-flow');
    expect(presentation.gateActionLabel(lyricsRow)).toBe('處理中');
    expect(presentation.isGateActionDisabled(lyricsRow)).toBe(true);

    deferred.resolve(validConfirmation('provider-flow'));
    await Promise.all([confirmPromise, enablePromise]);
  });

  it('renders concise user-facing purpose text for each registry dependency', async () => {
    const presentation = await loadPresentation();

    expect(
      findItem(presentation, 'provider-flow', 'yt-dlp-provider-tool').value,
    ).toBe('保存外部來源到本機曲庫');
    expect(
      findItem(presentation, 'audio-processing-flow', 'ffmpeg-gyan-essentials')
        .value,
    ).toBe('支援音訊轉換與格式讀取');
    expect(
      findItem(presentation, 'audio-processing-flow', 'uvr-mdxnet-kara-2')
        .value,
    ).toBe('產生人聲分離結果時使用');
    expect(
      findItem(presentation, 'audio-processing-flow', 'uvr-mdxnet-inst-hq-4')
        .value,
    ).toBe('產生人聲分離結果時使用');
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

  it('maps bounded progress stages and falls back to a generic preparing label', async () => {
    const presentation = await loadPresentation();

    for (const [progress, expected] of [
      [{ stage: 'verifying' }, '驗證中'],
      [{ stage: 'downloading', percent: Number.NaN }, '下載中'],
      [{ stage: 'future-stage' }, '準備中'],
    ]) {
      progressCallback({
        dependencyId: 'ffmpeg-gyan-essentials',
        ...progress,
      });
      expect(
        findItem(
          presentation,
          'audio-processing-flow',
          'ffmpeg-gyan-essentials',
        ).status,
      ).toBe(expected);
    }
  });

  it('projects preparing state while a dependency operation is in flight', async () => {
    const deferred = createDeferred();
    prepareFeatureDependencyMock.mockReturnValue(deferred.promise);
    const presentation = await loadPresentation();
    const dependencies = await loadFeatureDependencyOwner();

    const preparePromise = dependencies.prepareDependency('uvr-mdxnet-kara-2');
    const item = findItem(
      presentation,
      'audio-processing-flow',
      'uvr-mdxnet-kara-2',
    );
    expect(item.status).toBe('準備中');
    expect(item.actionLabel).toBe('準備人聲分離模型（快速）中');
    expect(item.actionDisabled).toBe(true);
    expect(item.advancedActions[0]).toMatchObject({
      id: 'refresh',
      disabled: true,
    });

    deferred.resolve({
      id: 'uvr-mdxnet-kara-2',
      kind: 'model',
      name: '人聲分離模型（快速）',
      installed: true,
    });
    await preparePromise;
  });

  it('projects provider reinstall state through the advanced action', async () => {
    const deferred = createDeferred();
    repairFeatureDependencyMock.mockReturnValue(deferred.promise);
    const presentation = await loadPresentation();
    const dependencies = await loadFeatureDependencyOwner();
    updatedCallback([
      {
        id: 'yt-dlp-provider-tool',
        featureId: 'provider-flow',
        kind: 'runtime',
        name: '線上來源下載工具',
        installed: true,
      },
    ]);

    const repairPromise = dependencies.repairDependency('yt-dlp-provider-tool');
    const item = findItem(
      presentation,
      'provider-flow',
      'yt-dlp-provider-tool',
    );
    expect(item.actionDisabled).toBe(true);
    expect(item.advancedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'repair',
          label: '重新下載中',
          disabled: true,
        }),
        expect.objectContaining({ id: 'remove', disabled: true }),
      ]),
    );

    deferred.resolve({
      id: 'yt-dlp-provider-tool',
      kind: 'runtime',
      name: '線上來源下載工具',
      installed: true,
    });
    await repairPromise;
  });

  it('disables refresh while dependency truth is loading', async () => {
    const deferred = createDeferred();
    listFeatureDependenciesMock.mockReturnValue(deferred.promise);
    const presentation = await loadPresentation();
    const dependencies = await loadFeatureDependencyOwner();

    const refreshPromise = dependencies.refreshDependencies();
    expect(
      findItem(presentation, 'audio-processing-flow', 'ffmpeg-gyan-essentials')
        .advancedActions[0],
    ).toMatchObject({ id: 'refresh', disabled: true });

    deferred.resolve([]);
    await refreshPromise;
  });

  it('surfaces migration and model update states with their intended actions', async () => {
    const presentation = await loadPresentation();

    updatedCallback([
      {
        id: 'ffmpeg-gyan-essentials',
        featureId: 'audio-processing-flow',
        kind: 'binary',
        name: 'FFmpeg essentials build',
        installed: false,
        canMigrate: true,
      },
      {
        id: 'uvr-mdxnet-kara-2',
        featureId: 'audio-processing-flow',
        kind: 'model',
        name: '人聲分離模型（快速）',
        installed: true,
        updateAvailable: true,
      },
    ]);

    expect(
      findItem(presentation, 'audio-processing-flow', 'ffmpeg-gyan-essentials')
        .status,
    ).toBe('待整理');
    expect(
      findItem(presentation, 'audio-processing-flow', 'uvr-mdxnet-kara-2'),
    ).toMatchObject({
      status: '可更新',
      statusTone: 'warning',
      actionLabel: '更新人聲分離模型（快速）',
    });
  });

  it('keeps provider runtime implementation details out of the primary row', async () => {
    const presentation = await loadPresentation();

    const item = findItem(
      presentation,
      'provider-flow',
      'yt-dlp-provider-tool',
    );
    expect(item.value).not.toMatch(/yt-dlp|GPL|Unlicense|PSF|2026|bgutil/i);
    expect(item.description).toBe('用來把你選定的外部來源保存到本機曲庫。');
  });

  it('keeps provider runtime reinstall in the advanced menu once installed', async () => {
    const presentation = await loadPresentation();

    updatedCallback([
      {
        id: 'yt-dlp-provider-tool',
        featureId: 'provider-flow',
        kind: 'runtime',
        name: '線上來源下載工具',
        license:
          'Python Software Foundation License + Unlicense + GPL-3.0-or-later provider',
        displayVersion: 'yt-dlp 2026.08.19 + bgutil 0.8.1',
        installed: true,
      },
    ]);

    const item = findItem(
      presentation,
      'provider-flow',
      'yt-dlp-provider-tool',
    );
    expect(item.status).toBe('可使用');
    expect(item.actionIcon).toBeNull();
    expect(item.actionLabel).toBe('下載工具已可使用');
    expect(item.advancedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'repair',
          label: '重新下載',
        }),
      ]),
    );
  });

  it('uses update language for an installed provider runtime with an older manifest version', async () => {
    const presentation = await loadPresentation();

    updatedCallback([
      {
        id: 'yt-dlp-provider-tool',
        featureId: 'provider-flow',
        kind: 'runtime',
        name: '線上來源下載工具',
        license:
          'Python Software Foundation License + Unlicense + GPL-3.0-or-later provider',
        displayVersion: 'yt-dlp 2026.08.19 + bgutil 0.8.1',
        installed: true,
        installedVersion: 'python-previous',
        updateAvailable: true,
      },
    ]);

    const item = findItem(
      presentation,
      'provider-flow',
      'yt-dlp-provider-tool',
    );
    expect(item.status).toBe('可更新');
    expect(item.statusTone).toBe('warning');
    expect(item.actionLabel).toBe('更新下載工具');
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
    expect(item.value).toBe('使用系統安裝版本');
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
