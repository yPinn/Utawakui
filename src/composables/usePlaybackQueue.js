import { computed, reactive, readonly } from 'vue';

const state = reactive({
  tracks: [],
  queuedTracks: [],
  historyEntries: [],
  currentTrackId: null,
  currentTrack: null,
  currentIsSource: false,
  lastSourceTrackId: null,
  sourceName: '',
  // Stable id of the playlist/album the current queue was built from — a
  // string when known, null otherwise. Distinct from sourceName (a display
  // label): PlaylistSidebar.vue compares this against a playlist's own id
  // to decide whether its hover play/pause button shows pause.
  sourceId: null,
  isShuffle: false,
  orderIds: [],
});

function normalizeTrack(track) {
  if (!track || typeof track.id !== 'string' || track.id.length === 0) {
    return null;
  }
  return track;
}

function normalizeTracks(tracks) {
  if (!Array.isArray(tracks)) return [];

  const seen = new Set();
  return tracks.filter((track) => {
    const normalized = normalizeTrack(track);
    if (!normalized || seen.has(normalized.id)) return false;
    seen.add(normalized.id);
    return true;
  });
}

function orderedIdsForTracks(tracks) {
  return tracks.map((track) => track.id);
}

function isSourceTrack(trackId) {
  return state.tracks.some((track) => track.id === trackId);
}

function shuffledIdsForTracks(tracks, currentTrackId) {
  const ids = orderedIdsForTracks(tracks);
  const currentId = ids.includes(currentTrackId) ? currentTrackId : ids[0];
  const rest = ids.filter((id) => id !== currentId);

  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [rest[index], rest[swapIndex]] = [rest[swapIndex], rest[index]];
  }

  return currentId ? [currentId, ...rest] : rest;
}

function currentSourceOrderIds() {
  return state.orderIds.length > 0
    ? state.orderIds
    : orderedIdsForTracks(state.tracks);
}

export function buildQueueTrackIndex({
  queuedTracks = [],
  tracks = [],
  historyEntries = [],
  currentTrack = null,
} = {}) {
  const index = new Map();

  if (currentTrack?.id) index.set(currentTrack.id, currentTrack);

  // trackById historically preferred the first matching history entry. Build
  // this layer in reverse so the first entry is the final write for that id.
  for (
    let entryIndex = historyEntries.length - 1;
    entryIndex >= 0;
    entryIndex -= 1
  ) {
    const track = historyEntries[entryIndex]?.track;
    if (track?.id) index.set(track.id, track);
  }
  for (const track of tracks) {
    if (track?.id) index.set(track.id, track);
  }
  for (const track of queuedTracks) {
    if (track?.id) index.set(track.id, track);
  }

  return index;
}

const trackIndex = computed(() =>
  buildQueueTrackIndex({
    queuedTracks: state.queuedTracks,
    tracks: state.tracks,
    historyEntries: state.historyEntries,
    currentTrack: state.currentTrack,
  }),
);

function trackById(trackId) {
  return trackIndex.value.get(trackId) ?? null;
}

function sourceCursorId() {
  if (state.currentIsSource && isSourceTrack(state.currentTrackId)) {
    return state.currentTrackId;
  }
  return state.lastSourceTrackId;
}

function sourceCursorIndex() {
  const cursorId = sourceCursorId();
  if (!cursorId) return -1;
  return currentSourceOrderIds().indexOf(cursorId);
}

function sourcePreviousId(trackId) {
  const orderIds = currentSourceOrderIds();
  const index = orderIds.indexOf(trackId);
  return index > 0 ? orderIds[index - 1] : null;
}

function setActiveTrack(track, options = {}) {
  state.currentTrack = track;
  state.currentTrackId = track?.id ?? null;
  state.currentIsSource = Boolean(track && options.source);
  if (track && options.source) {
    state.lastSourceTrackId = track.id;
  }
}

const currentTrack = computed(() => trackById(state.currentTrackId));

const sourceUpcomingTracks = computed(() => {
  const orderIds = currentSourceOrderIds();
  const index = sourceCursorIndex();
  const upcomingIds = index === -1 ? orderIds : orderIds.slice(index + 1);
  return upcomingIds
    .map((trackId) => trackIndex.value.get(trackId))
    .filter(Boolean);
});

const queuedTracks = computed(() => state.queuedTracks);

const upcomingTracks = computed(() => [
  ...queuedTracks.value,
  ...sourceUpcomingTracks.value,
]);

const canGoPrevious = computed(() => state.historyEntries.length > 0);
const canGoNext = computed(() => upcomingTracks.value.length > 0);

function setQueue(tracks, currentTrackId = null, options = {}) {
  const normalized = normalizeTracks(tracks);
  const ids = orderedIdsForTracks(normalized);
  state.tracks = normalized;
  state.queuedTracks = [];
  state.historyEntries = [];
  state.sourceName =
    typeof options.sourceName === 'string' ? options.sourceName : '';
  state.sourceId =
    typeof options.sourceId === 'string' ? options.sourceId : null;
  state.orderIds = state.isShuffle
    ? shuffledIdsForTracks(normalized, currentTrackId)
    : ids;

  const nextCurrentId = ids.includes(currentTrackId)
    ? currentTrackId
    : (ids[0] ?? null);
  setActiveTrack(trackById(nextCurrentId), { source: Boolean(nextCurrentId) });
  state.lastSourceTrackId = nextCurrentId;
}

function setCurrentTrack(trackId, options = {}) {
  const explicitSource = options.source;
  const track =
    explicitSource === true
      ? (state.tracks.find((sourceTrack) => sourceTrack.id === trackId) ?? null)
      : trackById(trackId);
  if (!track) return;
  const wasQueued = state.queuedTracks.some(
    (queuedTrack) => queuedTrack.id === track.id,
  );
  if (explicitSource !== true) {
    state.queuedTracks = state.queuedTracks.filter(
      (queuedTrack) => queuedTrack.id !== track.id,
    );
  }
  setActiveTrack(track, {
    source: explicitSource === true || (!wasQueued && isSourceTrack(track.id)),
  });
}

function enqueueTrack(track) {
  const normalized = normalizeTrack(track);
  if (!normalized) return null;
  if (
    state.currentTrackId === normalized.id ||
    state.queuedTracks.some((queuedTrack) => queuedTrack.id === normalized.id)
  ) {
    return null;
  }

  state.queuedTracks = [...state.queuedTracks, normalized];
  return normalized;
}

function clearQueuedTracks() {
  state.queuedTracks = [];
}

function removeQueuedTrack(trackId) {
  const next = state.queuedTracks.filter((track) => track.id !== trackId);
  if (next.length === state.queuedTracks.length) return false;
  state.queuedTracks = next;
  return true;
}

function interruptWithTrack(track) {
  const normalized = normalizeTrack(track);
  if (!normalized) return null;
  const current = currentTrack.value;
  if (current?.id === normalized.id) {
    setActiveTrack(normalized, { source: state.currentIsSource });
    return normalized;
  }
  if (current) {
    state.historyEntries = [
      ...state.historyEntries,
      { track: current, source: state.currentIsSource },
    ];
  }
  state.queuedTracks = state.queuedTracks.filter(
    (queuedTrack) => queuedTrack.id !== normalized.id,
  );
  setActiveTrack(normalized, { source: false });
  return normalized;
}

function serializeResumeState() {
  return {
    sourceTrackIds: state.tracks.map((track) => track.id),
    queuedTrackIds: state.queuedTracks.map((track) => track.id),
    historyEntries: state.historyEntries.map((entry) => ({
      trackId: entry.track.id,
      source: entry.source,
    })),
    currentIsSource: state.currentIsSource,
    lastSourceTrackId: state.lastSourceTrackId,
    sourceName: state.sourceName,
    sourceId: state.sourceId,
    isShuffle: state.isShuffle,
    orderIds: [...state.orderIds],
  };
}

function restoreResumeState(snapshot, currentTrackId, libraryTracks) {
  const library = new Map(
    normalizeTracks(libraryTracks).map((track) => [track.id, track]),
  );
  const resolveIds = (ids) =>
    Array.isArray(ids)
      ? ids.map((trackId) => library.get(trackId)).filter(Boolean)
      : [];
  const sourceTracks = resolveIds(snapshot?.sourceTrackIds);
  const sourceIds = new Set(sourceTracks.map((track) => track.id));
  const orderIds = Array.isArray(snapshot?.orderIds)
    ? snapshot.orderIds.filter((trackId) => sourceIds.has(trackId))
    : [];
  for (const track of sourceTracks) {
    if (!orderIds.includes(track.id)) orderIds.push(track.id);
  }

  state.tracks = sourceTracks;
  state.queuedTracks = resolveIds(snapshot?.queuedTrackIds);
  state.historyEntries = Array.isArray(snapshot?.historyEntries)
    ? snapshot.historyEntries
        .map((entry) => ({
          track: library.get(entry?.trackId),
          source: Boolean(entry?.source),
        }))
        .filter((entry) => Boolean(entry.track))
    : [];
  state.sourceName =
    typeof snapshot?.sourceName === 'string' ? snapshot.sourceName : '';
  state.sourceId =
    typeof snapshot?.sourceId === 'string' ? snapshot.sourceId : null;
  state.isShuffle = Boolean(snapshot?.isShuffle);
  state.orderIds = orderIds;
  const restoredCurrent = library.get(currentTrackId) ?? null;
  setActiveTrack(restoredCurrent, {
    source: Boolean(snapshot?.currentIsSource && sourceIds.has(currentTrackId)),
  });
  state.lastSourceTrackId = sourceIds.has(snapshot?.lastSourceTrackId)
    ? snapshot.lastSourceTrackId
    : state.currentIsSource
      ? currentTrackId
      : null;
  return restoredCurrent;
}

function reorderQueuedTrack(draggedId, targetId, position = 'before') {
  if (!draggedId || !targetId || draggedId === targetId) return false;

  const withoutDragged = state.queuedTracks.filter(
    (track) => track.id !== draggedId,
  );
  if (withoutDragged.length === state.queuedTracks.length) return false;

  const targetIndex = withoutDragged.findIndex(
    (track) => track.id === targetId,
  );
  if (targetIndex === -1) return false;

  const draggedTrack = state.queuedTracks.find(
    (track) => track.id === draggedId,
  );
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, draggedTrack);
  if (
    next.map((track) => track.id).join('\0') ===
    state.queuedTracks.map((track) => track.id).join('\0')
  ) {
    return false;
  }

  state.queuedTracks = next;
  return true;
}

function reorderSourceTrack(draggedId, targetId, position = 'before') {
  if (!draggedId || !targetId || draggedId === targetId) return false;
  if (!isSourceTrack(draggedId) || !isSourceTrack(targetId)) return false;
  if (draggedId === state.currentTrackId || targetId === state.currentTrackId) {
    return false;
  }

  const orderIds = currentSourceOrderIds();
  const cursorIndex = sourceCursorIndex();
  const movableIds =
    cursorIndex === -1 ? orderIds : orderIds.slice(cursorIndex + 1);
  if (!movableIds.includes(draggedId) || !movableIds.includes(targetId)) {
    return false;
  }

  const withoutDragged = orderIds.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) return false;

  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, draggedId);
  if (next.join('\0') === orderIds.join('\0')) return false;

  state.orderIds = next;
  return true;
}

function restartSourceQueue() {
  const firstId = currentSourceOrderIds()[0];
  const firstTrack = firstId ? trackById(firstId) : null;
  if (!firstTrack) return null;
  state.historyEntries = [];
  setActiveTrack(firstTrack, { source: true });
  return firstTrack;
}

function nextTrack() {
  const queuedNext = state.queuedTracks[0];
  const sourceNext = sourceUpcomingTracks.value[0];
  const next = queuedNext ?? sourceNext;
  if (!next) return null;

  const current = currentTrack.value;
  if (current) {
    state.historyEntries = [
      ...state.historyEntries,
      { track: current, source: state.currentIsSource },
    ];
  }

  if (queuedNext) {
    state.queuedTracks = state.queuedTracks.slice(1);
    setActiveTrack(queuedNext, { source: false });
    return queuedNext;
  }

  setActiveTrack(sourceNext, { source: true });
  return sourceNext;
}

function previousTrack() {
  const previousEntry = state.historyEntries[state.historyEntries.length - 1];
  if (!previousEntry) return null;

  const current = currentTrack.value;
  if (current && !state.currentIsSource) {
    state.queuedTracks = [current, ...state.queuedTracks];
  } else if (current && state.currentIsSource) {
    state.lastSourceTrackId = sourcePreviousId(current.id);
  }

  state.historyEntries = state.historyEntries.slice(0, -1);
  setActiveTrack(previousEntry.track, { source: previousEntry.source });
  return previousEntry.track;
}

function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  state.orderIds = state.isShuffle
    ? shuffledIdsForTracks(state.tracks, sourceCursorId())
    : orderedIdsForTracks(state.tracks);
}

function removeTrack(trackId) {
  if (!trackId) return false;

  const hadTrack =
    state.currentTrackId === trackId ||
    state.tracks.some((track) => track.id === trackId) ||
    state.queuedTracks.some((track) => track.id === trackId) ||
    state.historyEntries.some((entry) => entry.track.id === trackId) ||
    state.orderIds.includes(trackId);
  if (!hadTrack) return false;

  const previousSourceId = sourcePreviousId(trackId);
  state.tracks = state.tracks.filter((track) => track.id !== trackId);
  state.queuedTracks = state.queuedTracks.filter(
    (track) => track.id !== trackId,
  );
  state.historyEntries = state.historyEntries.filter(
    (entry) => entry.track.id !== trackId,
  );
  state.orderIds = state.orderIds.filter((id) => id !== trackId);
  if (state.currentTrackId === trackId) {
    setActiveTrack(null);
  }
  if (state.lastSourceTrackId === trackId) {
    state.lastSourceTrackId = previousSourceId;
  }
  return true;
}

export function usePlaybackQueue() {
  return {
    state: readonly(state),
    currentTrack,
    queuedTracks,
    sourceUpcomingTracks,
    upcomingTracks,
    canGoPrevious,
    canGoNext,
    setQueue,
    setCurrentTrack,
    enqueueTrack,
    interruptWithTrack,
    clearQueuedTracks,
    removeQueuedTrack,
    reorderQueuedTrack,
    reorderSourceTrack,
    restartSourceQueue,
    nextTrack,
    previousTrack,
    toggleShuffle,
    removeTrack,
    serializeResumeState,
    restoreResumeState,
  };
}
