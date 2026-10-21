import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES } from '../constants/featureGates.js';

let importLocalAudioFilesMock;
let listTracksMock;
let listPlaylistsMock;
let convertLocalAudioFilesMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  importLocalAudioFilesMock = vi.fn().mockResolvedValue({
    imported: [],
    skipped: [],
  });
  listTracksMock = vi.fn().mockResolvedValue([]);
  listPlaylistsMock = vi.fn().mockResolvedValue([]);
  convertLocalAudioFilesMock = vi.fn().mockResolvedValue({
    imported: [],
    skipped: [],
  });
  vi.stubGlobal('window', {
    Utawakui: {
      importLocalAudioFiles: importLocalAudioFilesMock,
      convertLocalAudioFiles: convertLocalAudioFilesMock,
      listTracks: listTracksMock,
      listPlaylists: listPlaylistsMock,
      getFeatureConfirmations: vi.fn().mockResolvedValue({
        'audio-processing-flow': {
          featureId: 'audio-processing-flow',
          noticeVersion: FEATURE_GATES['audio-processing-flow'].noticeVersion,
          confirmedAt: '2026-10-13T00:00:00.000Z',
          enabled: true,
        },
      }),
      confirmFeatureGate: vi.fn(),
      onLibraryUpdated: () => () => {},
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadLocalImport() {
  const { useLocalImport } = await import('./useLocalImport.js');
  await flushMicrotasks();
  return useLocalImport();
}

describe('useLocalImport', () => {
  it('keeps a conversion confirmation and gate-disabled flow out of error notifications', async () => {
    window.Utawakui.getFeatureConfirmations.mockResolvedValue({});
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [{ filename: 'a.wma', sourceFormat: 'wma' }],
      },
    });
    const owner = await loadLocalImport();
    await owner.importFiles();
    const { useAppNotifications } = await import('./useAppNotifications.js');
    const notices = useAppNotifications().items;
    expect(notices.value).toHaveLength(1);
    expect(notices.value[0]).toMatchObject({
      title: '需要相容轉檔',
      tone: 'warning',
    });
    const id = notices.value[0].id;
    await owner.convertPendingFiles();
    expect(convertLocalAudioFilesMock).not.toHaveBeenCalled();
    expect(notices.value.map((item) => item.id)).toEqual([id]);
    expect(owner.state.conversionReview).toBeTruthy();
    expect(owner.state.isConverting).toBe(false);
  });

  it('summarizes duplicate-only batches as information and retains readable skip reasons', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [{ filename: 'copy.mp3', reason: 'duplicate-content' }],
    });
    const owner = await loadLocalImport();
    await owner.importFiles();
    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(useAppNotifications().items.value[0]).toMatchObject({
      tone: 'info',
      lifecycle: 'transient',
    });
    expect(owner.skippedResults.value).toEqual([
      { filename: 'copy.mp3', message: '曲庫已有相同音訊' },
    ]);
  });
  it('publishes one batch summary with a return-to-import action and retains item details', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'song-a', title: 'A' }],
      skipped: [{ filename: 'private.wav', reason: 'unsupported-codec' }],
    });
    const owner = await loadLocalImport();
    await owner.importFiles();
    const { useAppNotifications } = await import('./useAppNotifications.js');
    const notifications = useAppNotifications();
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      title: '本機匯入完成',
      message: '已複製 1 首，略過 1 個檔案',
      tone: 'warning',
      actionLabel: '查看匯入結果',
    });
    expect(notifications.items.value[0].message).not.toContain('private.wav');
    expect(owner.state.skipped).toHaveLength(1);
    await notifications.runAction(notifications.items.value[0].id);
    const { useAppRightDock } = await import('./useAppRightDock.js');
    const dock = useAppRightDock();
    expect(dock.topSurface.value).toBe('preparation');
    expect(dock.preparationTab.value).toBe('import');
    expect(dock.isExpanded.value).toBe(true);
  });

  it('does not notify cancellation and replaces the previous attempt result on recovery', async () => {
    const owner = await loadLocalImport();
    const { useAppNotifications } = await import('./useAppNotifications.js');
    const notifications = useAppNotifications();
    await owner.importFiles();
    expect(notifications.items.value).toHaveLength(0);
    importLocalAudioFilesMock.mockRejectedValueOnce(new Error('private'));
    await owner.importFiles();
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0].tone).toBe('danger');
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'a' }],
      skipped: [],
    });
    await owner.importFiles();
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0].tone).toBe('success');
  });

  it('summarizes conversion separately from the direct import count', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'direct' }],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [{ filename: 'a.wma', sourceFormat: 'wma' }],
      },
    });
    convertLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'converted' }],
      skipped: [],
    });
    const owner = await loadLocalImport();
    await owner.importFiles();
    await owner.convertPendingFiles();
    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(useAppNotifications().items.value).toHaveLength(1);
    expect(useAppNotifications().items.value[0]).toMatchObject({
      title: '相容轉檔完成',
      message: '已轉換並匯入 1 首',
      tone: 'success',
    });
    expect(owner.state.imported).toHaveLength(2);
  });
  it('imports local audio files through the bridge and refreshes the library', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [
        { id: 'song-a', title: 'Song A' },
        { id: 'song-b', title: 'Song B' },
      ],
      skipped: [{ filename: 'notes.txt', reason: 'unsupported-extension' }],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(importLocalAudioFilesMock).toHaveBeenCalledTimes(1);
    expect(listTracksMock).toHaveBeenCalledOnce();
    expect(localImport.state.statusType).toBe('success');
    expect(localImport.state.imported).toEqual([
      { id: 'song-a', title: 'Song A' },
      { id: 'song-b', title: 'Song B' },
    ]);
    expect(localImport.state.skipped).toEqual([
      { filename: 'notes.txt', reason: 'unsupported-extension' },
    ]);
    expect(localImport.state.message).toBe('已複製 2 首，略過 1 個檔案');
  });

  it('uses a concise duplicate message for content-hash skips', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'song-a', title: 'Song A' }],
      skipped: [
        {
          filename: 'Song A Copy.mp3',
          reason: 'duplicate-content',
          existingTrackId: 'song-a',
        },
      ],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('success');
    expect(localImport.state.message).toBe('已複製 1 首，略過 1 個重複檔案');
  });

  it('keeps a bounded conversion review separate from successful direct imports', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'direct', title: 'Direct song' }],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [
          { filename: 'Legacy.wma', sourceFormat: 'wma' },
          { filename: 'Lossless.m4a', sourceFormat: 'alac' },
        ],
      },
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.conversionReview).toEqual({
      sessionId: '11111111-1111-4111-8111-111111111111',
      files: [
        { filename: 'Legacy.wma', sourceFormat: 'wma' },
        { filename: 'Lossless.m4a', sourceFormat: 'alac' },
      ],
    });
    expect(localImport.conversionReviewMessage.value).toBe(
      '2 個 WMA、ALAC 檔案需要轉成 FLAC；原檔不會修改，轉換副本可能使用較多空間。',
    );
    expect(localImport.state.message).toBe(
      '已複製 1 首；另有 2 個檔案需要相容轉檔',
    );
  });

  it('converts only the opaque pending review and appends imported rows', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'direct', title: 'Direct song' }],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [{ filename: 'Legacy.wma', sourceFormat: 'wma' }],
      },
    });
    convertLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'converted', title: 'Converted song' }],
      skipped: [],
    });
    const localImport = await loadLocalImport();
    await localImport.importFiles();
    listTracksMock.mockClear();

    await localImport.convertPendingFiles();

    expect(convertLocalAudioFilesMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(localImport.state.imported).toEqual([
      { id: 'direct', title: 'Direct song' },
      { id: 'converted', title: 'Converted song' },
    ]);
    expect(localImport.state.conversionReview).toBeNull();
    expect(localImport.state.isConverting).toBe(false);
    expect(localImport.state.message).toBe('已轉換並匯入 1 首');
    expect(listTracksMock).toHaveBeenCalledOnce();
  });

  it('routes a missing FFmpeg dependency to setup without losing the review', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [{ filename: 'Legacy.wma', sourceFormat: 'wma' }],
      },
    });
    convertLocalAudioFilesMock.mockRejectedValueOnce(
      new Error(
        'UTAWAKUI_APP_ERROR:{"code":"FEATURE_DEPENDENCY_MISSING","severity":"warning","title":"尚未準備音訊處理項目","message":"請到設定準備 FFmpeg。","context":{"featureId":"audio-processing-flow","dependencyId":"ffmpeg-gyan-essentials"}}',
      ),
    );
    const localImport = await loadLocalImport();
    await localImport.importFiles();

    await localImport.convertPendingFiles();

    expect(localImport.state.conversionReview).not.toBeNull();
    expect(localImport.state.statusType).toBe('pending');
    expect(localImport.state.message).toBe(
      '請先在設定準備 FFmpeg，再回來執行相容轉檔。',
    );
  });

  it('reports duplicate-only imports without treating them as hard failures', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [
        {
          filename: 'Song A Copy.mp3',
          reason: 'duplicate-content',
          existingTrackId: 'song-a',
        },
      ],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('idle');
    expect(localImport.state.message).toBe('沒有新增曲目，略過 1 個重複檔案');
  });

  it.each([
    [
      'unsupported-codec',
      '沒有可匯入的音訊檔；1 個檔案使用目前無法直接播放的編碼。',
    ],
    [
      'unsupported-media',
      '沒有可匯入的音訊檔；1 個檔案包含影片或其他不支援的媒體串流。',
    ],
  ])(
    'explains the bounded %s compatibility failure',
    async (reason, message) => {
      importLocalAudioFilesMock.mockResolvedValueOnce({
        imported: [],
        skipped: [{ filename: 'Unsupported.m4a', reason }],
      });
      const localImport = await loadLocalImport();

      await localImport.importFiles();

      expect(localImport.state.statusType).toBe('error');
      expect(localImport.state.message).toBe(message);
      expect(localImport.state.message).not.toContain('Unsupported.m4a');
    },
  );

  it('reports cancel/empty selection as a neutral status', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('idle');
    expect(localImport.state.message).toBe('沒有選取音訊檔');
  });

  it('surfaces bridge errors without throwing', async () => {
    importLocalAudioFilesMock.mockRejectedValueOnce(
      new Error('ENOSPC C:\\Users\\Singer\\Music\\private.wav'),
    );
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('error');
    expect(localImport.state.message).toBe('目前無法匯入音訊檔，請再試一次。');
    expect(localImport.state.message).not.toContain('ENOSPC');
    expect(localImport.state.isImporting).toBe(false);
  });

  it('shows a restart hint when the preload bridge is stale', async () => {
    delete window.Utawakui.importLocalAudioFiles;
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('error');
    expect(localImport.state.message).toBe(
      '需要重新啟動應用程式才能使用本機音訊匯入。',
    );
    expect(importLocalAudioFilesMock).not.toHaveBeenCalled();
  });

  it('shows a restart hint when the conversion bridge is stale', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [{ filename: 'Legacy.wma', sourceFormat: 'wma' }],
      },
    });
    delete window.Utawakui.convertLocalAudioFiles;
    const localImport = await loadLocalImport();
    await localImport.importFiles();

    await localImport.convertPendingFiles();

    expect(localImport.state.statusType).toBe('error');
    expect(localImport.state.message).toBe(
      '需要重新啟動應用程式才能使用相容轉檔。',
    );
  });
});
