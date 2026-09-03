import { markRaw } from 'vue';
import {
  describeDownloadFailure,
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import { normalizeAppError } from '../../utils/appErrors.js';

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
  return '未知平台';
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
    setStatus('搜尋可用音源中...', 'pending');

    try {
      if (typeof window.Utawakui.resolveImportInput === 'function') {
        const result = await window.Utawakui.resolveImportInput(input);
        if (result?.kind === 'deferred') {
          setStatus(
            `${deferredPlatformLabel(result.platform)} 連結轉換尚未開放`,
            'pending',
          );
          return;
        }
        if (result?.kind === 'unsupported') {
          const message =
            result.reason === 'query-too-long'
              ? '搜尋文字過長，請縮短歌曲名稱或歌手名稱'
              : '目前只支援歌曲名稱、YouTube 與 YouTube Music 連結';
          setStatus(message, 'error');
          return;
        }
        if (result?.kind === 'playlist') {
          const entries = result.entries || [];
          if (entries.length === 0) {
            setStatus('這個播放清單沒有可匯入的曲目', 'error');
            return;
          }
          state.sourceKind = 'playlist';
          state.collectionKind =
            result.collectionKind === 'album' ? 'album' : 'playlist';
          state.playlistTitle =
            (state.collectionKind === 'album'
              ? stripAlbumTitlePrefix(result.title)
              : result.title) || '未命名播放清單';
          state.collectionSource = result.source
            ? markRaw(result.source)
            : null;
          state.collectionThumbnailUrl = result.thumbnailUrl || null;
          state.playlistTracks = entries.map(createPreviewTrack);
          setStatus(
            `已找到 ${entries.length} 首，請確認要下載的曲目`,
            'success',
          );
          return;
        }
        if (result?.kind === 'single' && result.resolution) {
          const resolution = result.resolution;
          const selectedCandidate =
            resolution.recommendedCandidate || resolution.source || null;
          const candidateCount = resolution.candidates?.length || 0;
          if (!selectedCandidate && candidateCount === 0) {
            setStatus(
              '沒有搜尋到可用的 YT Music／YouTube 結果，可到 YT Music 手動尋找',
              'error',
            );
            return;
          }
          state.sourceKind = 'single';
          state.singleResolution = resolution;
          state.selectedCandidateId = candidateId(selectedCandidate);
          state.singleTrack = createSingleTrackFromResolution(resolution);
          if (!selectedCandidate) {
            setStatus(
              `找到 ${candidateCount} 個候選，請選擇下載版本`,
              'pending',
            );
          } else {
            setStatus('已找到歌曲，確認後開始下載', 'success');
          }
          return;
        }
        throw new Error('invalid import resolution');
      }

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
      const appError = normalizeAppError(error, {
        source: 'import',
        operation: 'resolve-source',
      });
      if (appError.code === 'PROVIDER_SEARCH_FAILED') {
        const reason = appError.context.reason || 'unknown';
        const label =
          reason === 'unknown'
            ? '外部來源暫時無法回應'
            : downloadFailureLabel(reason);
        reportImportError(error, 'resolve-source', appError.message);
        setStatus(`搜尋 YT Music／YouTube 失敗：${label}`, 'error');
        state.failureHint = downloadFailureHint(reason);
        return;
      }
      const failure = describeDownloadFailure(error);
      reportImportError(error, 'resolve-source', '目前無法檢查這個來源。');
      setStatus(`找不到來源：${failure.label}`, 'error');
      state.failureHint = failure.hint;
    } finally {
      state.isResolving = false;
    }
  }

  async function openYoutubeMusicSearch() {
    const query = state.input.trim();
    if (!query) {
      setStatus('請先輸入要在 YT Music 尋找的歌曲或歌手', 'error');
      return false;
    }
    if (state.isOpeningDiscovery) return false;
    state.isOpeningDiscovery = true;

    try {
      const enabled = await ensureProviderFlow({
        operation: 'open-youtube-music-search',
        message: '請先到設定啟用外部來源，才能前往 YT Music 尋找來源。',
      });
      if (!enabled) return false;

      await window.Utawakui.openYoutubeMusicSearch(query);
      setStatus(
        '已在系統瀏覽器開啟 YT Music，找到來源後請複製連結貼回此處。',
        'success',
      );
      return true;
    } catch (error) {
      reportImportError(
        error,
        'open-youtube-music-search',
        '目前無法開啟 YT Music。',
      );
      setStatus('目前無法開啟 YT Music，請稍後再試。', 'error');
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
