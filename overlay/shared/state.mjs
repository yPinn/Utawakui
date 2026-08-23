function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CANONICAL_SECTION_ROLES = new Set([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'instrumental',
  'outro',
  'unknown',
]);
const MIN_PRESENTATION_CONFIDENCE = 0.5;

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

function confidence(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function musicStructureDocument(snapshot) {
  const document = snapshot?.musicStructure;
  const trackId = snapshot?.playback?.track?.id;
  if (
    !document ||
    !trackId ||
    document.trackId !== trackId ||
    !['M1', 'M2'].includes(document.level) ||
    typeof document.documentId !== 'string'
  ) {
    return null;
  }
  return document;
}

export function selectMusicStructureFrame(snapshot, options = {}) {
  const document = musicStructureDocument(snapshot);
  if (!document) return null;

  const positionMs = playbackPositionMs(snapshot, options.nowMs ?? Date.now());
  const sections = Array.isArray(document.sections) ? document.sections : [];
  const section = sections.find(
    (candidate) =>
      Number.isFinite(candidate?.startMs) &&
      Number.isFinite(candidate?.endMs) &&
      candidate.startMs <= positionMs &&
      positionMs < candidate.endMs &&
      CANONICAL_SECTION_ROLES.has(candidate.role),
  );
  const activeSection = section
    ? {
        sectionId: section.sectionId,
        role: section.role,
        confidence: confidence(section.confidence),
      }
    : null;

  const beats = Array.isArray(document.beats) ? document.beats : [];
  let currentBeatIndex = -1;
  let currentBeatTimeMs = -Infinity;
  for (let index = 0; index < beats.length; index += 1) {
    const timeMs = beats[index]?.timeMs;
    if (
      Number.isFinite(timeMs) &&
      timeMs <= positionMs &&
      timeMs >= currentBeatTimeMs
    ) {
      currentBeatIndex = index;
      currentBeatTimeMs = timeMs;
    }
  }
  const beat = currentBeatIndex >= 0 ? beats[currentBeatIndex] : null;
  const currentBeat = beat
    ? {
        beatIndex: currentBeatIndex,
        timeMs: beat.timeMs,
        elapsedMs: Math.max(0, positionMs - beat.timeMs),
        positionInBar:
          Number.isSafeInteger(beat.positionInBar) && beat.positionInBar > 0
            ? beat.positionInBar
            : null,
        downbeat: beat.downbeat === true,
        confidence: confidence(beat.confidence),
      }
    : null;

  return {
    documentId: document.documentId,
    level: document.level,
    activeSection,
    currentBeat,
  };
}

function isConfident(value) {
  return confidence(value) !== null && value >= MIN_PRESENTATION_CONFIDENCE;
}

export function nextPresentationBoundaryDelayMs(snapshot, options = {}) {
  if (snapshot?.playback?.status !== 'playing') return null;

  const nowMs = options.nowMs ?? Date.now();
  const rate = playbackRate(snapshot);
  const delays = [];
  const lyricsDelay = nextLyricsBoundaryDelayMs(snapshot, { nowMs });
  if (lyricsDelay !== null) delays.push(lyricsDelay);

  const document = musicStructureDocument(snapshot);
  if (document) {
    const positionMs = playbackPositionMs(snapshot, nowMs);
    let nextMusicBoundaryMs = Infinity;
    const considerBoundary = (boundary) => {
      if (
        Number.isFinite(boundary) &&
        boundary > positionMs &&
        boundary < nextMusicBoundaryMs
      ) {
        nextMusicBoundaryMs = boundary;
      }
    };
    for (const beat of Array.isArray(document.beats) ? document.beats : []) {
      if (isConfident(beat?.confidence)) considerBoundary(beat.timeMs);
    }
    for (const section of Array.isArray(document.sections)
      ? document.sections
      : []) {
      if (
        isConfident(section?.confidence) &&
        CANONICAL_SECTION_ROLES.has(section?.role) &&
        section.role !== 'unknown'
      ) {
        considerBoundary(section.startMs);
        considerBoundary(section.endMs);
      }
    }
    if (Number.isFinite(nextMusicBoundaryMs)) {
      delays.push(
        Math.max(1, Math.ceil((nextMusicBoundaryMs - positionMs) / rate)),
      );
    }
  }

  return delays.length > 0 ? Math.min(...delays) : null;
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
  const musicStructure = selectMusicStructureFrame(snapshot, options);
  return {
    revision: revision(snapshot),
    visible: Boolean(currentText || nextText),
    currentText,
    nextText,
    language: text(lyrics?.source?.language),
    ...(currentSegments ? { currentSegments } : {}),
    ...(musicStructure ? { musicStructure } : {}),
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

export function selectArtworkFrame(snapshot, options = {}) {
  const frame = selectNowPlayingFrame(snapshot);
  const positionMs = playbackPositionMs(snapshot, options.nowMs ?? Date.now());
  const durationMs = Number.isFinite(snapshot?.playback?.durationMs)
    ? Math.max(0, snapshot.playback.durationMs)
    : 0;
  const boundedPositionMs = Math.max(0, positionMs);
  const progress =
    durationMs > 0
      ? Math.min(1, Math.max(0, boundedPositionMs / durationMs))
      : 0;

  return {
    ...frame,
    playbackStatus: ['playing', 'paused'].includes(snapshot?.playback?.status)
      ? snapshot.playback.status
      : 'idle',
    positionMs: boundedPositionMs,
    durationMs,
    progress,
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
