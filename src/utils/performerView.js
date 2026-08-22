import {
  activeLyricIndex,
  playbackPositionMs,
} from '../../overlay/shared/state.mjs';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nextLineIndex(lines, activeIndex, lyricPositionMs) {
  const startIndex = activeIndex >= 0 ? activeIndex + 1 : 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!text(lines[index]?.text)) continue;
    if (
      activeIndex >= 0 ||
      !Number.isFinite(lines[index]?.startMs) ||
      lines[index].startMs > lyricPositionMs
    ) {
      return index;
    }
  }
  return -1;
}

function keyLabel(adjustments = {}) {
  const semitones = Number.isFinite(adjustments.transposeSemitones)
    ? adjustments.transposeSemitones
    : 0;
  const cents = Number.isFinite(adjustments.pitchCents)
    ? adjustments.pitchCents
    : 0;
  if (semitones === 0 && cents === 0) return '原調';
  const parts = [];
  if (semitones !== 0)
    parts.push(`Key ${semitones > 0 ? '+' : ''}${semitones}`);
  if (cents !== 0) parts.push(`${cents > 0 ? '+' : ''}${cents}¢`);
  return parts.join(' · ');
}

function tempoLabel(adjustments = {}) {
  const rate =
    Number.isFinite(adjustments.tempoRate) && adjustments.tempoRate > 0
      ? adjustments.tempoRate
      : 1;
  return `${Math.round(rate * 100)}%`;
}

export function selectPerformerFrame(snapshot, options = {}) {
  const state = snapshot?.state ?? {};
  const lyrics = state.lyrics ?? {};
  const lines = Array.isArray(lyrics.lines) ? lyrics.lines : [];
  const nowMs = options.nowMs ?? Date.now();
  const activeIndex = activeLyricIndex(state, lines, nowMs);
  const lyricPositionMs =
    playbackPositionMs(state, nowMs) +
    (Number.isFinite(lyrics.offsetMs) ? lyrics.offsetMs : 0);
  const upcomingIndex = nextLineIndex(lines, activeIndex, lyricPositionMs);
  const readingLines = Array.isArray(snapshot?.readings?.lines)
    ? snapshot.readings.lines
    : [];
  const nextTrack = (
    Array.isArray(state.queue?.items) ? state.queue.items : []
  ).find((item) => item?.state === 'queued')?.track;
  const track = state.playback?.track ?? null;

  let mode = 'live';
  if (!track) mode = 'idle';
  else if (lines.length === 0 || lyrics.trackId !== track.id)
    mode = 'no-lyrics';
  else if (lyrics.synced !== true) mode = 'unsynced';
  else if (activeIndex < 0) mode = 'waiting';

  return {
    revision: Number.isSafeInteger(state.revision) ? state.revision : 0,
    mode,
    playbackStatus: text(state.playback?.status),
    track: track
      ? { title: text(track.title), artist: text(track.artist) }
      : null,
    currentLine: activeIndex >= 0 ? (lines[activeIndex] ?? null) : null,
    currentReading:
      activeIndex >= 0 ? (readingLines[activeIndex] ?? null) : null,
    nextLine: upcomingIndex >= 0 ? (lines[upcomingIndex] ?? null) : null,
    nextReading:
      upcomingIndex >= 0 ? (readingLines[upcomingIndex] ?? null) : null,
    readingExpected: ['ja', 'ko'].some((language) =>
      text(lyrics.source?.language).startsWith(language),
    ),
    nextTrack: nextTrack
      ? { title: text(nextTrack.title), artist: text(nextTrack.artist) }
      : null,
    keyLabel: keyLabel(snapshot?.adjustments),
    tempoLabel: tempoLabel(snapshot?.adjustments),
  };
}
