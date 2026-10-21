import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePerformanceQueueActions } from './usePerformanceQueueActions.js';

const mocks = vi.hoisted(() => ({
  state: { isSaving: false },
  track: vi.fn(),
  collection: vi.fn(),
  archive: vi.fn(),
  tab: vi.fn(),
  dock: vi.fn(),
}));
vi.mock('./usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => ({
    state: mocks.state,
    appendLibraryTrack: mocks.track,
    appendFromCollection: mocks.collection,
    appendFromArchive: mocks.archive,
  }),
}));
vi.mock('./useAppRightDock.js', () => ({
  useAppRightDock: () => ({
    selectArrangementTab: mocks.tab,
    showQueueVariant: mocks.dock,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.isSaving = false;
});

describe('explicit performance queue intents', () => {
  it('routes an archive through the serialized plan owner each time without a playlist conversion', async () => {
    mocks.archive.mockResolvedValue(true);
    const actions = usePerformanceQueueActions();
    await actions.addArchive('archived');
    await actions.addArchive('archived');
    expect(mocks.archive.mock.calls).toEqual([['archived'], ['archived']]);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.dock).toHaveBeenCalledWith('arrangement');
    mocks.state.isSaving = true;
    expect(await actions.addArchive('archived')).toBe(false);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
  });
  it('dispatches only bounded ids, permits repeated tracks, then reveals pending', async () => {
    mocks.track.mockResolvedValue(true);
    mocks.collection.mockResolvedValue(true);
    const actions = usePerformanceQueueActions();
    await actions.addTrack('same');
    await actions.addTrack('same');
    await actions.addCollection('playlist');
    expect(mocks.track.mock.calls).toEqual([['same'], ['same']]);
    expect(mocks.collection).toHaveBeenCalledExactlyOnceWith('playlist');
    expect(mocks.tab.mock.calls).toEqual([
      ['pending'],
      ['pending'],
      ['pending'],
    ]);
    expect(mocks.dock.mock.calls).toEqual([
      ['arrangement'],
      ['arrangement'],
      ['arrangement'],
    ]);
  });
  it('rejects busy/empty intents and reveals plan-owned validation errors after a failed append', async () => {
    const actions = usePerformanceQueueActions();
    mocks.state.isSaving = true;
    expect(await actions.addTrack('same')).toBe(false);
    expect(await actions.addCollection('playlist')).toBe(false);
    mocks.state.isSaving = false;
    expect(await actions.addTrack('')).toBe(false);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.dock).not.toHaveBeenCalled();
    mocks.track.mockResolvedValue(false);
    expect(await actions.addTrack('missing')).toBe(false);
    expect(mocks.dock).toHaveBeenCalledWith('arrangement');
  });
});
