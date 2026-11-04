import { formatLyricsSourceLabel } from './lyricsSourcePresentation.js';
import { t } from './i18n.js';

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
  // Main preserves performer credit order; the card represents its first artist,
  // while the track and credit links retain the complete collaboration.
  const indexedArtist =
    Array.isArray(artistIds) && artistIds.length > 0
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
      label: t('track.context.lyrics'),
      status: t('track.context.loading'),
      tone: 'info',
      description: t('track.context.loadingDetail'),
    };
  }
  if (state.error) {
    return {
      id: 'lyrics',
      label: t('track.context.lyrics'),
      status: t('track.context.unreadable'),
      tone: 'danger',
      description: t('track.context.unreadableDetail'),
    };
  }
  if (lyricsStatus === 'missing') {
    return {
      id: 'lyrics',
      label: t('track.context.lyrics'),
      status: t('track.context.missing'),
      tone: 'muted',
      description: t('track.context.missingDetail'),
    };
  }
  if (lyricsStatus !== 'available') {
    return {
      id: 'lyrics',
      label: t('track.context.lyrics'),
      status: t('track.context.notScanned'),
      tone: 'warning',
      description: t('track.context.notScannedDetail'),
    };
  }

  const document = state.document;
  const lines = Array.isArray(document?.lines) ? document.lines : [];
  if (lines.length === 0) {
    return {
      id: 'lyrics',
      label: t('track.context.lyrics'),
      status: t('track.context.available'),
      tone: 'success',
      description: t('track.context.availableDetail'),
    };
  }
  if (document.granularity === 'T0') {
    return {
      id: 'lyrics',
      label: t('track.context.lyrics'),
      status: t('track.context.plain'),
      tone: 'success',
      description: t('track.context.plainDetail'),
    };
  }
  if (document.granularity === 'T2') {
    const fullyTimed = lines.every(
      (line) => Array.isArray(line?.segments) && line.segments.length > 0,
    );
    return fullyTimed
      ? {
          id: 'lyrics',
          label: t('track.context.lyrics'),
          status: t('track.context.wordFull'),
          tone: 'success',
          description: t('track.context.wordFullDetail'),
        }
      : {
          id: 'lyrics',
          label: t('track.context.lyrics'),
          status: t('track.context.wordPartial'),
          tone: 'success',
          description: t('track.context.wordPartialDetail'),
        };
  }
  return {
    id: 'lyrics',
    label: t('track.context.lyrics'),
    status: t('track.context.line'),
    tone: 'success',
    description: t('track.context.lineDetail'),
  };
}

export function createTrackReadiness(track, lyricsState = {}) {
  if (!track) return [];
  const lyrics = lyricsCapability(track, lyricsState);
  const separation = track.hasSeparation
    ? {
        id: 'separation',
        label: t('track.context.separation'),
        status: t('track.context.separationReady'),
        tone: 'success',
        description: t('track.context.separationReadyDetail'),
      }
    : {
        id: 'separation',
        label: t('track.context.separation'),
        status: t('track.context.separationMissing'),
        tone: 'muted',
        description: t('track.context.separationMissingDetail'),
      };

  return [lyrics, separation];
}
