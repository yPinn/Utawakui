function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function revision(snapshot) {
  return Number.isSafeInteger(snapshot?.revision) ? snapshot.revision : 0;
}

function hiddenLyricsFrame(snapshot) {
  return {
    revision: revision(snapshot),
    visible: false,
    currentText: '',
    nextText: '',
    language: '',
  };
}

function playbackRate(snapshot) {
  const rate = snapshot?.playback?.rate;
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

export function playbackPositionMs(snapshot, nowMs) {
  const playback = snapshot?.playback;
  const basePosition = Number.isFinite(playback?.positionMs)
    ? Math.max(0, playback.positionMs)
    : 0;
  if (playback?.status !== 'playing') return basePosition;

  const generatedAtMs = Date.parse(snapshot?.generatedAt ?? '');
  const displayDelayMs = Number.isSafeInteger(snapshot?.displayDelayMs)
    ? snapshot.displayDelayMs
    : 0;
  const elapsedMs = Number.isFinite(generatedAtMs)
    ? Math.max(0, nowMs - generatedAtMs - displayDelayMs)
    : 0;
  const projectedPosition = basePosition + elapsedMs * playbackRate(snapshot);
  const durationMs = playback?.durationMs;
  return Number.isFinite(durationMs)
    ? Math.min(projectedPosition, Math.max(0, durationMs))
    : projectedPosition;
}

export function activeLyricIndex(snapshot, lines, nowMs) {
  const lyrics = snapshot?.lyrics;
  if (lyrics?.synced === true) {
    const offsetMs = Number.isFinite(lyrics.offsetMs) ? lyrics.offsetMs : 0;
    const lyricPositionMs = playbackPositionMs(snapshot, nowMs) + offsetMs;
    return lines.findIndex((line, index) => {
      if (!Number.isFinite(line?.startMs)) return false;
      const nextStartMs = lines
        .slice(index + 1)
        .find((nextLine) => Number.isFinite(nextLine?.startMs))?.startMs;
      const endMs = Number.isFinite(line.endMs)
        ? line.endMs
        : (nextStartMs ?? Infinity);
      return lyricPositionMs >= line.startMs && lyricPositionMs < endMs;
    });
  }
  return Number.isSafeInteger(lyrics?.activeLineIndex)
    ? lyrics.activeLineIndex
    : -1;
}

export function nextLyricsBoundaryDelayMs(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  if (
    snapshot?.playback?.status !== 'playing' ||
    !trackId ||
    lyrics?.trackId !== trackId ||
    lyrics?.synced !== true
  ) {
    return null;
  }

  const nowMs = options.nowMs ?? Date.now();
  const offsetMs = Number.isFinite(lyrics.offsetMs) ? lyrics.offsetMs : 0;
  const lyricPositionMs = playbackPositionMs(snapshot, nowMs) + offsetMs;
  const boundaries = (Array.isArray(lyrics.lines) ? lyrics.lines : [])
    .flatMap((line) => [line?.startMs, line?.endMs])
    .filter(
      (boundary) => Number.isFinite(boundary) && boundary > lyricPositionMs,
    );
  if (boundaries.length === 0) return null;

  const nextBoundaryMs = Math.min(...boundaries);
  return Math.max(
    1,
    Math.ceil((nextBoundaryMs - lyricPositionMs) / playbackRate(snapshot)),
  );
}

export function selectLyricsFrame(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  const activeIndex = activeLyricIndex(
    snapshot,
    lines,
    options.nowMs ?? Date.now(),
  );
  if (
    !trackId ||
    lyrics?.trackId !== trackId ||
    !Number.isSafeInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= lines.length
  ) {
    return hiddenLyricsFrame(snapshot);
  }

  const currentText = text(lines[activeIndex]?.text);
  let nextText = '';
  for (let index = activeIndex + 1; index < lines.length; index += 1) {
    nextText = text(lines[index]?.text);
    if (nextText) break;
  }

  return {
    revision: revision(snapshot),
    visible: Boolean(currentText || nextText),
    currentText,
    nextText,
    language: text(lyrics?.source?.language),
  };
}

export function selectNowPlayingFrame(snapshot) {
  const track = snapshot?.playback?.track;
  const nextItem = (
    Array.isArray(snapshot?.queue?.items) ? snapshot.queue.items : []
  ).find((item) => item?.state === 'queued');
  const title = text(track?.title);
  return {
    revision: revision(snapshot),
    visible: Boolean(track && title),
    title,
    artist: text(track?.artist),
    nextTitle: text(nextItem?.track?.title),
  };
}

export function selectSetlistFrame(snapshot) {
  const items = Array.isArray(snapshot?.queue?.items)
    ? snapshot.queue.items
    : [];
  const currentIndex = items.findIndex((item) => item?.state === 'current');
  const start = Math.max(0, currentIndex > 1 ? currentIndex - 1 : 0);
  const rows = items.slice(start, start + 8).flatMap((item) => {
    const title = text(item?.track?.title);
    if (!title || !['played', 'current', 'queued'].includes(item?.state)) {
      return [];
    }
    return [
      {
        state: item.state,
        title,
        artist: text(item?.track?.artist),
      },
    ];
  });

  return {
    revision: revision(snapshot),
    visible: rows.length > 0,
    sourceName: text(snapshot?.queue?.sourceName),
    rows,
  };
}
