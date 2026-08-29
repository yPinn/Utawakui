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
const { loadStoredNeteaseArtifactSummary } = require('../../lib/netease');

const MAX_LRCLIB_QUERY_CHARS = 256;
const LYRICS_PROVIDER_IDS = new Set(['lrclib', 'netease']);
const LYRICS_SEARCH_PROVIDER_IDS = new Set(['all', ...LYRICS_PROVIDER_IDS]);

function normalizeLyricsProviderId(value, options = {}) {
  const allowed = options.allowAll
    ? LYRICS_SEARCH_PROVIDER_IDS
    : LYRICS_PROVIDER_IDS;
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error('lyrics provider is invalid');
  }
  return value;
}

function storedArtifactSummary(trackDir, providerId, provider) {
  if (providerId === 'lrclib') {
    return loadStoredLrclibArtifactSummary(trackDir, provider);
  }
  return loadStoredNeteaseArtifactSummary(trackDir, provider);
}

function mapCandidateStorageState(trackDir, providerId, result) {
  const manifestSources = loadTrackLyricsManifest(trackDir).sources;
  const providerSources = new Map(
    manifestSources
      .filter((source) => LYRICS_PROVIDER_IDS.has(source.provider?.name))
      .map((source) => [
        `${source.provider.name}:${source.provider.recordId}`,
        source,
      ]),
  );
  const existingFilenames = new Set(
    getTrackLyricsState(trackDir).sources.map((source) => source.filename),
  );
  const candidates = (result.candidates || []).map((candidate) => {
    const candidateProviderId =
      providerId === 'all'
        ? normalizeLyricsProviderId(candidate.providerId)
        : providerId;
    const candidateKey = `${candidateProviderId}:${candidate.id}`;
    const existingSource = providerSources.get(candidateKey);
    const stored = existingSource
      ? storedArtifactSummary(
          trackDir,
          candidateProviderId,
          existingSource.provider,
        )
      : null;
    const legacySaved =
      candidateProviderId === 'lrclib' &&
      existingFilenames.has(`lrclib-${candidate.id}.lrc`);
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
      providerId: candidateProviderId,
      candidateKey,
      saveState,
      alreadySaved: saveState === 'current',
      ...(stored ? { retrievedAt: stored.retrievedAt } : {}),
    };
  });
  const candidatesByKey = new Map(
    candidates.map((candidate) => [candidate.candidateKey, candidate]),
  );
  const recordingGroups = result.recordingGroups
    ? {
        best: (result.recordingGroups.best || []).map((group) => ({
          ...group,
          candidates: (group.candidates || [])
            .map((candidate) => candidatesByKey.get(candidate.candidateKey))
            .filter(Boolean),
        })),
        related: (result.recordingGroups.related || []).map((group) => ({
          ...group,
          candidates: (group.candidates || [])
            .map((candidate) => candidatesByKey.get(candidate.candidateKey))
            .filter(Boolean),
        })),
      }
    : undefined;
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
    ...(recordingGroups ? { recordingGroups } : {}),
  };
}

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
      return mapCandidateStorageState(trackDir, 'lrclib', result);
    },
  );

  ipcMain.handle(
    'lyrics:search-provider-candidates',
    async (event, providerIdValue, trackId, options) => {
      const providerId = normalizeLyricsProviderId(providerIdValue, {
        allowAll: true,
      });
      const dir = resolveDownloadDir(getConfig());
      const track = listTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);
      const normalizedOptions = normalizeLrclibSearchOptions(options);
      const result = await lyricsAcquisitionService.searchProviderCandidates(
        providerId,
        track,
        normalizedOptions,
      );
      return mapCandidateStorageState(trackDir, providerId, result);
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

  ipcMain.handle(
    'lyrics:save-provider-candidate',
    async (
      event,
      providerIdValue,
      trackId,
      candidateId,
      expectedFingerprint,
      options,
    ) => {
      const providerId = normalizeLyricsProviderId(providerIdValue);
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);
      const normalizedOptions = normalizeLrclibSearchOptions(options);
      if (normalizedOptions.mode) {
        throw new Error('provider save options contain an unsupported mode');
      }
      const result = await lyricsAcquisitionService.saveProviderCandidate(
        providerId,
        {
          track,
          trackDir,
          candidateId,
          expectedFingerprint,
          ...(normalizedOptions.query
            ? { query: normalizedOptions.query }
            : {}),
        },
      );
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
  normalizeLyricsProviderId,
  normalizeLrclibSearchOptions,
  registerLyricsAcquisitionHandlers,
};
