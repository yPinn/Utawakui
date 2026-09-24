import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadObsIntegration() {
  const { useObsIntegration } = await import('./useObsIntegration.js');
  return useObsIntegration();
}

function readyStatus(overrides = {}) {
  return {
    desired: { enabled: true, host: '127.0.0.1', port: 4455 },
    observed: {
      lifecycle: 'ready',
      obsWebSocketVersion: '5.5.0',
      negotiatedRpcVersion: 1,
      streaming: { active: true, timecode: '00:01:02.000', durationMs: 62_000 },
      recording: { active: false, timecode: null, durationMs: null },
    },
    error: null,
    ...overrides,
  };
}

describe('useObsIntegration', () => {
  it('refreshes from the preload bridge and applies pushed status', async () => {
    let statusListener;
    const unsubscribe = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: {
        getObsStatus: vi.fn().mockResolvedValue(readyStatus()),
        onObsStatus: vi.fn((listener) => {
          statusListener = listener;
          return unsubscribe;
        }),
      },
    });
    const obs = await loadObsIntegration();

    await obs.refreshObsStatus();
    expect(obs.state.observed.lifecycle).toBe('ready');
    expect(obs.state.observed.streaming).toEqual({
      active: true,
      timecode: '00:01:02.000',
      durationMs: 62_000,
    });

    statusListener(
      readyStatus({
        observed: {
          lifecycle: 'error',
          streaming: { active: false, timecode: null, durationMs: null },
          recording: { active: false, timecode: null, durationMs: null },
        },
        error: { code: 'OBS_CONNECT_FAILED', message: '無法連線至 OBS。' },
      }),
    );
    expect(obs.state.observed.lifecycle).toBe('error');
    expect(obs.state.error).toEqual({
      code: 'OBS_CONNECT_FAILED',
      message: '無法連線至 OBS。',
    });
    expect(window.Utawakui.onObsStatus).toHaveBeenCalledOnce();
  });

  it('starts disabled and leaves state in place when the bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const obs = await loadObsIntegration();

    await obs.refreshObsStatus();

    expect(obs.state.observed.lifecycle).toBe('disabled');
    expect(obs.state.desired.enabled).toBe(false);
  });

  it('does not throw when getObsStatus rejects', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsStatus: vi.fn().mockRejectedValue(new Error('IPC failed')),
      },
    });
    const obs = await loadObsIntegration();

    await expect(obs.refreshObsStatus()).resolves.toBeUndefined();
    expect(obs.state.observed.lifecycle).toBe('disabled');
  });

  it('updateObsSettings forwards to the bridge and applies the returned status', async () => {
    const updateObsSettings = vi.fn().mockResolvedValue(readyStatus());
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        updateObsSettings,
      },
    });
    const obs = await loadObsIntegration();

    await obs.updateObsSettings({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      password: 'hunter2',
    });

    expect(updateObsSettings).toHaveBeenCalledWith({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      password: 'hunter2',
    });
    expect(obs.state.observed.lifecycle).toBe('ready');
  });

  it('connectObs and disconnectObs are no-ops without the bridge', async () => {
    vi.stubGlobal('window', {});
    const obs = await loadObsIntegration();

    await expect(obs.connectObs()).resolves.toBeNull();
    await expect(obs.disconnectObs()).resolves.toBeNull();
    await expect(obs.getObsSettings()).resolves.toBeNull();
  });

  it('addMarker forwards the label to the bridge and leaves connection state untouched', async () => {
    const addObsMarker = vi.fn().mockResolvedValue({
      type: 'marker',
      label: 'note',
      stream: null,
      record: null,
      occurredAt: '2026-09-24T12:00:00.000Z',
    });
    vi.stubGlobal('window', {
      Utawakui: { onObsStatus: vi.fn(() => vi.fn()), addObsMarker },
    });
    const obs = await loadObsIntegration();
    const lifecycleBefore = obs.state.observed.lifecycle;

    const entry = await obs.addMarker('note');

    expect(addObsMarker).toHaveBeenCalledWith('note');
    expect(entry.label).toBe('note');
    expect(obs.state.observed.lifecycle).toBe(lifecycleBefore);
  });

  it('addMarker is a no-op without the bridge', async () => {
    vi.stubGlobal('window', {});
    const obs = await loadObsIntegration();

    await expect(obs.addMarker('note')).resolves.toBeNull();
  });

  it('getLatestSession forwards to the bridge and back', async () => {
    const session = {
      id: 'sess_1',
      startedAt: '2026-09-24T12:00:00.000Z',
      entries: [],
    };
    const getObsLatestSession = vi.fn().mockResolvedValue(session);
    vi.stubGlobal('window', {
      Utawakui: { onObsStatus: vi.fn(() => vi.fn()), getObsLatestSession },
    });
    const obs = await loadObsIntegration();

    await expect(obs.getLatestSession()).resolves.toEqual(session);
    expect(getObsLatestSession).toHaveBeenCalled();
  });

  it('getLatestSession is a no-op without the bridge', async () => {
    vi.stubGlobal('window', {});
    const obs = await loadObsIntegration();

    await expect(obs.getLatestSession()).resolves.toBeNull();
  });
});
