'use strict';
const { t } = require('../lib/i18n');
const crypto = require('node:crypto');
const { loadPlaylists, savePerformancePlaylist } = require('../lib/playlists');
const { atomicWriteText } = require('../lib/atomicWrite');
const {
  sessionPerformedItems,
} = require('../../shared/sessionPerformedItems.mjs');
const {
  alignSessionTimepoints,
  buildSessionMarkerCsv,
  groupSessionTimepoints,
} = require('../../shared/sessionExportTimepoints.mjs');

function registerPerformanceSessionHistoryHandlers({
  ipcMain,
  run,
  operationContext,
  sessionHistoryService,
  dialog,
  getMainWindow = () => null,
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
  ipcMain.handle(
    'performance-session-plan:save-marker-csv',
    async (_event, intent) => {
      const invalid = () =>
        Object.assign(new Error(t('obs.export.csvStale')), {
          code: 'SESSION_MARKER_EXPORT_INVALID',
          publicValidation: true,
        });
      const snapshot = await run('exportMarkers', () => {
        if (
          !intent ||
          !['stream', 'record'].includes(intent.source) ||
          !Number.isSafeInteger(intent.offsetMs) ||
          !Number.isSafeInteger(intent.segmentIndex) ||
          intent.segmentIndex < 0 ||
          typeof intent.sessionId !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,128}$/u.test(intent.sessionId) ||
          typeof intent.digest !== 'string' ||
          !/^[0-9a-f]{64}$/u.test(intent.digest)
        )
          throw invalid();
        let session;
        let entries;
        if (intent.latest === true) {
          session = sessionHistoryService?.getLatestSession();
          entries = session?.entries;
        } else {
          const { store, tracksById } = operationContext({
            reuseRecentScan: true,
          });
          session = store.getSession(intent.sessionId, tracksById);
          entries = session?.timeline;
        }
        if (session?.id !== intent.sessionId) throw invalid();
        const { segments } = groupSessionTimepoints(entries, intent.source);
        const { rows } = alignSessionTimepoints(
          segments[intent.segmentIndex],
          intent.offsetMs,
        );
        const csv = buildSessionMarkerCsv(rows, intent.source);
        if (
          !csv ||
          Buffer.byteLength(csv) > 2_000_000 ||
          crypto.createHash('sha256').update(csv).digest('hex') !==
            intent.digest
        )
          throw invalid();
        const name = (session.name || t('obs.export.latest'))
          .replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ')
          .trim()
          .slice(0, 100);
        const fileName = `${name || 'Utawakui'} - ${t(`obs.export.${intent.source}`)} - ${intent.segmentIndex + 1}.csv`;
        return { csv, fileName };
      });
      if (!snapshot.ok) return snapshot;
      try {
        const owner = getMainWindow();
        const options = {
          title: t('obs.export.saveCsv'),
          defaultPath: snapshot.plan.fileName,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        };
        const result = owner
          ? await dialog.showSaveDialog(owner, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath)
          return { ok: true, plan: { saved: false } };
        atomicWriteText(result.filePath, snapshot.plan.csv);
        return { ok: true, plan: { saved: true } };
      } catch (error) {
        return run('exportMarkers', () => {
          throw error;
        });
      }
    },
  );
  ipcMain.handle(
    'performance-session-plan:create-archive-playlist',
    (_event, intent) =>
      run('export', () => {
        const { store, tracksById, directory } = operationContext();
        const session = store.getSession(intent?.sessionId, tracksById);
        if (!session.endedAt)
          throw Object.assign(new Error(t('session.main.archiveInvalid')), {
            code: 'SESSION_ARCHIVE_INVALID',
            publicValidation: true,
          });
        const existing = loadPlaylists(directory).find(
          (playlist) => playlist.performanceSessionId === session.id,
        );
        if (existing) return { playlistId: existing.id };
        const trackIds = sessionPerformedItems(session)
          .filter(
            (item) =>
              item.mode === 'library-track' && tracksById.has(item.trackId),
          )
          .map((item) => item.trackId);
        if (!trackIds.length) return { playlistId: null };
        const exportKey = crypto
          .createHash('sha256')
          .update(JSON.stringify(['archive-playlist', session.id]))
          .digest('hex');
        const { playlistId } = savePerformancePlaylist(directory, {
          name: session.name,
          trackIds,
          exportKey,
          sessionId: session.id,
        });
        return { playlistId };
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
        throw Object.assign(new Error(t('session.main.performanceInvalid')), {
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
        throw Object.assign(
          new Error(t('session.main.performanceTrackMissing')),
          {
            code: 'SESSION_PERFORMANCE_INVALID',
            publicValidation: true,
          },
        );
      if (epoch !== intent.epoch && epoch && retired.size >= 32)
        throw Object.assign(new Error(t('session.main.restartToRecord')), {
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
