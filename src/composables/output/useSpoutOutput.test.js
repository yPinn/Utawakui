import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stoppedStatus = {
  supported: true,
  desired: { running: false, frameRateProfile: 'standard' },
  observed: { lifecycle: 'stopped' },
  effective: { surface: null },
  error: null,
};

const bridge = {
  getSpoutOutputStatus: vi.fn(async () => stoppedStatus),
  startSpoutOutput: vi.fn(async () => ({
    ...stoppedStatus,
    desired: { running: true },
    observed: { lifecycle: 'sending' },
    effective: { surface: { senderName: 'Utawakui.Lyrics' } },
  })),
  stopSpoutOutput: vi.fn(async () => stoppedStatus),
  setSpoutOutputFrameRateProfile: vi.fn(async (profileId) => ({
    ...stoppedStatus,
    desired: { running: false, frameRateProfile: profileId },
  })),
  onSpoutOutputStatus: vi.fn(() => vi.fn()),
  recordDiagnostic: vi.fn(async () => undefined),
};
const originalWindow = globalThis.window;

async function loadComposable() {
  vi.resetModules();
  globalThis.window = { Utawakui: bridge };
  return import('./useSpoutOutput.js');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.window = originalWindow;
  vi.resetModules();
});

describe('useSpoutOutput', () => {
  it('keeps a pushed lifecycle when an older refresh completes', async () => {
    const older = Promise.withResolvers();
    bridge.getSpoutOutputStatus.mockReturnValueOnce(older.promise);
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();
    const [publish] = bridge.onSpoutOutputStatus.mock.calls[0];

    const refresh = spout.refresh();
    publish({ ...stoppedStatus, observed: { lifecycle: 'sending' } });
    older.resolve(stoppedStatus);
    await expect(refresh).resolves.toBe(true);
    expect(spout.state.status.observed.lifecycle).toBe('sending');
    expect(spout.state.isRefreshing).toBe(false);
  });

  it('keeps a newer pushed lifecycle when an older start reply completes', async () => {
    const older = Promise.withResolvers();
    bridge.startSpoutOutput.mockReturnValueOnce(older.promise);
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();
    const [publish] = bridge.onSpoutOutputStatus.mock.calls[0];

    const starting = spout.start();
    publish({ ...stoppedStatus, observed: { lifecycle: 'error' } });
    older.resolve({ ...stoppedStatus, observed: { lifecycle: 'sending' } });
    await expect(starting).resolves.toBe(true);
    expect(spout.state.status.observed.lifecycle).toBe('error');
    expect(spout.state.isStarting).toBe(false);
  });

  it('keeps the latest refresh in control of status and the busy flag', async () => {
    const older = Promise.withResolvers();
    const latest = Promise.withResolvers();
    bridge.getSpoutOutputStatus
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();

    const first = spout.refresh();
    const second = spout.refresh();
    older.reject(new Error('obsolete failure'));
    await first;
    expect(spout.state.isRefreshing).toBe(true);
    expect(spout.state.errors.refresh).toBeUndefined();
    latest.resolve({ ...stoppedStatus, observed: { lifecycle: 'sending' } });
    await second;
    expect(spout.state.status.observed.lifecycle).toBe('sending');
    expect(spout.state.isRefreshing).toBe(false);
  });

  it('does not clear a configuration failure when status refresh succeeds', async () => {
    bridge.setSpoutOutputFrameRateProfile.mockRejectedValueOnce(
      new Error('private'),
    );
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();
    await spout.setFrameRateProfile('reduced');
    await spout.refresh();
    expect(spout.state.errors['set-frame-rate-profile']).toContain('幀率');
    expect(spout.state.errors.refresh).toBeUndefined();
    await spout.setFrameRateProfile('reduced');
    expect(spout.state.errors['set-frame-rate-profile']).toBeUndefined();
  });
  it('refreshes, configures, starts, and stops through fixed bridge methods', async () => {
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();

    expect(bridge.onSpoutOutputStatus).toHaveBeenCalledOnce();

    await expect(spout.refresh()).resolves.toBe(true);
    expect(spout.state.status.observed.lifecycle).toBe('stopped');
    await expect(spout.setFrameRateProfile('reduced')).resolves.toBe(true);
    expect(bridge.setSpoutOutputFrameRateProfile).toHaveBeenCalledWith(
      'reduced',
    );
    expect(spout.state.status.desired.frameRateProfile).toBe('reduced');
    await expect(spout.start()).resolves.toBe(true);
    expect(bridge.startSpoutOutput).toHaveBeenCalledWith();
    expect(spout.state.status.observed.lifecycle).toBe('sending');
    await expect(spout.stop()).resolves.toBe(true);
    expect(bridge.stopSpoutOutput).toHaveBeenCalledWith();
    expect(spout.state.status.observed.lifecycle).toBe('stopped');
  });

  it('does not forward an unbounded frame-rate profile', async () => {
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();

    await expect(spout.setFrameRateProfile('120')).resolves.toBe(false);
    expect(bridge.setSpoutOutputFrameRateProfile).not.toHaveBeenCalled();
  });

  it('applies main-owned lifecycle events after startup', async () => {
    let listener;
    bridge.onSpoutOutputStatus.mockImplementationOnce((callback) => {
      listener = callback;
      return vi.fn();
    });
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();

    listener({
      ...stoppedStatus,
      desired: { running: false },
      observed: { lifecycle: 'error' },
      error: { message: 'Spout2 輸出發生錯誤。' },
    });

    expect(spout.state.status.observed.lifecycle).toBe('error');
  });

  it('publishes bounded UI copy and diagnostics when native start fails', async () => {
    bridge.startSpoutOutput.mockRejectedValueOnce(
      new Error('C:\\private\\bridge.node failed to load'),
    );
    const { useSpoutOutput } = await loadComposable();
    const spout = useSpoutOutput();

    await expect(spout.start()).resolves.toBe(false);

    expect(spout.state.error).toBe('Spout2 輸出未啟動，請再試一次。');
    expect(spout.state.error).not.toContain('private');
    expect(bridge.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'spout-output',
        operation: 'start',
        code: 'SPOUT_OUTPUT_START_FAILED',
      }),
    );
  });
});
