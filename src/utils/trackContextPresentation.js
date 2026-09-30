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
    .slice(startIndex, startIndex + 2)
    .map((line, index) => ({
      id: line.id,
      text: line.text,
      active: index === 0,
    }));

  return {
    lines: previewLines,
    sourceLabel: source?.kind ? formatLyricsSourceLabel(source) : '',
  };
}

export function createLocalArtistSummary(currentTrack, libraryTracks) {
  const name = String(currentTrack?.artist ?? '').trim();
  const identity = normalizedArtist(name);
  if (!identity) return null;

  const tracks = (Array.isArray(libraryTracks) ? libraryTracks : []).filter(
    (track) => normalizedArtist(track?.artist) === identity,
  );
  if (tracks.length === 0) return null;

  const albums = new Set(
    tracks.map((track) => String(track?.album ?? '').trim()).filter(Boolean),
  );
  return {
    name,
    trackCount: tracks.length,
    albumCount: albums.size,
    tracks,
  };
}

export function createTrackReadiness(track) {
  if (!track) return [];
  const lyricsStatus = track.lyrics?.status;
  const lyrics =
    lyricsStatus === 'available'
      ? { id: 'lyrics', label: '歌詞可用', tone: 'success' }
      : lyricsStatus === 'missing'
        ? { id: 'lyrics', label: '尚無歌詞', tone: 'muted' }
        : { id: 'lyrics', label: '歌詞未掃描', tone: 'warning' };
  const separation = track.hasSeparation
    ? { id: 'separation', label: '分離素材可用', tone: 'success' }
    : { id: 'separation', label: '尚無分離素材', tone: 'muted' };

  return [lyrics, separation];
}
