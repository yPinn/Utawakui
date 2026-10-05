'use strict';

const { listTracks } = require('../lib/library');
const {
  createBgmStandbyPlanStore,
  isBgmStandbyPlanValidationError,
} = require('../lib/bgmStandbyPlan');
const { createPlanIpcRunner } = require('./ipcErrorBoundary');

const OPERATION_ERRORS = Object.freeze({
  get: {
    code: 'BGM_STANDBY_GET_FAILED',
    title: 'BGM 無法讀取',
    message: '目前無法讀取 BGM，請再試一次。',
  },
  mutate: {
    code: 'BGM_STANDBY_UPDATE_FAILED',
    title: 'BGM 無法更新',
    message: '目前無法更新 BGM，請再試一次。',
  },
});

function registerBgmStandbyPlanHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  recordDiagnostic,
  listLibraryTracks = listTracks,
  createStore = ({ directory }) => createBgmStandbyPlanStore({ directory }),
}) {
  function operationContext() {
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return {
      store: createStore({ directory }),
      tracksById: new Map(tracks.map((track) => [track.id, track])),
    };
  }

  const run = createPlanIpcRunner({
    source: 'bgm-standby',
    operationErrors: OPERATION_ERRORS,
    isValidationError: isBgmStandbyPlanValidationError,
    recordDiagnostic,
  });

  function registerMutation(channel, method) {
    ipcMain.handle(channel, async (_event, intent) =>
      run('mutate', () => {
        const { store, tracksById } = operationContext();
        return store[method](intent, tracksById);
      }),
    );
  }

  ipcMain.handle('bgm-standby:get', async () =>
    run('get', () => {
      const { store, tracksById } = operationContext();
      return store.getProjected(tracksById);
    }),
  );
  registerMutation('bgm-standby:set-track', 'setTrack');
  registerMutation('bgm-standby:update-settings', 'updateSettings');
  registerMutation('bgm-standby:update-position', 'updatePosition');
}

module.exports = { registerBgmStandbyPlanHandlers };
