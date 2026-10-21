import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function emptyPlan(overrides = {}) {
  return {
    version: 1,
    updatedAt: null,
    source: null,
    reviewCursorItemId: null,
    items: [],
    summary: {
      total: 0,
      verified: 0,
      unreviewed: 0,
      manual: 0,
      needsLink: 0,
      unavailable: 0,
      sourceChanged: 0,
      ready: 0,
      needsAttention: 0,
    },
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    itemId: 'item-1',
    mode: 'library-track',
    trackId: 'track-1',
    displayTitle: 'Song',
    displayArtist: 'Singer',
    verification: 'verified',
    origin: 'collection',
    sourceSnapshot: null,
    revision: 1,
    availability: 'playable',
    status: 'ready',
    sourceChanged: false,
    ready: true,
    linkedTrack: { id: 'track-1', title: 'Song', artist: 'Singer' },
    ...overrides,
  };
}

function planWithItems(items, overrides = {}) {
  return emptyPlan({
    reviewCursorItemId: items[0]?.itemId ?? null,
    items,
    summary: {
      total: items.length,
      verified: items.filter((entry) => entry.verification === 'verified')
        .length,
      unreviewed: items.filter((entry) => entry.verification !== 'verified')
        .length,
      manual: items.filter((entry) => entry.mode === 'manual').length,
      needsLink: items.filter((entry) => entry.availability === 'unlinked')
        .length,
      unavailable: items.filter((entry) => entry.availability === 'unavailable')
        .length,
      sourceChanged: items.filter((entry) => entry.sourceChanged).length,
      ready: items.filter((entry) => entry.ready).length,
      needsAttention: items.filter((entry) => !entry.ready).length,
    },
    ...overrides,
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

let api;
let libraryUpdatedCallback;

beforeEach(() => {
  vi.resetModules();
  libraryUpdatedCallback = undefined;
  api = {
    getPerformanceSessionPlan: vi.fn().mockResolvedValue({
      ok: true,
      plan: emptyPlan(),
    }),
    replacePerformanceSessionPlanFromCollection: vi.fn(),
    appendPerformanceSessionPlanLibraryTrack: vi.fn(),
    appendPerformanceSessionPlanFromCollection: vi.fn(),
    appendPerformanceSessionPlanFromArchive: vi.fn(),
    appendPerformanceSessionPlanManualItem: vi.fn(),
    appendPerformanceSessionPlanPlaceholders: vi.fn(),
    updatePerformanceSessionPlanItem: vi.fn(),
    movePerformanceSessionPlanItem: vi.fn(),
    reorderPerformanceSessionPlanItem: vi.fn(),
    duplicatePerformanceSessionPlanItem: vi.fn(),
    removePerformanceSessionPlanItem: vi.fn(),
    setPerformanceSessionPlanReviewCursor: vi.fn(),
    clearPerformanceSessionPlan: vi.fn(),
    setPerformanceSessionPlanProgress: vi.fn(),
    recordDiagnostic: vi.fn().mockResolvedValue({ ok: true }),
    onLibraryUpdated: vi.fn((callback) => {
      libraryUpdatedCallback = callback;
      return vi.fn();
    }),
  };
  vi.stubGlobal('window', { Utawakui: api });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function importSessionPlan() {
  const { usePerformanceSessionPlan } =
    await import('./usePerformanceSessionPlan.js');
  return usePerformanceSessionPlan();
}

describe('usePerformanceSessionPlan', () => {
  it('appends an archive by bounded identity through the existing serialized store', async () => {
    const session = await importSessionPlan();
    api.appendPerformanceSessionPlanFromArchive.mockResolvedValue({
      ok: true,
      plan: planWithItems([item()]),
    });
    expect(await session.appendFromArchive('archived')).toBe(true);
    expect(
      api.appendPerformanceSessionPlanFromArchive,
    ).toHaveBeenCalledExactlyOnceWith({ sessionId: 'archived' });
    expect(
      api.replacePerformanceSessionPlanFromCollection,
    ).not.toHaveBeenCalled();
  });
  it('serializes collection append as a bounded source id and accepts the updated current plan', async () => {
    const session = await importSessionPlan();
    const result = planWithItems([item()]);
    api.appendPerformanceSessionPlanFromCollection.mockResolvedValue({
      ok: true,
      plan: result,
    });
    expect(await session.appendFromCollection('playlist-1')).toBe(true);
    expect(
      api.appendPerformanceSessionPlanFromCollection,
    ).toHaveBeenCalledExactlyOnceWith({ sourceId: 'playlist-1' });
    expect(session.state.plan.items).toEqual(result.items);
    expect(
      api.replacePerformanceSessionPlanFromCollection,
    ).not.toHaveBeenCalled();
  });
  it('forwards a drag as occurrence identities through the existing serialized plan owner', async () => {
    const session = await importSessionPlan();
    await session.initialize();
    api.reorderPerformanceSessionPlanItem.mockResolvedValue({
      ok: true,
      plan: emptyPlan(),
    });
    expect(
      await session.reorderItem(
        'first-occurrence',
        'second-occurrence',
        'after',
      ),
    ).toBe(true);
    expect(
      api.reorderPerformanceSessionPlanItem,
    ).toHaveBeenCalledExactlyOnceWith({
      itemId: 'first-occurrence',
      targetItemId: 'second-occurrence',
      position: 'after',
    });
  });
  it('returns the replay clone identity from its own serialized main response', async () => {
    api.getPerformanceSessionPlan.mockResolvedValue({
      ok: true,
      plan: planWithItems([item({ progress: 'completed' })]),
    });
    const session = await importSessionPlan();
    await session.initialize();
    api.appendPerformanceSessionPlanLibraryTrack.mockResolvedValue({
      ok: true,
      plan: planWithItems([
        item({ progress: 'completed' }),
        item({ itemId: 'other' }),
      ]),
    });
    api.duplicatePerformanceSessionPlanItem.mockResolvedValue({
      ok: true,
      plan: planWithItems([
        item({ progress: 'completed' }),
        item({ itemId: 'other' }),
        item({ itemId: 'replay', progress: 'queued' }),
      ]),
    });
    const earlierAppend = session.appendLibraryTrack('track-1');
    const replay = session.duplicateItemForPlayback('item-1');
    await earlierAppend;
    expect(await replay).toBe('replay');
    expect(session.state.plan.items[0].progress).toBe('completed');
  });
  it('returns no replay identity after a failed mutation', async () => {
    const session = await importSessionPlan();
    await session.initialize();
    api.duplicatePerformanceSessionPlanItem.mockResolvedValue({
      ok: false,
      error: { code: 'SESSION_PLAN_ITEM_NOT_FOUND', message: '找不到項目' },
    });
    expect(await session.duplicateItemForPlayback('gone')).toBeNull();
  });
  it('serializes confirmed start and immediate finish with the latest progress revision', async () => {
    api.getPerformanceSessionPlan.mockResolvedValue({
      ok: true,
      plan: planWithItems([item({ progress: 'queued', progressRevision: 0 })]),
    });
    const first = createDeferred();
    api.setPerformanceSessionPlanProgress
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        ok: true,
        plan: planWithItems([
          item({ progress: 'completed', progressRevision: 2 }),
        ]),
      });
    const sessionPlan = await importSessionPlan();
    await sessionPlan.initialize();
    const start = sessionPlan.setProgress('item-1', 'playing');
    const end = sessionPlan.setProgress('item-1', 'completed');
    await Promise.resolve();
    expect(api.setPerformanceSessionPlanProgress).toHaveBeenCalledTimes(1);
    first.resolve({
      ok: true,
      plan: planWithItems([item({ progress: 'playing', progressRevision: 1 })]),
    });
    await Promise.all([start, end]);
    expect(api.setPerformanceSessionPlanProgress.mock.calls).toEqual([
      [{ itemId: 'item-1', expectedProgressRevision: 0, progress: 'playing' }],
      [
        {
          itemId: 'item-1',
          expectedProgressRevision: 1,
          progress: 'completed',
        },
      ],
    ]);
  });
  it('loads the persisted current draft once through explicit initialization', async () => {
    const loaded = planWithItems([item()]);
    api.getPerformanceSessionPlan.mockResolvedValue({ ok: true, plan: loaded });
    const sessionPlan = await importSessionPlan();

    expect(api.getPerformanceSessionPlan).not.toHaveBeenCalled();

    await Promise.all([sessionPlan.initialize(), sessionPlan.initialize()]);

    expect(api.getPerformanceSessionPlan).toHaveBeenCalledOnce();
    expect(api.onLibraryUpdated).toHaveBeenCalledOnce();
    expect(sessionPlan.state.plan).toEqual(loaded);
    expect(sessionPlan.selectedItem.value?.itemId).toBe('item-1');
    expect(sessionPlan.state.isInitialized).toBe(true);
  });

  it('serializes mutations and applies only authoritative main projections', async () => {
    const replace = createDeferred();
    const imported = planWithItems([item()], {
      source: { id: 'playlist-1', name: 'Live', kind: 'playlist' },
    });
    const appended = planWithItems([
      item(),
      item({
        itemId: 'item-2',
        trackId: null,
        displayTitle: 'Encore',
        availability: 'unlinked',
        status: 'needs-link',
        linkedTrack: null,
      }),
    ]);
    api.replacePerformanceSessionPlanFromCollection.mockReturnValue(
      replace.promise,
    );
    api.appendPerformanceSessionPlanPlaceholders.mockResolvedValue({
      ok: true,
      plan: appended,
    });
    const sessionPlan = await importSessionPlan();

    const first = sessionPlan.replaceFromCollection('playlist-1');
    const second = sessionPlan.appendPlaceholders('Encore');
    await Promise.resolve();

    expect(
      api.replacePerformanceSessionPlanFromCollection,
    ).toHaveBeenCalledWith({ sourceId: 'playlist-1', replaceCurrent: false });
    expect(api.appendPerformanceSessionPlanPlaceholders).not.toHaveBeenCalled();

    replace.resolve({ ok: true, plan: imported });
    await first;
    await second;

    expect(api.appendPerformanceSessionPlanPlaceholders).toHaveBeenCalledWith(
      'Encore',
    );
    expect(sessionPlan.state.plan).toEqual(appended);
  });

  it('uses explicit fast-path and manual-exception bridge intents', async () => {
    const libraryPlan = planWithItems([item()]);
    const manualPlan = planWithItems([
      item(),
      item({
        itemId: 'item-2',
        mode: 'manual',
        trackId: null,
        displayTitle: 'Acoustic interlude',
        displayArtist: 'Guest',
        availability: 'manual',
        status: 'manual',
        linkedTrack: null,
      }),
    ]);
    api.appendPerformanceSessionPlanLibraryTrack.mockResolvedValue({
      ok: true,
      plan: libraryPlan,
    });
    api.appendPerformanceSessionPlanManualItem.mockResolvedValue({
      ok: true,
      plan: manualPlan,
    });
    const sessionPlan = await importSessionPlan();

    await expect(sessionPlan.appendLibraryTrack('track-1')).resolves.toBe(true);
    await expect(
      sessionPlan.appendManualItem({
        displayTitle: 'Acoustic interlude',
        displayArtist: 'Guest',
      }),
    ).resolves.toBe(true);

    expect(api.appendPerformanceSessionPlanLibraryTrack).toHaveBeenCalledWith(
      'track-1',
    );
    expect(api.appendPerformanceSessionPlanManualItem).toHaveBeenCalledWith({
      displayTitle: 'Acoustic interlude',
      displayArtist: 'Guest',
    });
    expect(sessionPlan.state.plan).toEqual(manualPlan);
  });

  it('forwards occurrence move, duplicate, and remove intents in order', async () => {
    const movedPlan = planWithItems([
      item({ itemId: 'item-2' }),
      item({ itemId: 'item-1' }),
    ]);
    const duplicatedPlan = planWithItems([
      item({ itemId: 'item-2' }),
      item({ itemId: 'item-1' }),
      item({ itemId: 'item-3', origin: 'duplicate' }),
    ]);
    const removedPlan = planWithItems([
      item({ itemId: 'item-2' }),
      item({ itemId: 'item-3', origin: 'duplicate' }),
    ]);
    api.movePerformanceSessionPlanItem.mockResolvedValue({
      ok: true,
      plan: movedPlan,
    });
    api.duplicatePerformanceSessionPlanItem.mockResolvedValue({
      ok: true,
      plan: duplicatedPlan,
    });
    api.removePerformanceSessionPlanItem.mockResolvedValue({
      ok: true,
      plan: removedPlan,
    });
    const sessionPlan = await importSessionPlan();

    await sessionPlan.moveItem('item-1', -1);
    await sessionPlan.duplicateItem('item-1');
    await sessionPlan.removeItem('item-1');

    expect(api.movePerformanceSessionPlanItem).toHaveBeenCalledWith({
      itemId: 'item-1',
      offset: -1,
    });
    expect(api.duplicatePerformanceSessionPlanItem).toHaveBeenCalledWith(
      'item-1',
    );
    expect(api.removePerformanceSessionPlanItem).toHaveBeenCalledWith('item-1');
    expect(sessionPlan.state.plan).toEqual(removedPlan);
  });

  it('keeps expected validation errors local and exposes correction context', async () => {
    const validationError = {
      code: 'SESSION_PLAN_REPLACE_REQUIRED',
      field: 'replaceCurrent',
      message: '目前已有場次草稿，請先確認是否取代。',
      context: { currentSourceName: 'Previous', itemCount: 3 },
    };
    api.replacePerformanceSessionPlanFromCollection.mockResolvedValue({
      ok: false,
      error: validationError,
    });
    const sessionPlan = await importSessionPlan();

    const result = await sessionPlan.replaceFromCollection('playlist-2');

    expect(result).toBe(false);
    expect(sessionPlan.state.validationError).toEqual(validationError);
    expect(sessionPlan.state.error).toBe(null);
    expect(api.recordDiagnostic).not.toHaveBeenCalled();
  });

  it('records unexpected IPC failures with a bounded user-facing message and recovers', async () => {
    api.appendPerformanceSessionPlanPlaceholders
      .mockRejectedValueOnce(new Error('private E:\\Music\\song.wav'))
      .mockResolvedValueOnce({ ok: true, plan: planWithItems([item()]) });
    const sessionPlan = await importSessionPlan();

    await expect(sessionPlan.appendPlaceholders('Song')).resolves.toBe(false);
    expect(sessionPlan.state.error).toBe('場次草稿未更新，請再試一次。');
    expect(api.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'performance-session-plan',
        operation: 'mutate',
      }),
    );

    await expect(sessionPlan.appendPlaceholders('Song')).resolves.toBe(true);
    expect(sessionPlan.state.error).toBe(null);
  });

  it('keeps display save separate from existing-track relink intents', async () => {
    const current = item({ itemId: 'item-7', revision: 4 });
    api.getPerformanceSessionPlan.mockResolvedValue({
      ok: true,
      plan: planWithItems([current]),
    });
    api.updatePerformanceSessionPlanItem.mockResolvedValue({
      ok: true,
      plan: planWithItems([
        item({
          itemId: 'item-7',
          revision: 5,
          verification: 'verified',
          ready: true,
          status: 'verified',
        }),
      ]),
    });
    const sessionPlan = await importSessionPlan();
    await sessionPlan.initialize();

    await sessionPlan.saveDisplay('item-7', {
      displayTitle: 'Stage title',
      displayArtist: 'Guest',
      trackId: 'must-not-cross-display-save',
    });

    expect(api.updatePerformanceSessionPlanItem).toHaveBeenCalledWith({
      itemId: 'item-7',
      expectedRevision: 4,
      displayTitle: 'Stage title',
      displayArtist: 'Guest',
    });

    api.updatePerformanceSessionPlanItem.mockClear();
    await sessionPlan.relinkItem('item-7', {
      displayTitle: 'Stage title',
      displayArtist: 'Guest',
      trackId: 'track-1',
    });

    expect(api.updatePerformanceSessionPlanItem).toHaveBeenCalledWith({
      itemId: 'item-7',
      expectedRevision: 5,
      displayTitle: 'Stage title',
      displayArtist: 'Guest',
      trackId: 'track-1',
    });
  });

  it('refreshes after library updates without overtaking a pending mutation', async () => {
    const mutation = createDeferred();
    api.appendPerformanceSessionPlanPlaceholders.mockReturnValue(
      mutation.promise,
    );
    const sessionPlan = await importSessionPlan();
    await sessionPlan.initialize();

    const pendingMutation = sessionPlan.appendPlaceholders('Song');
    libraryUpdatedCallback();
    await Promise.resolve();

    expect(api.getPerformanceSessionPlan).toHaveBeenCalledTimes(1);

    mutation.resolve({ ok: true, plan: planWithItems([item()]) });
    await pendingMutation;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.getPerformanceSessionPlan).toHaveBeenCalledTimes(2);
  });
});
