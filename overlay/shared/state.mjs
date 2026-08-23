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

function lyricsOffsetMs(snapshot) {
  return Number.isFinite(snapshot?.lyrics?.offsetMs)
    ? snapshot.lyrics.offsetMs
    : 0;
}

function lyricsPositionMs(snapshot, nowMs) {
  return playbackPositionMs(snapshot, nowMs) + lyricsOffsetMs(snapshot);
}

function nextFiniteLineStart(lines, lineIndex) {
  return lines
    .slice(lineIndex + 1)
    .find((line) => Number.isFinite(line?.startMs))?.startMs;
}

function effectiveLineEnd(snapshot, lines, lineIndex) {
  const line = lines[lineIndex];
  if (Number.isFinite(line?.endMs)) return line.endMs;
  const nextStartMs = nextFiniteLineStart(lines, lineIndex);
  if (Number.isFinite(nextStartMs)) return nextStartMs;
  return Number.isFinite(snapshot?.playback?.durationMs)
    ? snapshot.playback.durationMs + lyricsOffsetMs(snapshot)
    : null;
}

function boundedProgress(positionMs, startMs, endMs) {
  if (!Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.min(1, Math.max(0, (positionMs - startMs) / (endMs - startMs)));
}

function projectCurrentSegments(snapshot, lines, lineIndex, nowMs) {
  const line = lines[lineIndex];
  const segments = Array.isArray(line?.segments) ? line.segments : [];
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        typeof segment?.segmentId !== 'string' ||
        typeof segment?.text !== 'string' ||
        !Number.isFinite(segment?.startMs),
    ) ||
    segments.map((segment) => segment.text).join('') !== line.text
  ) {
    return null;
  }

  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const lineEndMs = effectiveLineEnd(snapshot, lines, lineIndex);
  const rate = playbackRate(snapshot);
  const isPlaying = snapshot?.playback?.status === 'playing';
  return segments.map((segment, index) => {
    const nextStartMs = segments[index + 1]?.startMs;
    const endMs = Number.isFinite(segment.endMs)
      ? segment.endMs
      : Number.isFinite(nextStartMs)
        ? nextStartMs
        : lineEndMs;
    const progress = boundedProgress(positionMs, segment.startMs, endMs);
    const state =
      positionMs < segment.startMs
        ? 'upcoming'
        : Number.isFinite(endMs) && positionMs >= endMs
          ? 'past'
          : 'active';
    return {
      segmentId: segment.segmentId,
      text: segment.text,
      state,
      progress: state === 'past' ? 1 : state === 'upcoming' ? 0 : progress,
      remainingMs:
        state === 'active' && isPlaying && Number.isFinite(endMs)
          ? Math.max(0, (endMs - positionMs) / rate)
          : null,
    };
  });
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
    const lyricPositionMs = lyricsPositionMs(snapshot, nowMs);
    return lines.findIndex((line, index) => {
      if (!Number.isFinite(line?.startMs)) return false;
      const nextStartMs = nextFiniteLineStart(lines, index);
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
  const lyricPositionMs = lyricsPositionMs(snapshot, nowMs);
  const boundaries = (Array.isArray(lyrics.lines) ? lyrics.lines : [])
    .flatMap((line) => [
      line?.startMs,
      line?.endMs,
      ...(Array.isArray(line?.segments)
        ? line.segments.flatMap((segment) => [segment?.startMs, segment?.endMs])
        : []),
    ])
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

  const currentSegments = projectCurrentSegments(
    snapshot,
    lines,
    activeIndex,
    options.nowMs ?? Date.now(),
  );
  return {
    revision: revision(snapshot),
    visible: Boolean(currentText || nextText),
    currentText,
    nextText,
    language: text(lyrics?.source?.language),
    ...(currentSegments ? { currentSegments } : {}),
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
    trackId: text(track?.id),
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
