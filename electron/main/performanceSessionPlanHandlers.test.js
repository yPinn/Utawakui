import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { PerformanceSessionPlanValidationError } from '../lib/performanceSessionPlan.js';
import { registerPerformanceSessionPlanHandlers } from './performanceSessionPlanHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function emptyPlan() {
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
  };
}

function createStore(overrides = {}) {
  return {
    getProjected: vi.fn(() => emptyPlan()),
    replaceFromCollection: vi.fn(() => emptyPlan()),
    appendLibraryTrack: vi.fn(() => emptyPlan()),
    appendManualItem: vi.fn(() => emptyPlan()),
    appendPlaceholders: vi.fn(() => emptyPlan()),
    updateItem: vi.fn(() => emptyPlan()),
    moveItem: vi.fn(() => emptyPlan()),
    duplicateItem: vi.fn(() => emptyPlan()),
    removeItem: vi.fn(() => emptyPlan()),
    setReviewCursor: vi.fn(() => emptyPlan()),
    clear: vi.fn(() => emptyPlan()),
    ...overrides,
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  const store = overrides.store ?? createStore();
  const recordDiagnostic = overrides.recordDiagnostic ?? vi.fn();
  registerPerformanceSessionPlanHandlers({
    ipcMain,
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    recordDiagnostic,
    loadPlaylistsList: vi.fn(() => [
      {
        id: 'playlist-1',
        name: 'Authoritative name',
        kind: 'playlist',
        trackIds: ['t-2', 't-1'],
      },
    ]),
    listLibraryTracks: vi.fn(() => [
      { id: 't-1', title: 'One', artist: 'A', url: 'private-url' },
      { id: 't-2', title: 'Two', artist: 'B', filename: 'private.mp3' },
    ]),
    createStore: vi.fn(() => store),
    ...overrides,
  });
  return { handlers: ipcMain.handlers, store, recordDiagnostic };
}

function parseAppError(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length));
}

describe('registerPerformanceSessionPlanHandlers', () => {
  it('registers only the exact session preparation intents', () => {
    const { handlers } = register();

    expect([...handlers.keys()]).toEqual([
      'performance-session-plan:get',
      'performance-session-plan:replace-from-collection',
      'performance-session-plan:append-library-track',
      'performance-session-plan:append-manual-item',
      'performance-session-plan:append-placeholders',
      'performance-session-plan:update-item',
      'performance-session-plan:move-item',
      'performance-session-plan:duplicate-item',
      'performance-session-plan:remove-item',
      'performance-session-plan:set-review-cursor',
      'performance-session-plan:clear',
    ]);
  });

  it('projects the current draft from main-owned library metadata', async () => {
    const { handlers, store } = register();

    await expect(
      handlers.get('performance-session-plan:get')(),
    ).resolves.toEqual({ ok: true, plan: emptyPlan() });
    expect(store.getProjected).toHaveBeenCalledWith(
      new Map([
        ['t-1', expect.objectContaining({ title: 'One' })],
        ['t-2', expect.objectContaining({ title: 'Two' })],
      ]),
    );
  });

  it('derives source name, kind, order and track metadata instead of trusting renderer copies', async () => {
    const { handlers, store } = register();

    await handlers.get('performance-session-plan:replace-from-collection')(
      null,
      {
        sourceId: 'playlist-1',
        sourceName: 'Spoofed name',
        trackIds: ['spoofed'],
        replaceCurrent: true,
      },
    );

    expect(store.replaceFromCollection).toHaveBeenCalledWith({
      collection: {
        id: 'playlist-1',
        name: 'Authoritative name',
        kind: 'playlist',
        trackIds: ['t-2', 't-1'],
      },
      tracksById: expect.any(Map),
      replaceCurrent: true,
    });
  });

  it('returns bounded expected validation errors without recording diagnostics', async () => {
    const validation = new PerformanceSessionPlanValidationError({
      code: 'SESSION_PLAN_DISPLAY_TITLE_REQUIRED',
      message: '請輸入顯示曲名或項目名稱。',
      field: 'displayTitle',
      context: { privatePath: 'C:/private/file.mp3', itemCount: 12 },
    });
    const { handlers, recordDiagnostic } = register({
      store: createStore({
        updateItem: vi.fn(() => {
          throw validation;
        }),
      }),
    });

    await expect(
      handlers.get('performance-session-plan:update-item')(null, {
        itemId: 'item-1',
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'SESSION_PLAN_DISPLAY_TITLE_REQUIRED',
        field: 'displayTitle',
        message: '請輸入顯示曲名或項目名稱。',
        context: { itemCount: 12 },
      },
    });
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('returns a bounded source-not-found correction instead of creating an empty draft', async () => {
    const { handlers, store } = register({
      loadPlaylistsList: vi.fn(() => []),
    });

    await expect(
      handlers.get('performance-session-plan:replace-from-collection')(null, {
        sourceId: 'missing',
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'SESSION_PLAN_SOURCE_NOT_FOUND',
        field: 'sourceId',
        message: '找不到這個播放清單，曲庫可能已更新。',
      },
    });
    expect(store.replaceFromCollection).not.toHaveBeenCalled();
  });

  it('passes only the operation intent and main-derived tracks to each mutation', async () => {
    const { handlers, store } = register();
    const cases = [
      [
        'performance-session-plan:append-library-track',
        'appendLibraryTrack',
        ['t-1'],
      ],
      [
        'performance-session-plan:append-manual-item',
        'appendManualItem',
        [{ displayTitle: 'Acoustic', displayArtist: 'Guest' }],
      ],
      [
        'performance-session-plan:append-placeholders',
        'appendPlaceholders',
        ['One\nTwo'],
      ],
      [
        'performance-session-plan:update-item',
        'updateItem',
        [{ itemId: 'item-1', expectedRevision: 1 }],
      ],
      [
        'performance-session-plan:move-item',
        'moveItem',
        [{ itemId: 'item-1', offset: 1 }],
      ],
      ['performance-session-plan:duplicate-item', 'duplicateItem', ['item-1']],
      ['performance-session-plan:remove-item', 'removeItem', ['item-1']],
      [
        'performance-session-plan:set-review-cursor',
        'setReviewCursor',
        ['item-1'],
      ],
      ['performance-session-plan:clear', 'clear', []],
    ];

    for (const [channel, method, args] of cases) {
      await handlers.get(channel)(null, ...args);
      expect(store[method]).toHaveBeenCalledWith(...args, expect.any(Map));
    }
  });

  it('reuses one recent library scan for reorder edits but rescans for reads and links', async () => {
    let clock = 1_000;
    const listLibraryTracks = vi.fn(() => [{ id: 't-1', title: 'One' }]);
    const { handlers } = register({ listLibraryTracks, now: () => clock });

    await handlers.get('performance-session-plan:get')(null);
    await handlers.get('performance-session-plan:move-item')(null, {
      itemId: 'a',
      offset: 1,
    });
    await handlers.get('performance-session-plan:set-review-cursor')(null, 'a');
    expect(listLibraryTracks).toHaveBeenCalledTimes(1);

    await handlers.get('performance-session-plan:append-library-track')(
      null,
      't-1',
    );
    expect(listLibraryTracks).toHaveBeenCalledTimes(2);

    clock += 5_000;
    await handlers.get('performance-session-plan:remove-item')(null, 'a');
    expect(listLibraryTracks).toHaveBeenCalledTimes(3);
  });

  it('records operational failures and exposes only a safe public AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const { handlers } = register({
      recordDiagnostic,
      listLibraryTracks: vi.fn(() => {
        throw new Error('EACCES: C:/Users/private/session-plan.json');
      }),
    });

    const error = await handlers
      .get('performance-session-plan:get')()
      .catch((caught) => caught);
    const payload = parseAppError(error);

    expect(payload).toMatchObject({
      code: 'PERFORMANCE_SESSION_PLAN_GET_FAILED',
      message: '目前無法讀取場次草稿，請再試一次。',
      context: { diagnosticRecorded: true, retryable: true },
    });
    expect(JSON.stringify(payload)).not.toContain('Users/private');
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'performance-session-plan',
        operation: 'get',
      }),
    );
  });
});
