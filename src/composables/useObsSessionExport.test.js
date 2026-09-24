import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadExport() {
  const { useObsSessionExport } = await import('./useObsSessionExport.js');
  return useObsSessionExport();
}

function trackEntry(overrides = {}) {
  return {
    type: 'track',
    trackId: 't1',
    title: 'Song A',
    artist: null,
    stream: { timecode: '00:00:00.000', durationMs: 0 },
    record: null,
    occurredAt: '2026-09-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('useObsSessionExport', () => {
  it('open() loads the latest session and projects it into chapters', async () => {
    const session = {
      id: 'sess_1',
      startedAt: '2026-09-24T12:00:00.000Z',
      entries: [
        trackEntry({ trackId: 't1', title: 'Song A' }),
        trackEntry({
          trackId: 't2',
          title: 'Song B',
          stream: { timecode: '00:00:30.000', durationMs: 30_000 },
        }),
        trackEntry({
          trackId: 't3',
          title: 'Song C',
          stream: { timecode: '00:01:00.000', durationMs: 60_000 },
        }),
      ],
    };
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue(session),
      },
    });
    const exportState = await loadExport();

    await exportState.open();

    expect(exportState.isOpen.value).toBe(true);
    expect(exportState.session.value).toEqual(session);
    expect(exportState.result.value.text).toBe(
      '0:00 Song A\n0:30 Song B\n1:00 Song C',
    );
    expect(exportState.result.value.valid).toBe(true);
  });

  it('close() sets isOpen to false without clearing the loaded session', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue({
          id: 'sess_1',
          startedAt: '2026-09-24T12:00:00.000Z',
          entries: [trackEntry()],
        }),
      },
    });
    const exportState = await loadExport();
    await exportState.open();

    exportState.close();

    expect(exportState.isOpen.value).toBe(false);
    expect(exportState.session.value).not.toBe(null);
  });

  it('offsetSeconds shifts the projected chapters, clamping negative/invalid input to zero offset', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue({
          id: 'sess_1',
          startedAt: '2026-09-24T12:00:00.000Z',
          entries: [
            trackEntry({
              trackId: 't1',
              title: 'Song A',
              stream: { timecode: '00:01:00.000', durationMs: 60_000 },
            }),
          ],
        }),
      },
    });
    const exportState = await loadExport();
    await exportState.open();

    exportState.offsetSeconds.value = '30';
    expect(exportState.result.value.text).toBe('0:30 Song A');

    exportState.offsetSeconds.value = 'not-a-number';
    expect(exportState.result.value.text).toBe('1:00 Song A');

    exportState.offsetSeconds.value = '-10';
    expect(exportState.result.value.text).toBe('1:00 Song A');
  });

  it('auto-switches source to record when the session has no stream timecodes', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue({
          id: 'sess_1',
          startedAt: '2026-09-24T12:00:00.000Z',
          entries: [
            trackEntry({
              stream: null,
              record: { timecode: '00:00:00.000', durationMs: 0 },
            }),
          ],
        }),
      },
    });
    const exportState = await loadExport();

    await exportState.open();

    expect(exportState.source.value).toBe('record');
  });

  it('copyChapters copies the currently projected text via the bridge', async () => {
    const copyObsText = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue({
          id: 'sess_1',
          startedAt: '2026-09-24T12:00:00.000Z',
          entries: [
            trackEntry({ trackId: 't1', title: 'Song A' }),
            trackEntry({
              trackId: 't2',
              title: 'Song B',
              stream: { timecode: '00:00:30.000', durationMs: 30_000 },
            }),
          ],
        }),
        copyObsText,
      },
    });
    const exportState = await loadExport();
    await exportState.open();

    await expect(exportState.copyChapters()).resolves.toBe(true);

    expect(copyObsText).toHaveBeenCalledWith('0:00 Song A\n0:30 Song B');
    expect(exportState.copyState.value.tone).toBe('success');
  });

  it('surfaces a bounded error when loading the session fails', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const exportState = await loadExport();

    await exportState.open();

    expect(exportState.error.value).toBe('目前無法讀取場次紀錄，請再試一次。');
    expect(exportState.isLoading.value).toBe(false);
  });

  it('shares one instance across callers — a trigger button and the modal see the same state', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue({
          id: 'sess_1',
          startedAt: '2026-09-24T12:00:00.000Z',
          entries: [trackEntry()],
        }),
      },
    });
    const { useObsSessionExport } = await import('./useObsSessionExport.js');
    const trigger = useObsSessionExport(); // e.g. ObsIntegrationSettingsBlock.vue
    const modal = useObsSessionExport(); // e.g. ObsSessionExportModal.vue

    expect(modal.isOpen.value).toBe(false);
    await trigger.open();

    expect(modal.isOpen.value).toBe(true);
    expect(modal.session.value?.id).toBe('sess_1');

    modal.close();

    expect(trigger.isOpen.value).toBe(false);
  });

  it('handles no session existing yet (null)', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsLatestSession: vi.fn().mockResolvedValue(null),
      },
    });
    const exportState = await loadExport();

    await exportState.open();

    expect(exportState.session.value).toBe(null);
    expect(exportState.result.value.lines).toEqual([]);
    expect(exportState.result.value.valid).toBe(false);
  });
});
