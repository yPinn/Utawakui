import { computed, watch } from 'vue';
import OUTPUT_CONTRACT_VALUES from '../../../shared/outputContractValues.json';
import { createLatestAsyncPublisher } from '../../utils/latestAsyncPublisher.js';
import {
  projectDynamicOutputState,
  projectLyricsOutputDocument,
  projectMusicStructureOutputDocument,
  projectQueueOutputDocument,
} from '../../utils/outputStreamProjection.js';
import { useLibrary } from '../useLibrary.js';
import { useLyrics } from '../useLyrics.js';
import { useMusicStructureSignals } from '../useMusicStructureSignals.js';
import { usePlaybackQueue } from '../usePlaybackQueue.js';
import { usePlayer } from '../usePlayer.js';

const PROJECTION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function defaultSourceEpoch() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `epoch-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function useOutputProjectionPublisher({
  getBootId,
  getDisplayDelayMs,
  isOutputEnabled,
  publishSnapshot,
  refreshStatus,
  reportPublishError,
  createSourceEpoch = defaultSourceEpoch,
  now = () => new Date().toISOString(),
}) {
  const { state: playerState } = usePlayer();
  const { state: queueState, upcomingTracks } = usePlaybackQueue();
  const { tracksById: libraryTracksById } = useLibrary();
  const {
    state: lyricsState,
    selectedTrack: lyricsTrack,
    selectedSource: lyricsSource,
    displayLyricsDocument,
    activeLineId,
    activeSegmentId,
  } = useLyrics();
  const {
    current: musicStructureSignals,
    loadForTrack: loadMusicStructureForTrack,
  } = useMusicStructureSignals();

  let sourceEpoch = createSourceEpoch();
  let nextStateRevision = 0;
  let nextLyricsRevision = 0;
  let nextMusicStructureRevision = 0;
  let nextQueueRevision = 0;
  let handshakeComplete = false;
  let sourcesReady = false;
  let lastContinuity = null;
  let lastLyricsDocument;
  let lastMusicStructureDocument;
  let lastQueueDocument;
  let lyricsReference = null;
  let musicStructureReference = null;
  let queueReference = null;
  let requestedContentRefreshGeneration = 0;
  let acceptedContentRefreshGeneration = 0;

  function queueInput() {
    return {
      historyEntries: queueState.historyEntries,
      currentTrack: queueState.currentTrack,
      upcomingTracks: upcomingTracks.value,
      sourceName: queueState.sourceName,
    };
  }

  const projectedLyricsDocument = computed(() => {
    const trackId = playerState.track?.id ?? null;
    if (!trackId || lyricsTrack.value?.id !== trackId) return null;
    return projectLyricsOutputDocument({
      trackId,
      source: lyricsSource.value,
      document: displayLyricsDocument.value,
    });
  });

  const projectedQueueDocument = computed(() =>
    projectQueueOutputDocument(queueInput()),
  );

  const projectedMusicStructureDocument = computed(() => {
    const trackId = playerState.track?.id ?? null;
    const current = musicStructureSignals.value;
    if (!trackId || current?.trackId !== trackId) return null;
    return projectMusicStructureOutputDocument(current);
  });

  const projectedDynamicState = computed(() =>
    projectDynamicOutputState(
      {
        player: playerState,
        output: { displayDelayMs: getDisplayDelayMs() },
        lyrics: {
          offsetSeconds: lyricsState.offsetSeconds,
          activeLineId: activeLineId.value,
          activeSegmentId: activeSegmentId.value,
          reference: null,
        },
        queue: { reference: null },
        musicStructure: { reference: null },
      },
      {
        generatedAt: PROJECTION_TIMESTAMP,
      },
    ),
  );

  const continuityKey = computed(
    () =>
      `${playerState.track?.id ?? ''}\0${playerState.track?.url ?? ''}\0${
        playerState.continuityRevision ?? 0
      }`,
  );

  const currentLibraryTrack = computed(
    () => libraryTracksById.value.get(playerState.track?.id) ?? null,
  );

  function refreshCurrentMusicStructure() {
    return Promise.resolve(
      loadMusicStructureForTrack(currentLibraryTrack.value?.id ?? null),
    ).catch(() => null);
  }

  watch(currentLibraryTrack, () => {
    if (sourcesReady) void refreshCurrentMusicStructure();
  });

  function createEnvelope(stream, kind, revision, payload) {
    return {
      contractVersion: OUTPUT_CONTRACT_VALUES.projectionEnvelopeVersion,
      bootId: getBootId(),
      sourceEpoch,
      stream,
      kind,
      revision,
      payload,
    };
  }

  async function sendEnvelope(stream, kind, revision, payload) {
    const accepted = await publishSnapshot(
      createEnvelope(stream, kind, revision, payload),
    );
    if (!accepted) await refreshStatus();
    return accepted;
  }

  function currentProjection() {
    return {
      continuity: continuityKey.value,
      lyricsDocument: projectedLyricsDocument.value,
      musicStructureDocument: projectedMusicStructureDocument.value,
      queueDocument: projectedQueueDocument.value,
      dynamicState: projectedDynamicState.value,
    };
  }

  async function publishProjection(projection) {
    const contentRefreshGeneration =
      requestedContentRefreshGeneration > acceptedContentRefreshGeneration
        ? requestedContentRefreshGeneration
        : null;
    const forceContentRefresh = contentRefreshGeneration !== null;
    const continuityChanged =
      lastContinuity !== null && projection.continuity !== lastContinuity;
    if (continuityChanged) {
      handshakeComplete = false;
      sourceEpoch = createSourceEpoch();
      nextStateRevision = 0;
    }
    if (
      forceContentRefresh ||
      projection.lyricsDocument !== lastLyricsDocument
    ) {
      if (projection.lyricsDocument) {
        nextLyricsRevision += 1;
        const accepted = await sendEnvelope(
          'lyrics.document',
          continuityChanged || !lyricsReference ? 'full' : 'update',
          nextLyricsRevision,
          { document: projection.lyricsDocument },
        );
        if (!accepted) return false;
        lyricsReference = {
          documentId: projection.lyricsDocument.documentId,
          documentRevision: nextLyricsRevision,
        };
      } else {
        lyricsReference = null;
      }
      lastLyricsDocument = projection.lyricsDocument;
    }

    if (
      forceContentRefresh ||
      projection.musicStructureDocument !== lastMusicStructureDocument
    ) {
      if (projection.musicStructureDocument) {
        nextMusicStructureRevision += 1;
        const accepted = await sendEnvelope(
          'music-structure.document',
          continuityChanged || !musicStructureReference ? 'full' : 'update',
          nextMusicStructureRevision,
          { document: projection.musicStructureDocument },
        );
        if (!accepted) return false;
        musicStructureReference = {
          documentId: projection.musicStructureDocument.documentId,
          documentRevision: nextMusicStructureRevision,
        };
      } else {
        musicStructureReference = null;
      }
      lastMusicStructureDocument = projection.musicStructureDocument;
    }

    if (forceContentRefresh || projection.queueDocument !== lastQueueDocument) {
      nextQueueRevision += 1;
      const accepted = await sendEnvelope(
        'queue.document',
        continuityChanged || !queueReference ? 'full' : 'update',
        nextQueueRevision,
        { document: projection.queueDocument },
      );
      if (!accepted) return false;
      queueReference = {
        documentId: projection.queueDocument.documentId,
        documentRevision: nextQueueRevision,
      };
      lastQueueDocument = projection.queueDocument;
    }

    if (!queueReference) return false;
    nextStateRevision += 1;
    const dynamic = {
      ...projection.dynamicState,
      generatedAt: now(),
      lyrics: {
        ...projection.dynamicState.lyrics,
        documentId: lyricsReference?.documentId ?? null,
        documentRevision: lyricsReference?.documentRevision ?? 0,
      },
      queue: queueReference,
      musicStructure: {
        documentId: musicStructureReference?.documentId ?? null,
        documentRevision: musicStructureReference?.documentRevision ?? 0,
      },
    };
    const accepted = await sendEnvelope(
      'state.snapshot',
      handshakeComplete ? 'update' : 'full',
      nextStateRevision,
      dynamic,
    );
    handshakeComplete = accepted;
    if (accepted) {
      lastContinuity = projection.continuity;
      if (forceContentRefresh) {
        acceptedContentRefreshGeneration = Math.max(
          acceptedContentRefreshGeneration,
          contentRefreshGeneration,
        );
      }
    }
    return accepted;
  }

  const publisher = createLatestAsyncPublisher(publishProjection, {
    onError: reportPublishError,
  });

  watch(
    [
      continuityKey,
      projectedLyricsDocument,
      projectedMusicStructureDocument,
      projectedQueueDocument,
      projectedDynamicState,
    ],
    () => {
      if (!sourcesReady || !isOutputEnabled()) return;
      publisher.request(currentProjection());
    },
  );

  function setSourcesReady(value) {
    sourcesReady = value === true;
  }

  async function publishCurrentProjection(options = {}) {
    let requestedGeneration = null;
    if (options.forceContent === true) {
      requestedContentRefreshGeneration += 1;
      requestedGeneration = requestedContentRefreshGeneration;
    }
    publisher.request(currentProjection());
    await publisher.whenIdle();
    return requestedGeneration === null
      ? handshakeComplete
      : acceptedContentRefreshGeneration >= requestedGeneration;
  }

  return {
    isHandshakeComplete: () => handshakeComplete,
    publishCurrentProjection,
    refreshCurrentMusicStructure,
    setSourcesReady,
  };
}
