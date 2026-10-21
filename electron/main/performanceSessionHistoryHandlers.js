'use strict';
const crypto = require('node:crypto');
const { savePerformancePlaylist } = require('../lib/playlists');

function registerPerformanceSessionHistoryHandlers({
  ipcMain,
  run,
  operationContext,
  sessionHistoryService,
}) {
  ipcMain.handle(
    'performance-session-plan:append-from-archive',
    (_event, intent) =>
      run('append', () => {
        const { store, tracksById } = operationContext();
        return store.appendFromArchive(intent?.sessionId, tracksById);
      }),
  );
  ipcMain.handle('performance-session-plan:archive', (_event, intent) =>
    run('archive', async () => {
      await sessionHistoryService?.flush();
      const { store, tracksById } = operationContext();
      return store.archiveSession(intent, tracksById);
    }),
  );
  for (const [channel, method] of [
    ['get-session', 'getSession'],
    ['preview-playlist', 'previewPlaylist'],
  ]) {
    ipcMain.handle(`performance-session-plan:${channel}`, (_event, intent) =>
      run('history', () => {
        const { store, tracksById } = operationContext();
        return store[method](
          channel === 'get-session' ? intent?.sessionId : intent,
          tracksById,
        );
      }),
    );
  }
  ipcMain.handle('performance-session-plan:save-playlist', (_event, intent) =>
    run('export', () => {
      const { store, tracksById, directory } = operationContext();
      const preview = store.verifyPlaylistPreview(intent, tracksById);
      const name =
        typeof intent?.name === 'string' ? intent.name.trim() : intent?.name;
      const exportKey = crypto
        .createHash('sha256')
        .update(JSON.stringify([preview.token, name]))
        .digest('hex');
      return savePerformancePlaylist(directory, {
        name,
        trackIds: preview.trackIds,
        exportKey,
      });
    }),
  );

  // Each trusted renderer epoch has monotonically increasing audio-request
  // revisions. Resume / seek reuse the same revision; retired epochs cannot
  // replay old observations after a renderer reload.
  let epoch = null,
    revision = -1;
  const retired = new Set();
  ipcMain.handle('session-history:confirmed-playing', (_event, intent) =>
    run('history', async () => {
      if (
        !intent ||
        typeof intent.epoch !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          intent.epoch,
        ) ||
        !Number.isSafeInteger(intent.playbackRevision) ||
        intent.playbackRevision < 1 ||
        typeof intent.trackId !== 'string' ||
        intent.trackId.length > 256
      )
        throw Object.assign(new Error('演出識別無效。'), {
          code: 'SESSION_PERFORMANCE_INVALID',
          publicValidation: true,
        });
      if (
        retired.has(intent.epoch) ||
        (epoch === intent.epoch && intent.playbackRevision <= revision)
      )
        return { recorded: false };
      const { tracksById } = operationContext();
      const track = tracksById.get(intent.trackId);
      if (!track)
        throw Object.assign(new Error('找不到這次演出的本機曲目。'), {
          code: 'SESSION_PERFORMANCE_INVALID',
          publicValidation: true,
        });
      if (epoch !== intent.epoch && epoch && retired.size >= 32)
        throw Object.assign(new Error('請重新啟動應用程式後繼續記錄。'), {
          code: 'SESSION_PERFORMANCE_INVALID',
          publicValidation: true,
        });
      if (epoch !== intent.epoch) {
        if (epoch) retired.add(epoch);
        epoch = intent.epoch;
        revision = -1;
      }
      await sessionHistoryService?.observePerformance({
        identity: `audio:${epoch}:${intent.playbackRevision}`,
        track: { id: track.id, title: track.title, artist: track.artist ?? '' },
      });
      revision = intent.playbackRevision;
      return { recorded: true };
    }),
  );
}
module.exports = { registerPerformanceSessionHistoryHandlers };
