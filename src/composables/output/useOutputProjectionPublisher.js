import { computed, watch } from 'vue';
import OUTPUT_CONTRACT_VALUES from '../../../shared/outputContractValues.json';
import { createLatestAsyncPublisher } from '../../utils/latestAsyncPublisher.js';
import {
  isJapaneseLyricsDocument,
  projectDynamicOutputState,
  projectLyricsOutputDocument,
  projectMusicStructureOutputDocument,
  projectQueueOutputDocument,
} from '../../utils/outputStreamProjection.js';
import { useLibrary } from '../useLibrary.js';
import { useLyrics } from '../useLyrics.js';
import { useLyricsReading } from '../useLyricsReading.js';
import { useMusicStructureSignals } from '../useMusicStructureSignals.js';
import { usePlaybackQueue } from '../usePlaybackQueue.js';
import { usePlayer } from '../usePlayer.js';
import { usePerformanceSessionPlayback } from '../usePerformanceSessionPlayback.js';
import { usePerformanceSessionPlan } from '../usePerformanceSessionPlan.js';
import { projectPerformanceSessionOutput } from '../../utils/performanceSessionOutput.js';
import { deriveLyricsPlaybackState } from '../../utils/lyricsDocument.js';

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
  const { state: playerState, samplePlaybackClock } = usePlayer();
  const { state: queueState, upcomingTracks } = usePlaybackQueue();
  const arrangement = usePerformanceSessionPlayback();
  const { state: arrangementPlanState } = usePerformanceSessionPlan();
  const arrangementProjection = computed(() =>
    arrangement.ownsPlayback.value
      ? projectPerformanceSessionOutput({
          plan: arrangementPlanState.plan,
          current: arrangement.currentItem.value,
        })
      : null,
  );
  const { tracksById: libraryTracksById } = useLibrary();
  const {
    state: lyricsState,
    selectedTrack: lyricsTrack,
    selectedSource: lyricsSource,
    displayLyricsDocument,
    experimentalLyrics,
    lyricsTextProcessing,
    activeLineId,
    activeSegmentId,
  } = useLyrics();
  const { getDoc: getReadingDoc, loadReading } = useLyricsReading();
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
  let lastReadingLoadKey = null;

  function queueInput() {
    if (arrangementProjection.value) return arrangementProjection.value.queue;
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
    const document = projectLyricsOutputDocument({
      trackId,
      source: lyricsSource.value,
      document:
        experimentalLyrics?.outputDocument.value ?? displayLyricsDocument.value,
      readingDocument: getReadingDoc(trackId, lyricsSource.value?.filename),
    });
    return lyricsTextProcessing
      ? lyricsTextProcessing.project(document)
      : document;
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

  function projectDynamicState(sample = null) {
    const manual =
      arrangementProjection.value &&
      arrangement.currentItem.value?.mode === 'manual';
    const player = manual
      ? arrangementProjection.value.player
      : {
          ...playerState,
          ...(arrangementProjection.value
            ? { track: arrangementProjection.value.queue.currentTrack }
            : {}),
          ...(sample
            ? {
                currentTime: sample.positionMs / 1000,
                tempoRate: sample.rate,
                playbackPhase: sample.phase,
              }
            : {}),
        };
    const active =
      sample && !manual && lyricsTrack.value?.id === player.track?.id
        ? deriveLyricsPlaybackState(
            projectedLyricsDocument.value,
            sample.positionMs + lyricsState.offsetSeconds * 1000,
            player.duration * 1000 || null,
          )
        : {
            activeLineId: activeLineId.value,
            activeSegmentId: activeSegmentId.value,
          };
    if (
      active.activeLineId &&
      !projectedLyricsDocument.value?.lines.some(
        (line) => line.lineId === active.activeLineId,
      )
    ) {
      active.activeLineId = null;
      active.activeSegmentId = null;
    }
    return projectDynamicOutputState(
      {
        player: {
          ...player,
          volume: playerState.volume,
          isMuted: playerState.isMuted,
        },
        output: { displayDelayMs: getDisplayDelayMs() },
        lyrics: {
          offsetSeconds: lyricsState.offsetSeconds,
          activeLineId: active.activeLineId,
          activeSegmentId: active.activeSegmentId,
          reference: null,
        },
        queue: { reference: null },
        musicStructure: { reference: null },
      },
      {
        generatedAt: sample?.sampledAt ?? PROJECTION_TIMESTAMP,
      },
    );
  }
  const projectedDynamicState = computed(() => projectDynamicState());

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

  function refreshCurrentReading() {
    const trackId = playerState.track?.id ?? null;
    const source = lyricsSource.value;
    const document = displayLyricsDocument.value;
    if (
      !trackId ||
      lyricsTrack.value?.id !== trackId ||
      !source?.filename ||
      !isOutputEnabled() ||
      !isJapaneseLyricsDocument(source, document) ||
      !document
    ) {
      lastReadingLoadKey = null;
      return Promise.resolve(null);
    }
    const key = `${trackId}\0${source.filename}\0${document.documentId ?? ''}\0${document.source?.sha256 ?? ''}`;
    if (key === lastReadingLoadKey) return Promise.resolve(null);
    lastReadingLoadKey = key;
    // useLyricsReading.loadReading() resolves on every path (it maps its own
    // failures to undefined), so a rejection guard here would be dead code.
    return Promise.resolve(
      loadReading(trackId, source.filename, document),
    ).then((result) => {
      if (result === undefined) lastReadingLoadKey = null;
      return result;
    });
  }

  watch(currentLibraryTrack, () => {
    if (sourcesReady) void refreshCurrentMusicStructure();
  });

  watch(
    [
      () => playerState.track?.id,
      () => lyricsSource.value?.filename,
      () => lyricsSource.value?.language,
      () => displayLyricsDocument.value?.documentId,
      () => displayLyricsDocument.value?.source?.sha256,
    ],
    () => {
      if (sourcesReady) void refreshCurrentReading();
    },
  );

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

  function freshDynamic(projection) {
    const current = currentProjection();
    if (
      current.continuity !== projection.continuity ||
      current.lyricsDocument !== projection.lyricsDocument ||
      current.musicStructureDocument !== projection.musicStructureDocument ||
      current.queueDocument !== projection.queueDocument
    ) {
      publisher.request(current);
      return null;
    }
    const sample = samplePlaybackClock({ now });
    if (
      sample.trackId !== (playerState.track?.id ?? null) ||
      sample.continuityRevision !== (playerState.continuityRevision ?? 0)
    )
      return null;
    const dynamic = projectDynamicState(sample);
    return {
      ...dynamic,
      lyrics: {
        ...dynamic.lyrics,
        documentId: lyricsReference?.documentId ?? null,
        documentRevision: lyricsReference?.documentRevision ?? 0,
      },
      queue: queueReference,
      musicStructure: {
        documentId: musicStructureReference?.documentId ?? null,
        documentRevision: musicStructureReference?.documentRevision ?? 0,
      },
    };
  }

  async function recoverRejectedState(projection, contentRefreshGeneration) {
    sourceEpoch = createSourceEpoch();
    nextStateRevision = 0;
    handshakeComplete = false;
    const dynamic = freshDynamic(projection);
    if (!dynamic) return false;
    nextStateRevision = 1;
    const accepted = await sendEnvelope('state.snapshot', 'full', 1, dynamic);
    handshakeComplete = accepted;
    if (accepted) {
      lastContinuity = projection.continuity;
      if (contentRefreshGeneration !== null) {
        acceptedContentRefreshGeneration = Math.max(
          acceptedContentRefreshGeneration,
          contentRefreshGeneration,
        );
      }
    }
    return accepted;
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
    const dynamic = freshDynamic(projection);
    if (!dynamic) return false;
    nextStateRevision += 1;
    const accepted = await sendEnvelope(
      'state.snapshot',
      handshakeComplete ? 'update' : 'full',
      nextStateRevision,
      dynamic,
    );
    handshakeComplete = accepted;
    if (!accepted) {
      return recoverRejectedState(projection, contentRefreshGeneration);
    }
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
    if (sourcesReady && isOutputEnabled()) void refreshCurrentReading();
  }

  async function publishCurrentProjection(options = {}) {
    if (sourcesReady && isOutputEnabled()) await refreshCurrentReading();
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
    refreshCurrentReading,
    setSourcesReady,
  };
}
