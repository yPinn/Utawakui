'use strict';

const {
  backfillLyricsSourceLabels,
  findTrackRecord,
  getTrackLyricsState,
  loadTrackLyricsManifest,
  listTracks,
  resolveTrackDir,
} = require('../../lib/library');
const { probeMusixmatchLyrics } = require('../../lib/musixmatch');
const { loadStoredLrclibArtifactSummary } = require('../../lib/lrclib');

const MAX_LRCLIB_QUERY_CHARS = 256;

function containsControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function normalizeLrclibSearchOptions(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('lrclib search options are invalid');
  }
  if (Object.keys(value).some((key) => !['query', 'mode'].includes(key))) {
    throw new Error('lrclib search options contain an unsupported field');
  }
  if (value.mode !== undefined && value.mode !== 'broaden') {
    throw new Error('lrclib search mode is invalid');
  }

  let query;
  if (value.query !== undefined) {
    if (
      !value.query ||
      typeof value.query !== 'object' ||
      Array.isArray(value.query) ||
      Object.keys(value.query).some((key) => !['title', 'artist'].includes(key))
    ) {
      throw new Error('lrclib search query is invalid');
    }
    query = {};
    for (const field of ['title', 'artist']) {
      const fieldValue = value.query[field];
      if (fieldValue === undefined) continue;
      if (
        typeof fieldValue !== 'string' ||
        fieldValue.length > MAX_LRCLIB_QUERY_CHARS ||
        containsControlCharacter(fieldValue)
      ) {
        throw new Error(`lrclib search query ${field} is invalid`);
      }
      query[field] = fieldValue;
    }
  }

  return {
    ...(query ? { query } : {}),
    ...(value.mode ? { mode: value.mode } : {}),
  };
}

function registerLyricsAcquisitionHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
  lyricsAcquisitionService,
}) {
  ipcMain.handle('lyrics:probe-musixmatch', async (event, trackId) => {
    requireFeatureGate(featureIds.LYRICS_FLOW);

    const dir = resolveDownloadDir(getConfig());
    const track = listTracks(dir).find((candidate) => candidate.id === trackId);
    if (!track) {
      return {
        provider: 'musixmatch',
        status: 'unavailable',
        reason: 'unknown-track',
      };
    }
    return probeMusixmatchLyrics(track);
  });

  ipcMain.handle(
    'lyrics:search-candidates',
    async (event, trackId, options) => {
      const dir = resolveDownloadDir(getConfig());
      const track = listTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const result = await lyricsAcquisitionService.searchCandidates(
        track,
        normalizeLrclibSearchOptions(options),
      );
      const manifestSources = loadTrackLyricsManifest(trackDir).sources;
      const providerSources = new Map(
        manifestSources
          .filter((source) => source.provider?.name === 'lrclib')
          .map((source) => [source.provider.recordId, source]),
      );
      const existingFilenames = new Set(
        getTrackLyricsState(trackDir).sources.map((source) => source.filename),
      );
      const mapCandidate = (candidate) => {
        const existingSource = providerSources.get(candidate.id);
        const stored = existingSource
          ? loadStoredLrclibArtifactSummary(trackDir, existingSource.provider)
          : null;
        const legacySaved = existingFilenames.has(`lrclib-${candidate.id}.lrc`);
        const saveState = stored
          ? stored.recordFingerprint === candidate.previewFingerprint
            ? 'current'
            : 'update-available'
          : existingSource
            ? 'update-available'
            : legacySaved
              ? 'current'
              : 'unsaved';
        return {
          ...candidate,
          saveState,
          alreadySaved: saveState === 'current',
          ...(stored ? { retrievedAt: stored.retrievedAt } : {}),
        };
      };
      const candidates = result.candidates.map(mapCandidate);
      return {
        ...result,
        candidates,
        groups: result.groups
          ? {
              best: candidates.filter(
                (candidate) => candidate.matchBand !== 'related',
              ),
              related: candidates.filter(
                (candidate) => candidate.matchBand === 'related',
              ),
            }
          : null,
      };
    },
  );

  ipcMain.handle(
    'lyrics:save-candidate',
    async (event, trackId, candidateId, expectedFingerprint, options) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);
      const normalizedOptions = normalizeLrclibSearchOptions(options);
      if (normalizedOptions.mode) {
        throw new Error('lrclib save options contain an unsupported mode');
      }

      const result = await lyricsAcquisitionService.saveCandidate({
        track,
        trackDir,
        candidateId,
        expectedFingerprint,
        ...(normalizedOptions.query ? { query: normalizedOptions.query } : {}),
      });
      if (result.status !== 'saved') return result;

      notifyLibraryUpdated();
      return { ...result, sources: getTrackLyricsState(trackDir).sources };
    },
  );

  ipcMain.handle('lyrics:backfill-source-labels', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    const sources = await backfillLyricsSourceLabels(
      trackDir,
      async (candidateId) => {
        const fetched = await lyricsAcquisitionService.fetchRecord(candidateId);
        if (fetched.status !== 'ok') return null;
        return fetched.record?.albumName || fetched.record?.artistName || null;
      },
    );

    notifyLibraryUpdated();
    return { sources };
  });
}

module.exports = {
  normalizeLrclibSearchOptions,
  registerLyricsAcquisitionHandlers,
};
