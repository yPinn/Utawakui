import { markRaw } from 'vue';
import {
  describeDownloadFailure,
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import { normalizeAppError } from '../../utils/appErrors.js';
import { t } from '../../utils/i18n.js';

function createPreviewTrack(entry) {
  return {
    ...entry,
    selected: true,
    status: entry.status || 'pending',
    errorCode: entry.errorCode || null,
  };
}

function candidateId(candidate) {
  return candidate?.playbackVideoId || candidate?.id || null;
}

function stripAlbumTitlePrefix(title) {
  return typeof title === 'string'
    ? title.replace(/^album\s*-\s*/i, '')
    : title;
}

function createSingleTrackFromResolution(resolution, selectedCandidate = null) {
  const candidate =
    selectedCandidate || resolution.recommendedCandidate || resolution.source;
  if (!candidate) return null;
  return createPreviewTrack({
    id: candidateId(candidate),
    title: candidate.title || resolution.canonical?.title || resolution.input,
    artist: candidate.artist || resolution.canonical?.artist,
    duration: candidate.duration || resolution.canonical?.duration,
    thumbnailUrl: candidate.thumbnailUrl || resolution.source?.thumbnailUrl,
    alreadyDownloaded: candidate.alreadyDownloaded,
    downloadInput: candidateId(candidate),
    sourceVideoId: resolution.sourceVideoId,
    playbackKind: candidate.playbackKind,
    recordingFit: candidate.recordingFit,
    trackIdentity: resolution.trackIdentity || candidate.trackIdentity,
    importResolution: resolution,
  });
}

function deferredPlatformLabel(platform) {
  if (platform === 'spotify') return 'Spotify';
  if (platform === 'apple-music') return 'Apple Music';
  return t('import.resolution.unknownPlatform');
}

export function useImportSourceResolution({
  state,
  getDraftRevision = () => 0,
  clearPreview,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
}) {
  function selectImportCandidate(candidateIdValue) {
    if (!state.singleResolution || state.isImporting) return;
    const candidate = state.singleResolution.candidates?.find(
      (entry) => candidateId(entry) === candidateIdValue,
    );
    if (!candidate) return;
    state.selectedCandidateId = candidateIdValue;
    state.singleTrack = createSingleTrackFromResolution(
      state.singleResolution,
      candidate,
    );
  }

  async function resolveSource() {
    const input = state.input.trim();
    let revision = getDraftRevision();
    const isCurrent = () => revision === getDraftRevision();
    if (!input) {
      clearPreview();
      setStatus();
      return;
    }
    if (state.isResolving) return;
    state.isResolving = true;

    if (!(await ensureProviderFlow())) {
      state.isResolving = false;
      return;
    }
    if (!isCurrent()) {
      state.isResolving = false;
      return;
    }

    clearPreview();
    revision = getDraftRevision();
    setStatus();

    try {
      if (typeof window.Utawakui.resolveImportInput === 'function') {
        const result = await window.Utawakui.resolveImportInput(input);
        if (!isCurrent()) return;
        if (result?.kind === 'deferred') {
          setStatus(
            t('import.resolution.deferred', {
              platform: deferredPlatformLabel(result.platform),
            }),
            'pending',
          );
          return;
        }
        if (result?.kind === 'unsupported') {
          const message =
            result.reason === 'query-too-long'
              ? t('import.resolution.queryTooLong')
              : t('import.resolution.unsupported');
          setStatus(message, 'error');
          return;
        }
        if (result?.kind === 'playlist') {
          const entries = result.entries || [];
          if (entries.length === 0) {
            setStatus(t('import.resolution.emptyPlaylist'), 'empty');
            return;
          }
          state.sourceKind = 'playlist';
          state.collectionKind =
            result.collectionKind === 'album' ? 'album' : 'playlist';
          state.playlistTitle =
            (state.collectionKind === 'album'
              ? stripAlbumTitlePrefix(result.title)
              : result.title) || t('import.resolution.untitledPlaylist');
          state.collectionSource = result.source
            ? markRaw(result.source)
            : null;
          state.collectionThumbnailUrl = result.thumbnailUrl || null;
          state.collectionReleaseType = result.releaseType || 'unknown';
          state.collectionReleaseDate = result.releaseDate || null;
          state.playlistTracks = entries.map(createPreviewTrack);
          setStatus();
          return;
        }
        if (result?.kind === 'single' && result.resolution) {
          const resolution = result.resolution;
          const selectedCandidate =
            resolution.recommendedCandidate || resolution.source || null;
          const candidateCount = resolution.candidates?.length || 0;
          if (!selectedCandidate && candidateCount === 0) {
            setStatus(t('import.resolution.noSource'), 'empty');
            return;
          }
          state.sourceKind = 'single';
          state.singleResolution = resolution;
          state.selectedCandidateId = candidateId(selectedCandidate);
          state.singleTrack = createSingleTrackFromResolution(resolution);
          setStatus();
          return;
        }
        throw new Error('invalid import resolution');
      }

      const playlistResult = await window.Utawakui.fetchYoutubePlaylist(input);
      if (!isCurrent()) return;
      const entries = playlistResult?.entries;
      if (entries && entries.length > 0) {
        state.sourceKind = 'playlist';
        state.collectionKind =
          playlistResult.kind === 'album' ? 'album' : 'playlist';
        state.playlistTitle =
          (state.collectionKind === 'album'
            ? stripAlbumTitlePrefix(playlistResult.title)
            : playlistResult.title) || t('import.resolution.untitledPlaylist');
        state.collectionSource = playlistResult.source
          ? markRaw(playlistResult.source)
          : null;
        state.collectionThumbnailUrl = playlistResult.thumbnailUrl || null;
        state.collectionReleaseType = playlistResult.releaseType || 'unknown';
        state.collectionReleaseDate = playlistResult.releaseDate || null;
        state.playlistTracks = entries.map(createPreviewTrack);
        setStatus();
        return;
      }

      if (typeof window.Utawakui.resolveImportSource === 'function') {
        const resolution = await window.Utawakui.resolveImportSource(input);
        if (!isCurrent()) return;
        state.sourceKind = 'single';
        state.singleResolution = resolution;
        state.selectedCandidateId = candidateId(
          resolution.recommendedCandidate || resolution.source,
        );
        state.singleTrack = createSingleTrackFromResolution(resolution);
        setStatus();
        return;
      }

      if (typeof window.Utawakui.fetchVideoMetadata !== 'function') {
        state.sourceKind = 'single';
        state.singleTrack = createPreviewTrack({
          id: input,
          title: input,
          alreadyDownloaded: false,
        });
        setStatus(t('import.resolution.restartPreview'), 'pending');
        return;
      }

      const metadata = await window.Utawakui.fetchVideoMetadata(input);
      if (!isCurrent()) return;
      state.sourceKind = 'single';
      state.singleTrack = createPreviewTrack(metadata);
      setStatus();
    } catch (error) {
      if (!isCurrent()) return;
      clearPreview();
      if (handleProviderSetupError(error)) return;
      const appError = normalizeAppError(error, {
        source: 'import',
        operation: 'resolve-source',
      });
      if (appError.code === 'PROVIDER_SEARCH_FAILED') {
        const reason = appError.context.reason || 'unknown';
        const label =
          reason === 'unknown'
            ? t('import.resolution.providerUnresponsive')
            : downloadFailureLabel(reason);
        reportImportError(error, 'resolve-source', appError.message);
        setStatus(
          t('import.resolution.searchFailed', { reason: label }),
          'error',
        );
        state.failureHint = downloadFailureHint(reason);
        return;
      }
      const failure = describeDownloadFailure(error);
      reportImportError(
        error,
        'resolve-source',
        t('import.resolution.checkFailed'),
      );
      setStatus(
        t('import.resolution.notFound', { reason: failure.label }),
        'error',
      );
      state.failureHint = failure.hint;
    } finally {
      state.isResolving = false;
    }
  }

  async function openYoutubeMusicSearch() {
    const query = state.input.trim();
    if (!query) {
      setStatus();
      return false;
    }
    if (state.isOpeningDiscovery) return false;
    state.isOpeningDiscovery = true;

    try {
      const enabled = await ensureProviderFlow({
        operation: 'open-youtube-music-search',
        message: t('import.resolution.providerRequiredYtMusic'),
      });
      if (!enabled) return false;

      await window.Utawakui.openYoutubeMusicSearch(query);
      setStatus(t('import.resolution.ytMusicOpened'), 'success');
      return true;
    } catch (error) {
      reportImportError(
        error,
        'open-youtube-music-search',
        t('import.resolution.ytMusicOpenFailed'),
      );
      setStatus(t('import.resolution.ytMusicOpenFailedStatus'), 'error');
      return false;
    } finally {
      state.isOpeningDiscovery = false;
    }
  }

  return {
    openYoutubeMusicSearch,
    resolveSource,
    selectImportCandidate,
  };
}
