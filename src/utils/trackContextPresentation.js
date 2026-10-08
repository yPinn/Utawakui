import { formatLyricsSourceLabel } from './lyrics.js';

function normalizedArtist(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase();
}

export function createTrackLyricsPreview({
  currentTrackId,
  selectedTrackId,
  activeLineIndex,
  lines,
  source,
}) {
  if (
    !currentTrackId ||
    currentTrackId !== selectedTrackId ||
    !Array.isArray(lines)
  ) {
    return null;
  }

  const readableLines = lines
    .map((line, index) => ({
      id: line?.lineId ?? `line-${index}`,
      originalIndex: index,
      text: String(line?.text ?? '').trim(),
    }))
    .filter((line) => line.text);
  if (readableLines.length === 0) return null;

  const requestedIndex = Number.isInteger(activeLineIndex)
    ? activeLineIndex
    : -1;
  const sourceLabel = source?.kind ? formatLyricsSourceLabel(source) : '';
  const requestedReadableIndex = readableLines.findIndex(
    (line) => line.originalIndex >= requestedIndex,
  );
  const startIndex =
    requestedIndex < 0
      ? 0
      : requestedReadableIndex >= 0
        ? requestedReadableIndex
        : readableLines.length - 1;
  const previewLines = readableLines
    .slice(startIndex, startIndex + 3)
    .map((line, index) => ({
      id: line.id,
      text: line.text,
      active: index === 0,
    }));

  return {
    lines: previewLines,
    sourceLabel,
  };
}

export function createLocalArtistSummary(
  currentTrack,
  libraryTracks,
  artistIndex = null,
) {
  const name = String(currentTrack?.artist ?? '').trim();
  const identity = normalizedArtist(name);
  if (!identity) return null;

  const artistIds = artistIndex?.trackArtistIds?.[currentTrack?.id];
  const indexedArtist =
    Array.isArray(artistIds) && artistIds.length === 1
      ? artistIndex?.artists?.find((artist) => artist.id === artistIds[0])
      : null;
  const indexedTrackIds = indexedArtist
    ? new Set(indexedArtist.trackIds)
    : null;
  const tracks = (Array.isArray(libraryTracks) ? libraryTracks : []).filter(
    (track) =>
      indexedTrackIds?.has(track?.id) ??
      normalizedArtist(track?.artist) === identity,
  );
  if (tracks.length === 0) return null;

  const albums = new Set(
    tracks.map((track) => String(track?.album ?? '').trim()).filter(Boolean),
  );
  return {
    ...(indexedArtist
      ? {
          artistId: indexedArtist.id,
          photoUrl: indexedArtist.photoUrl ?? '',
        }
      : {}),
    name: indexedArtist?.name ?? name,
    trackCount: tracks.length,
    albumCount: albums.size,
    tracks,
  };
}

function lyricsCapability(track, state) {
  const lyricsStatus = track.lyrics?.status;
  if (state.isLoading) {
    return {
      id: 'lyrics',
      label: '歌詞',
      status: '讀取中',
      tone: 'info',
      description: '正在讀取歌詞素材。',
    };
  }
  if (state.error) {
    return {
      id: 'lyrics',
      label: '歌詞',
      status: '暫時無法讀取',
      tone: 'danger',
      description: '歌詞素材暫時無法讀取。',
    };
  }
  if (lyricsStatus === 'missing') {
    return {
      id: 'lyrics',
      label: '歌詞',
      status: '尚未取得',
      tone: 'muted',
      description: '目前沒有可用歌詞素材。',
    };
  }
  if (lyricsStatus !== 'available') {
    return {
      id: 'lyrics',
      label: '歌詞',
      status: '尚未掃描',
      tone: 'warning',
      description: '尚未掃描本機歌詞素材。',
    };
  }

  const document = state.document;
  const lines = Array.isArray(document?.lines) ? document.lines : [];
  if (lines.length === 0) {
    return {
      id: 'lyrics',
      label: '歌詞',
      status: '歌詞可用',
      tone: 'success',
      description: '歌詞素材已準備，可在歌詞工作區查看。',
    };
  }
  if (document.granularity === 'T0') {
    return {
      id: 'lyrics',
      label: '歌詞',
      status: '純文字',
      tone: 'success',
      description: '已有歌詞文字，可在歌詞工作區查看。',
    };
  }
  if (document.granularity === 'T2') {
    const fullyTimed = lines.every(
      (line) => Array.isArray(line?.segments) && line.segments.length > 0,
    );
    return fullyTimed
      ? {
          id: 'lyrics',
          label: '歌詞',
          status: '完整逐字同步',
          tone: 'success',
          description: '所有歌詞行都有逐字時間，可逐字跟隨播放。',
        }
      : {
          id: 'lyrics',
          label: '歌詞',
          status: '部分逐字同步',
          tone: 'success',
          description: '部分歌詞行有逐字時間，其餘仍以逐行同步。',
        };
  }
  return {
    id: 'lyrics',
    label: '歌詞',
    status: '逐行同步',
    tone: 'success',
    description: '歌詞包含逐行時間，可跟隨播放進度。',
  };
}

export function createTrackReadiness(track, lyricsState = {}) {
  if (!track) return [];
  const lyrics = lyricsCapability(track, lyricsState);
  const separation = track.hasSeparation
    ? {
        id: 'separation',
        label: '人聲分離',
        status: '素材已準備',
        tone: 'success',
        description: '伴奏與導唱聲道素材已準備。',
      }
    : {
        id: 'separation',
        label: '人聲分離',
        status: '尚未準備',
        tone: 'muted',
        description: '尚未產生伴奏與導唱聲道素材。',
      };

  return [lyrics, separation];
}
