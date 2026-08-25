import { markRaw } from 'vue';
import { describeDownloadFailure } from '../../utils/downloadFailureDisplay.js';

function createPreviewTrack(entry) {
  return {
    ...entry,
    selected: true,
    status: 'pending',
    errorCode: null,
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
    trackIdentity: resolution.trackIdentity || candidate.trackIdentity,
    importResolution: resolution,
  });
}

export function useImportSourceResolution({
  state,
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
    if (!input) {
      setStatus('請貼上 YouTube 或 YouTube Music 連結', 'error');
      return;
    }
    if (state.isResolving) return;
    state.isResolving = true;

    if (!(await ensureProviderFlow())) {
      state.isResolving = false;
      return;
    }

    clearPreview();
    setStatus('檢查連結中...', 'pending');

    try {
      const playlistResult = await window.Utawakui.fetchYoutubePlaylist(input);
      const entries = playlistResult?.entries;
      if (entries && entries.length > 0) {
        state.sourceKind = 'playlist';
        state.collectionKind =
          playlistResult.kind === 'album' ? 'album' : 'playlist';
        state.playlistTitle =
          (state.collectionKind === 'album'
            ? stripAlbumTitlePrefix(playlistResult.title)
            : playlistResult.title) || '未命名播放清單';
        state.collectionSource = playlistResult.source
          ? markRaw(playlistResult.source)
          : null;
        state.collectionThumbnailUrl = playlistResult.thumbnailUrl || null;
        state.playlistTracks = entries.map(createPreviewTrack);
        setStatus(`已找到 ${entries.length} 首，請確認要下載的曲目`, 'success');
        return;
      }

      if (typeof window.Utawakui.resolveImportSource === 'function') {
        const resolution = await window.Utawakui.resolveImportSource(input);
        state.sourceKind = 'single';
        state.singleResolution = resolution;
        state.selectedCandidateId = candidateId(
          resolution.recommendedCandidate || resolution.source,
        );
        state.singleTrack = createSingleTrackFromResolution(resolution);
        setStatus('已找到歌曲，確認後開始下載', 'success');
        return;
      }

      if (typeof window.Utawakui.fetchVideoMetadata !== 'function') {
        state.sourceKind = 'single';
        state.singleTrack = createPreviewTrack({
          id: input,
          title: input,
          alreadyDownloaded: false,
        });
        setStatus(
          '需要重新啟動應用程式才能使用新版單曲預覽；目前仍可下載。',
          'pending',
        );
        return;
      }

      const metadata = await window.Utawakui.fetchVideoMetadata(input);
      state.sourceKind = 'single';
      state.singleTrack = createPreviewTrack(metadata);
      setStatus('已找到歌曲，確認後開始下載', 'success');
    } catch (error) {
      clearPreview();
      if (handleProviderSetupError(error)) return;
      const failure = describeDownloadFailure(error);
      reportImportError(error, 'resolve-source', '目前無法檢查這個來源。');
      setStatus(`找不到來源：${failure.label}`, 'error');
      state.failureHint = failure.hint;
    } finally {
      state.isResolving = false;
    }
  }

  return {
    resolveSource,
    selectImportCandidate,
  };
}
