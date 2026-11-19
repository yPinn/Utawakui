import { describe, expect, it, vi } from 'vitest';

vi.mock('./usePerformerSelfView.js', () => ({ usePerformerSelfView: vi.fn() }));
vi.mock('./useShortcutCommands.js', () => ({ useShortcutCommands: vi.fn() }));
const queueOwner = vi.hoisted(() => ({
  queuedTracks: { value: [] },
  clearQueuedTracks: vi.fn(),
  reorderSourceTrack: vi.fn(),
  removeQueuedTrack: vi.fn(),
}));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => queueOwner,
}));

import { useCompanionRemote } from './useCompanionRemote.js';

function setup({ matches = true, status = 'executed', control = true } = {}) {
  const bridge = {
    onCompanionCommand: vi.fn(() => vi.fn()),
    reportCompanionCommandResult: vi.fn(async () => true),
  };
  const selfView = {
    matchesPublishedContext: vi.fn(() => matches),
    resolvePublishedQueueSelection: vi.fn(),
    publishedQueueContext: vi.fn(),
    applyControlIntent: vi.fn(async () => control),
  };
  const executor = { execute: vi.fn(async () => ({ status })) };
  const remote = useCompanionRemote({ bridge, selfView, executor });
  return { remote, bridge, selfView, executor };
}

const message = (command) => ({
  id: 'c1',
  command,
  revision: 4,
  trackId: 'a',
});

describe('useCompanionRemote', () => {
  it('clears only the published manual queue and never falls back to source removal', async () => {
    const { remote, selfView } = setup();
    queueOwner.clearQueuedTracks.mockClear();
    queueOwner.queuedTracks.value = [{ id: 'b' }];
    selfView.publishedQueueContext.mockReturnValue({ manualIds: ['a'] });
    expect(await remote.handle(message('queue.clear'))).toBe('stale');
    expect(queueOwner.clearQueuedTracks).not.toHaveBeenCalled();
    selfView.publishedQueueContext.mockReturnValue({ manualIds: ['b'] });
    expect(await remote.handle(message('queue.clear'))).toBe('applied');
    expect(queueOwner.clearQueuedTracks).toHaveBeenCalledOnce();

    selfView.resolvePublishedQueueSelection.mockReturnValue({
      track: { id: 'b' },
      source: true,
    });
    expect(
      await remote.handle({ ...message('queue.remove'), queueIndex: 0 }),
    ).toBe('unavailable');
    expect(queueOwner.removeQueuedTrack).not.toHaveBeenCalled();
  });

  it('moves published neighboring rows within their own group', async () => {
    const { remote, selfView } = setup();
    selfView.publishedQueueContext.mockReturnValue({});
    selfView.resolvePublishedQueueSelection.mockImplementation(
      (_revision, _track, index) =>
        [
          { track: { id: 'manual' }, source: false },
          { track: { id: 'b' }, source: true },
          { track: { id: 'c' }, source: true },
        ][index],
    );
    queueOwner.reorderSourceTrack.mockReturnValue(true);
    expect(
      await remote.handle({ ...message('queue.move-up'), queueIndex: 1 }),
    ).toBe('stale');
    expect(
      await remote.handle({ ...message('queue.move-up'), queueIndex: 2 }),
    ).toBe('applied');
    expect(queueOwner.reorderSourceTrack).toHaveBeenCalledWith(
      'c',
      'b',
      'before',
    );
  });
  it('plays only a queue row resolved from the requested snapshot', async () => {
    const { remote, selfView, executor } = setup();
    const pick = { ...message('queue.play'), queueIndex: 2 };
    expect(await remote.handle(pick)).toBe('stale');
    expect(executor.execute).not.toHaveBeenCalled();
    const queueSelection = { track: { id: 'b' }, source: true };
    selfView.resolvePublishedQueueSelection.mockReturnValue(queueSelection);
    expect(await remote.handle(pick)).toBe('applied');
    expect(selfView.resolvePublishedQueueSelection).toHaveBeenCalledWith(
      4,
      'a',
      2,
    );
    expect(executor.execute).toHaveBeenCalledWith('queue.play', {
      scope: 'companion',
      queueSelection,
    });
  });
  it('runs transport commands through the shortcut executor when current', async () => {
    const { remote, bridge, executor, selfView } = setup();
    expect(await remote.handle(message('player.next'))).toBe('applied');
    expect(executor.execute).toHaveBeenCalledWith('player.next', {
      isCurrent: expect.any(Function),
      scope: 'companion',
    });
    executor.execute.mock.calls[0][1].isCurrent();
    expect(selfView.matchesPublishedContext).toHaveBeenCalledWith(4, 'a');
    expect(bridge.reportCompanionCommandResult).toHaveBeenCalledWith(
      'c1',
      'applied',
    );
  });

  it('refuses commands issued against an older snapshot', async () => {
    const { remote, executor } = setup({ matches: false });
    expect(await remote.handle(message('player.volume-up'))).toBe('stale');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('maps executor refusals and failures to bounded statuses', async () => {
    for (const [status, expected] of [
      ['busy', 'busy'],
      ['unavailable', 'unavailable'],
      ['stale', 'stale'],
      ['failed', 'failed'],
    ]) {
      const { remote } = setup({ status });
      expect(await remote.handle(message('player.transpose-up'))).toBe(
        expected,
      );
    }
    const { remote, executor } = setup();
    executor.execute.mockRejectedValueOnce(new Error('private'));
    expect(await remote.handle(message('player.mute'))).toBe('failed');
  });

  it('routes reading changes through the prompter control intent', async () => {
    const { remote, selfView, executor } = setup();
    expect(await remote.handle(message('reading.romaji'))).toBe('applied');
    expect(selfView.applyControlIntent).toHaveBeenCalledWith({
      action: 'reading-romaji',
      revision: 4,
      trackId: 'a',
    });
    expect(executor.execute).not.toHaveBeenCalled();
    const refused = setup({ control: false });
    expect(await refused.remote.handle(message('reading.off'))).toBe('stale');
  });

  it('subscribes once and survives a lost report', async () => {
    const { remote, bridge } = setup();
    remote.initialize();
    remote.initialize();
    expect(bridge.onCompanionCommand).toHaveBeenCalledOnce();
    remote.dispose();
    bridge.reportCompanionCommandResult.mockRejectedValueOnce(
      new Error('gone'),
    );
    await expect(remote.handle(message('player.mute'))).resolves.toBe(
      'applied',
    );
  });
});
