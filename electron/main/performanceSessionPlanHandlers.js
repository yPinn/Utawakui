'use strict';

const { listTracks } = require('../lib/library');
const { loadPlaylists } = require('../lib/playlists');
const {
  PerformanceSessionPlanValidationError,
  createPerformanceSessionPlanStore,
  isPerformanceSessionPlanValidationError,
} = require('../lib/performanceSessionPlan');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

const OPERATION_ERRORS = Object.freeze({
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

const VALIDATION_CONTEXT_KEYS = new Set([
  'currentSourceName',
  'itemCount',
  'updatedAt',
]);

function publicValidationResult(error) {
  const context = error.context
    ? Object.fromEntries(
        Object.entries(error.context).filter(([key]) =>
          VALIDATION_CONTEXT_KEYS.has(key),
        ),
      )
    : undefined;
  return {
    ok: false,
    error: {
      code: error.code,
      field: error.field,
      message: error.message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    },
  };
}

function registerPerformanceSessionPlanHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  recordDiagnostic,
  loadPlaylistsList = loadPlaylists,
  listLibraryTracks = listTracks,
  createStore = ({ directory }) =>
    createPerformanceSessionPlanStore({ directory }),
}) {
  function operationContext() {
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return {
      directory,
      tracksById: new Map(tracks.map((track) => [track.id, track])),
      store: createStore({ directory }),
    };
  }

  async function run(operation, work) {
    try {
      return { ok: true, plan: await work() };
    } catch (error) {
      if (isPerformanceSessionPlanValidationError(error)) {
        return publicValidationResult(error);
      }
      const presentation = OPERATION_ERRORS[operation];
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'performance-session-plan',
            operation,
            code: presentation.code,
          },
          publicError: {
            code: presentation.code,
            title: presentation.title,
            message: presentation.message,
            context: { retryable: true },
          },
        },
        () => {
          throw error;
        },
      );
    }
  }

  ipcMain.handle('performance-session-plan:get', async () =>
    run('get', () => {
      const { store, tracksById } = operationContext();
      return store.getProjected(tracksById);
    }),
  );

  ipcMain.handle(
    'performance-session-plan:replace-from-collection',
    async (_event, intent) =>
      run('replace', () => {
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
        return store.replaceFromCollection({
          collection: {
            id: collection.id,
            name: collection.name,
            kind: collection.kind,
            trackIds: collection.trackIds,
          },
          tracksById,
          replaceCurrent: intent?.replaceCurrent === true,
        });
      }),
  );

  ipcMain.handle(
    'performance-session-plan:append-library-track',
    async (_event, trackId) =>
      run('append', () => {
        const { store, tracksById } = operationContext();
        return store.appendLibraryTrack(trackId, tracksById);
      }),
  );

  ipcMain.handle(
    'performance-session-plan:append-manual-item',
    async (_event, intent) =>
      run('append', () => {
        const { store, tracksById } = operationContext();
        return store.appendManualItem(intent, tracksById);
      }),
  );

  ipcMain.handle(
    'performance-session-plan:append-placeholders',
    async (_event, text) =>
      run('append', () => {
        const { store, tracksById } = operationContext();
        return store.appendPlaceholders(text, tracksById);
      }),
  );

  ipcMain.handle(
    'performance-session-plan:update-item',
    async (_event, intent) =>
      run('update', () => {
        const { store, tracksById } = operationContext();
        return store.updateItem(intent, tracksById);
      }),
  );

  ipcMain.handle('performance-session-plan:move-item', async (_event, intent) =>
    run('move', () => {
      const { store, tracksById } = operationContext();
      return store.moveItem(intent, tracksById);
    }),
  );

  ipcMain.handle(
    'performance-session-plan:duplicate-item',
    async (_event, itemId) =>
      run('duplicate', () => {
        const { store, tracksById } = operationContext();
        return store.duplicateItem(itemId, tracksById);
      }),
  );

  ipcMain.handle(
    'performance-session-plan:remove-item',
    async (_event, itemId) =>
      run('remove', () => {
        const { store, tracksById } = operationContext();
        return store.removeItem(itemId, tracksById);
      }),
  );

  ipcMain.handle(
    'performance-session-plan:set-review-cursor',
    async (_event, itemId) =>
      run('cursor', () => {
        const { store, tracksById } = operationContext();
        return store.setReviewCursor(itemId, tracksById);
      }),
  );

  ipcMain.handle('performance-session-plan:clear', async () =>
    run('clear', () => {
      const { store, tracksById } = operationContext();
      return store.clear(tracksById);
    }),
  );
}

module.exports = { registerPerformanceSessionPlanHandlers };
