import contractValues from '../../shared/outputContractValues.json';
import runtimeValues from '../../shared/outputRuntimeValues.json';

const {
  maxLyricLines: MAX_OUTPUT_LYRIC_LINES,
  maxQueueItems: MAX_OUTPUT_QUEUE_ITEMS,
  stateVersion: OUTPUT_STATE_VERSION,
} = contractValues;

function milliseconds(value, fallback = 0) {
  return Number.isFinite(value)
    ? Math.max(0, Math.round(value * 1000))
    : fallback;
}

function signedMilliseconds(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) : 0;
}

function publicTrack(track) {
  if (!track || typeof track.id !== 'string' || track.id.length === 0) {
    return null;
  }
  return {
    id: track.id,
    title:
      typeof track.title === 'string' && track.title.length > 0
        ? track.title
        : track.id,
    ...(typeof track.artist === 'string' && track.artist.length > 0
      ? { artist: track.artist }
      : {}),
  };
}

function playbackStatus(player) {
  if (!publicTrack(player?.track)) return 'idle';
  if (player?.error) return 'error';
  if (
    ['buffering', 'playing', 'seeking', 'paused', 'ended'].includes(
      player?.playbackPhase,
    )
  ) {
    return player.playbackPhase;
  }
  return player?.isPlaying ? 'playing' : 'paused';
}

function displayDelayMs(output = {}) {
  const value = output.displayDelayMs;
  return Number.isSafeInteger(value) &&
    value >= runtimeValues.minDisplayDelayMs &&
    value <= runtimeValues.maxDisplayDelayMs
    ? value
    : runtimeValues.defaultDisplayDelayMs;
}

function queueItem(state, track) {
  const projected = publicTrack(track);
  return projected ? { state, track: projected } : null;
}

function projectQueue(queue = {}) {
  const history = Array.isArray(queue.historyEntries)
    ? queue.historyEntries.map((entry) => queueItem('played', entry?.track))
    : [];
  const current = queueItem('current', queue.currentTrack);
  const upcoming = Array.isArray(queue.upcomingTracks)
    ? queue.upcomingTracks.map((track) => queueItem('queued', track))
    : [];
  const currentAndUpcoming = [current, ...upcoming]
    .filter(Boolean)
    .slice(0, MAX_OUTPUT_QUEUE_ITEMS);
  const historySlots = MAX_OUTPUT_QUEUE_ITEMS - currentAndUpcoming.length;
  const items = [
    ...(historySlots > 0 ? history.filter(Boolean).slice(-historySlots) : []),
    ...currentAndUpcoming,
  ];

  return {
    sourceName: typeof queue.sourceName === 'string' ? queue.sourceName : '',
    items,
  };
}

function publicLyricsSource(source) {
  if (!source || typeof source !== 'object') return null;
  const result = {};
  for (const key of ['kind', 'language', 'label']) {
    if (typeof source[key] === 'string' && source[key].length > 0) {
      result[key] = source[key];
    }
  }
  return result;
}

function projectLyricLine(line) {
  if (!line || typeof line.text !== 'string') return null;
  const hasStart = Number.isFinite(line.start) && line.start >= 0;
  const hasEnd = Number.isFinite(line.end) && line.end >= 0;
  return {
    text: line.text,
    startMs: hasStart ? milliseconds(line.start) : null,
    endMs: hasEnd ? milliseconds(line.end) : null,
  };
}

function emptyLyrics() {
  return {
    trackId: null,
    source: null,
    synced: false,
    offsetMs: 0,
    activeLineIndex: -1,
    lines: [],
  };
}

function projectLyrics(lyrics = {}, playingTrackId) {
  if (!playingTrackId || lyrics.trackId !== playingTrackId) {
    return emptyLyrics();
  }

  const lines = (Array.isArray(lyrics.lines) ? lyrics.lines : [])
    .map(projectLyricLine)
    .filter(Boolean)
    .slice(0, MAX_OUTPUT_LYRIC_LINES);
  const requestedIndex = Number.isSafeInteger(lyrics.activeLineIndex)
    ? lyrics.activeLineIndex
    : -1;
  const activeLineIndex =
    requestedIndex >= 0 && requestedIndex < lines.length ? requestedIndex : -1;

  return {
    trackId: playingTrackId,
    source: publicLyricsSource(lyrics.source),
    synced: lines.some((line) => line.startMs !== null),
    offsetMs: signedMilliseconds(lyrics.offsetSeconds),
    activeLineIndex,
    lines,
  };
}

export function projectOutputSnapshot(input = {}, options = {}) {
  const player = input.player ?? {};
  const track = publicTrack(player.track);
  const durationMs =
    Number.isFinite(player.duration) && player.duration > 0
      ? milliseconds(player.duration)
      : null;
  const rate =
    Number.isFinite(player.tempoRate) && player.tempoRate > 0
      ? player.tempoRate
      : 1;

  return {
    version: OUTPUT_STATE_VERSION,
    revision:
      Number.isSafeInteger(options.revision) && options.revision >= 0
        ? options.revision
        : 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    displayDelayMs: displayDelayMs(input.output),
    playback: {
      status: playbackStatus(player),
      positionMs: milliseconds(player.currentTime),
      durationMs,
      rate,
      track,
    },
    queue: projectQueue(input.queue),
    lyrics: projectLyrics(input.lyrics, track?.id ?? null),
  };
}
