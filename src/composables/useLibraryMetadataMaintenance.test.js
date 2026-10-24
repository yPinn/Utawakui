import { describe, expect, it, vi } from 'vitest';
import { useLibraryMetadataMaintenance } from './useLibraryMetadataMaintenance.js';

function setup(
  result = {
    status: 'complete',
    libraryEpoch: 1,
    total: 1,
    completed: 1,
    updated: 1,
    unresolved: 0,
  },
) {
  let progress;
  let scope;
  const disposeProgress = vi.fn();
  const disposeScope = vi.fn();
  const bridge = {
    refreshReleaseMetadata: vi.fn(async () => result),
    cancelReleaseMetadata: vi.fn(async () => ({ cancelling: true })),
    onReleaseMetadataProgress: vi.fn((callback) => {
      progress = callback;
      return disposeProgress;
    }),
    onReleaseOrganizationChanged: vi.fn((callback) => {
      scope = callback;
      return disposeScope;
    }),
  };
  const requireFeatureGate = vi.fn(async () => true);
  const session = useLibraryMetadataMaintenance({ bridge, requireFeatureGate });
  return {
    session,
    bridge,
    requireFeatureGate,
    disposeProgress,
    disposeScope,
    progress: (value) => progress(value),
    scope: (value) => scope(value),
  };
}

describe('useLibraryMetadataMaintenance', () => {
  it('reloads local data offline and contains errors without querying the provider', async () => {
    const bridge = {},
      requireFeatureGate = vi.fn(),
      reloadLibrary = vi.fn(async () => {});
    const session = useLibraryMetadataMaintenance({
      bridge,
      requireFeatureGate,
      reloadLibrary,
    });
    expect(await session.reload()).toBe(true);
    expect(session.feedback.value).toBe('已重新讀取本地曲庫。');
    expect(requireFeatureGate).not.toHaveBeenCalled();
    reloadLibrary.mockRejectedValueOnce(Error('disk unavailable'));
    expect(await session.reload()).toBe(false);
    expect(session.state.error).toBe(true);
    expect(session.state.busy).toBe(false);
  });
  it('handles a disabled Main gate and invalid responses without reporting a successful update', async () => {
    const current = setup({ status: 'disabled' });
    expect(await current.session.refresh()).toBe(false);
    expect(current.session.feedback.value).toBe('請先啟用外部來源。');
    current.bridge.refreshReleaseMetadata.mockResolvedValueOnce({
      status: 'invalid-intent',
    });
    expect(await current.session.refresh()).toBe(false);
    expect(current.session.state.error).toBe(true);
    expect(current.session.feedback.value).toContain('目前無法更新');
  });
  it('allows retry after a failed stop without losing the pending update', async () => {
    const current = setup();
    expect(await current.session.cancel()).toBeUndefined();
    expect(current.bridge.cancelReleaseMetadata).not.toHaveBeenCalled();
    let resolve;
    current.bridge.refreshReleaseMetadata.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = current.session.refresh();
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    current.progress({
      status: 'running',
      libraryEpoch: 1,
      total: 1,
      completed: 0,
      updated: 0,
    });
    current.bridge.cancelReleaseMetadata.mockRejectedValueOnce(
      new Error('private'),
    );
    await current.session.cancel();
    expect(current.session.state.cancelling).toBe(false);
    expect(current.session.feedback.value).toContain('目前無法停止');
    await current.session.cancel();
    expect(current.session.state.cancelling).toBe(true);
    expect(current.session.feedback.value).toContain('停止中');
    resolve({ status: 'cancelled', libraryEpoch: 1, updated: 0 });
    await pending;
    expect(current.session.state.busy).toBe(false);
    expect(current.session.state.error).toBe(false);
  });
  it('never queries automatically and reports complete, incomplete, empty and interrupted outcomes', async () => {
    for (const [result, message] of [
      [
        { status: 'complete', total: 2, updated: 1, unresolved: 1 },
        '仍有 1 個來源資訊不完整',
      ],
      [
        { status: 'complete', total: 0, updated: 0, unresolved: 0 },
        '目前沒有可從來源補齊的作品',
      ],
      [
        { status: 'interrupted', total: 2, updated: 1, unresolved: 0 },
        '更新中斷，已補齊 1 張作品',
      ],
    ]) {
      const current = setup({ libraryEpoch: 1, ...result });
      expect(current.bridge.refreshReleaseMetadata).not.toHaveBeenCalled();
      await current.session.refresh();
      expect(current.session.feedback.value).toContain(message);
      expect(current.disposeProgress).toHaveBeenCalledOnce();
      expect(current.disposeScope).toHaveBeenCalledOnce();
      expect(current.session.state.busy).toBe(false);
    }
  });
  it('shares busy state and one request across settings remounts, with cancellation and live progress', async () => {
    const current = setup();
    let resolve;
    current.bridge.refreshReleaseMetadata.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = current.session.refresh();
    expect(current.session.refresh()).toBe(pending);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    const remounted = useLibraryMetadataMaintenance({ bridge: current.bridge });
    expect(remounted).toBe(current.session);
    current.progress({
      status: 'running',
      libraryEpoch: 1,
      total: 4,
      completed: 1,
      updated: 1,
    });
    expect(remounted.feedback.value).toContain('1 / 4');
    await remounted.cancel();
    expect(remounted.feedback.value).toContain('停止中');
    resolve({ status: 'cancelled', libraryEpoch: 1, updated: 1 });
    await pending;
    expect(remounted.feedback.value).toContain('已停止，已補齊 1 張作品');
    expect(current.bridge.refreshReleaseMetadata).toHaveBeenCalledOnce();
  });
  it('ignores old-library progress and results after a scope change, even before initial progress', async () => {
    for (const early of [true, false]) {
      const current = setup();
      let resolve;
      current.bridge.refreshReleaseMetadata.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = current.session.refresh();
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      if (!early)
        current.progress({
          status: 'running',
          libraryEpoch: 1,
          total: 2,
          completed: 0,
          updated: 0,
        });
      current.scope({ libraryEpoch: 2 });
      current.progress({
        status: 'running',
        libraryEpoch: 1,
        total: 2,
        completed: 1,
        updated: 1,
      });
      resolve({ status: 'interrupted', libraryEpoch: 1, updated: 1 });
      expect(await pending).toBe(false);
      expect(current.session.state.progress).toBe(null);
      expect(current.session.feedback.value).toBe(
        '曲庫位置已變更，請重新更新。',
      );
    }
  });
  it('requires the existing feature gate and hides private errors', async () => {
    const current = setup();
    current.requireFeatureGate.mockResolvedValueOnce(false);
    expect(await current.session.refresh()).toBe(false);
    expect(current.bridge.refreshReleaseMetadata).not.toHaveBeenCalled();
    expect(current.session.feedback.value).toContain('請先啟用外部來源');
    current.bridge.refreshReleaseMetadata.mockRejectedValueOnce(
      new Error('C:/private/info.json'),
    );
    expect(await current.session.refresh()).toBe(false);
    expect(current.session.feedback.value).not.toContain('private');
    expect(current.session.state.error).toBe(true);
  });
});
