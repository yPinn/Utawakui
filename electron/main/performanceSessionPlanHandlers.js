'use strict';

const { listTracks } = require('../lib/library');
const { loadPlaylists } = require('../lib/playlists');
const {
  PerformanceSessionPlanValidationError,
  createPerformanceSessionPlanStore,
  isPerformanceSessionPlanValidationError,
} = require('../lib/performanceSessionPlan');
const { createPlanIpcRunner } = require('./ipcErrorBoundary');
const {
  registerPerformanceSessionHistoryHandlers,
} = require('./performanceSessionHistoryHandlers');
const {
  isSessionArchiveValidationError,
} = require('../lib/performanceSessionArchive');

const OPERATION_ERRORS = Object.freeze({
  archive: {
    code: 'PERFORMANCE_SESSION_ARCHIVE_FAILED',
    title: '場次尚未封存',
    message: '場次尚未封存，目前資料仍保留，請重試。',
  },
  history: {
    code: 'PERFORMANCE_SESSION_HISTORY_FAILED',
    title: '演出紀錄未更新',
    message: '目前無法讀取或保存演出紀錄，請重試。',
  },
  export: {
    code: 'PERFORMANCE_SESSION_EXPORT_FAILED',
    title: '演出歌單尚未保存',
    message: '演出歌單尚未保存，請重試。',
  },
  get: {
    code: 'PERFORMANCE_SESSION_PLAN_GET_FAILED',
    title: '場次草稿無法讀取',
    message: '目前無法讀取場次草稿，請再試一次。',
  },
  replace: {
    code: 'PERFORMANCE_SESSION_PLAN_REPLACE_FAILED',
    title: '場次草稿無法建立',
    message: '目前無法從播放清單建立場次草稿，請再試一次。',
  },
  append: {
    code: 'PERFORMANCE_SESSION_PLAN_APPEND_FAILED',
    title: '曲目無法加入場次',
    message: '目前無法加入這些曲目，請再試一次。',
  },
  update: {
    code: 'PERFORMANCE_SESSION_PLAN_UPDATE_FAILED',
    title: '場次曲目無法更新',
    message: '這首場次曲目目前無法更新，請再試一次。',
  },
  move: {
    code: 'PERFORMANCE_SESSION_PLAN_MOVE_FAILED',
    title: '場次順序無法更新',
    message: '目前無法調整場次順序，請再試一次。',
  },
  duplicate: {
    code: 'PERFORMANCE_SESSION_PLAN_DUPLICATE_FAILED',
    title: '場次曲目無法複製',
    message: '目前無法複製這首場次曲目，請再試一次。',
  },
  remove: {
    code: 'PERFORMANCE_SESSION_PLAN_REMOVE_FAILED',
    title: '場次曲目無法移除',
    message: '目前無法移除這首場次曲目，請再試一次。',
  },
  cursor: {
    code: 'PERFORMANCE_SESSION_PLAN_CURSOR_FAILED',
    title: '檢查位置無法更新',
    message: '目前無法切換檢查曲目，請再試一次。',
  },
  clear: {
    code: 'PERFORMANCE_SESSION_PLAN_CLEAR_FAILED',
    title: '場次草稿無法清除',
    message: '目前無法清除場次草稿，請再試一次。',
  },
});

// A full library scan costs milliseconds per hundred tracks, so reorder-style
// edits reuse a very recent scan; anything that can depend on new tracks
// (get, append, relink, replace) always rescans and refreshes the cache.
const TRACKS_REUSE_MS = 3_000;

const VALIDATION_CONTEXT_KEYS = Object.freeze([
  'currentSourceName',
  'itemCount',
  'updatedAt',
]);

function registerPerformanceSessionPlanHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  recordDiagnostic,
  loadPlaylistsList = loadPlaylists,
  listLibraryTracks = listTracks,
  createStore = ({ directory }) =>
    createPerformanceSessionPlanStore({ directory }),
  now = Date.now,
  sessionHistoryService = null,
  getReleaseScope = null,
  withPlayableRelease = null,
}) {
  let scan = null;
  const recoveredDirectories = new Set();

  function operationContext({ reuseRecentScan = false } = {}) {
    const directory = resolveDownloadDir(getConfig());
    const reusable =
      reuseRecentScan &&
      scan?.directory === directory &&
      now() - scan.at < TRACKS_REUSE_MS;
    if (!reusable) {
      const tracks = listLibraryTracks(directory);
      scan = {
        directory,
        at: now(),
        tracksById: new Map(tracks.map((track) => [track.id, track])),
      };
    }
    const store = createStore({ directory });
    if (!recoveredDirectories.has(directory)) {
      store.recoverProgress();
      recoveredDirectories.add(directory);
    }
    return {
      directory,
      tracksById: scan.tracksById,
      store,
    };
  }

  const runOperation = createPlanIpcRunner({
    source: 'performance-session-plan',
    operationErrors: OPERATION_ERRORS,
    isValidationError: (error) =>
      isPerformanceSessionPlanValidationError(error) ||
      isSessionArchiveValidationError(error),
    validationContextKeys: VALIDATION_CONTEXT_KEYS,
    recordDiagnostic,
  });
  let pending = Promise.resolve();
  const run = (operation, work) => {
    const task = pending.then(() => runOperation(operation, work));
    pending = task.catch(() => {});
    return task;
  };

  // Every store mutation takes `(argument, tracksById)`; reorder-style edits
  // may reuse a recent scan.
  function registerMutation(channel, operation, method, options = {}) {
    ipcMain.handle(channel, async (_event, argument) =>
      run(operation, async () => {
        const { store, tracksById } = operationContext({
          reuseRecentScan: options.reuseRecentScan === true,
        });
        if (
          method === 'setProgress' &&
          argument?.progress === 'playing' &&
          sessionHistoryService
        ) {
          const observation = store.preparePerformanceStart(
            argument,
            tracksById,
          );
          const entry =
            await sessionHistoryService.observePerformance(observation);
          return store.setProgress(argument, tracksById, entry);
        }
        return store[method](argument, tracksById);
      }),
    );
  }

  ipcMain.handle('performance-session-plan:get', async () =>
    run('get', () => {
      const { store, tracksById } = operationContext();
      if (store.ensureSession) return store.ensureSession(tracksById);
      return store.getProjected(tracksById);
    }),
  );

  for (const [channel, operation, method] of [
    [
      'performance-session-plan:replace-from-collection',
      'replace',
      'replaceFromCollection',
    ],
    [
      'performance-session-plan:append-from-collection',
      'append',
      'appendFromCollection',
    ],
  ]) {
    ipcMain.handle(channel, async (_event, intent) => {
      const releaseScope = getReleaseScope?.();
      return run(operation, () => {
        if (releaseScope) {
          const currentScope = getReleaseScope();
          if (
            currentScope.dir !== releaseScope.dir ||
            currentScope.epoch !== releaseScope.epoch
          )
            throw new Error(
              'Collection scope changed before session admission.',
            );
        }
        const { directory, store, tracksById } = operationContext();
        const playlists = loadPlaylistsList(directory);
        const collection = playlists.find(
          (playlist) => playlist.id === intent?.sourceId,
        );
        if (!collection) {
          throw new PerformanceSessionPlanValidationError({
            code: 'SESSION_PLAN_SOURCE_NOT_FOUND',
            field: 'sourceId',
            message: '找不到這個播放清單，曲庫可能已更新。',
          });
        }
        const commit = (currentStore, currentTracks, currentCollection) =>
          currentStore[method]({
            collection: {
              id: currentCollection.id,
              name: currentCollection.name,
              kind: currentCollection.kind,
              trackIds: currentCollection.trackIds,
            },
            tracksById: currentTracks,
            replaceCurrent: intent?.replaceCurrent === true,
          });
        if (collection.kind === 'album' && withPlayableRelease) {
          return withPlayableRelease(
            {
              collectionId: collection.id,
              ...(releaseScope ? { libraryEpoch: releaseScope.epoch } : {}),
            },
            ({ collection: verified, context }) => {
              const currentScope = getReleaseScope?.();
              if (
                resolveDownloadDir(getConfig()) !== context.dir ||
                (currentScope && currentScope.epoch !== context.epoch)
              )
                throw new Error(
                  'Release scope changed before session admission.',
                );
              const current = operationContext();
              return commit(current.store, current.tracksById, verified);
            },
          );
        }
        if (collection.releaseInfo?.localMemberBindings)
          throw new Error('Release membership verification is required.');
        return commit(store, tracksById, collection);
      });
    });
  }

  for (const [channel, operation, method, reuseRecentScan] of [
    [
      'performance-session-plan:append-library-track',
      'append',
      'appendLibraryTrack',
    ],
    [
      'performance-session-plan:append-manual-item',
      'append',
      'appendManualItem',
    ],
    [
      'performance-session-plan:append-placeholders',
      'append',
      'appendPlaceholders',
    ],
    ['performance-session-plan:update-item', 'update', 'updateItem'],
    ['performance-session-plan:set-progress', 'update', 'setProgress'],
    ['performance-session-plan:move-item', 'move', 'moveItem', true],
    ['performance-session-plan:reorder-item', 'move', 'reorderItem', true],
    [
      'performance-session-plan:duplicate-item',
      'duplicate',
      'duplicateItem',
      true,
    ],
    ['performance-session-plan:remove-item', 'remove', 'removeItem', true],
    [
      'performance-session-plan:set-review-cursor',
      'cursor',
      'setReviewCursor',
      true,
    ],
  ]) {
    registerMutation(channel, operation, method, { reuseRecentScan });
  }

  ipcMain.handle('performance-session-plan:clear', async () =>
    run('clear', () => {
      const { store, tracksById } = operationContext({ reuseRecentScan: true });
      return store.clear(tracksById);
    }),
  );
  registerPerformanceSessionHistoryHandlers({
    ipcMain,
    run,
    operationContext,
    sessionHistoryService,
  });
}

module.exports = { registerPerformanceSessionPlanHandlers };
