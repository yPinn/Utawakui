import { computed, shallowRef, unref, watch } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import {
  buildSeparationPlan,
  separationPlanSummary,
} from '../components/separation/separationQueuePresentation.js';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
} from '../constants/separationPresets.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaylistActions } from './usePlaylistActions.js';
import { usePlaylists } from './usePlaylists.js';
import { playlistDisplayName } from '../utils/playlistMenu.js';
import { orderPlaylistsForDisplay } from '../utils/playlistOrdering.js';

const selectedMode = shallowRef(DEFAULT_SEPARATION_PRESET_ID);
const PLAYBACK_ORDER_SOURCE_ID = 'playback-order';
const COLLECTION_SOURCE_PREFIX = 'collection:';

const modeOptions = Object.freeze(
  SEPARATION_PRESET_OPTIONS.map(({ id, label }) =>
    Object.freeze({ value: id, label }),
  ),
);

export function useSeparationPreparation({
  enqueue,
  queue = null,
  playbackQueue = usePlaybackQueue(),
  playlistState = usePlaylists().state,
  tracksById = new Map(),
  resolveCollectionTracks = usePlaylistActions().resolvePlaylistTracks,
  featureGateAccess = useFeatureGateAccess(),
} = {}) {
  const { currentTrack, queuedTracks, sourceUpcomingTracks } = playbackQueue;
  const { requireFeatureGate } = featureGateAccess;
  const selectedSourceId = shallowRef(PLAYBACK_ORDER_SOURCE_ID);
  const activeAction = shallowRef('');

  const sourceOptions = computed(() => {
    const { playlistItems, albumItems, albumArtistById } =
      orderPlaylistsForDisplay(playlistState.playlists, unref(tracksById));
    const toOption = (collection) => ({
      value: `${COLLECTION_SOURCE_PREFIX}${collection.id}`,
      label: playlistDisplayName(collection),
    });
    const playlists = playlistItems.map(toOption);
    const albums = albumItems.map((collection) => {
      const option = toOption(collection);
      const artist = albumArtistById.get(collection.id);
      return {
        ...option,
        label: artist ? `${option.label} · ${artist}` : option.label,
        primaryLabel: option.label,
        ...(artist
          ? {
              secondaryLabel: artist,
              searchText: `${option.label} ${artist}`,
            }
          : {}),
      };
    });

    return [
      { value: PLAYBACK_ORDER_SOURCE_ID, label: '目前播放順序' },
      ...(playlists.length > 0
        ? [{ label: '播放清單', options: playlists }]
        : []),
      ...(albums.length > 0 ? [{ label: '專輯', options: albums }] : []),
    ];
  });
  const selectedCollection = computed(() => {
    if (!selectedSourceId.value.startsWith(COLLECTION_SOURCE_PREFIX)) {
      return null;
    }
    const collectionId = selectedSourceId.value.slice(
      COLLECTION_SOURCE_PREFIX.length,
    );
    return (
      playlistState.playlists.find(({ id }) => id === collectionId) ?? null
    );
  });

  watch(
    () => playlistState.playlists,
    () => {
      if (
        selectedSourceId.value !== PLAYBACK_ORDER_SOURCE_ID &&
        !selectedCollection.value
      ) {
        selectedSourceId.value = PLAYBACK_ORDER_SOURCE_ID;
      }
    },
    { flush: 'sync' },
  );

  const sourceTracks = computed(() => {
    if (selectedCollection.value) {
      const seen = new Set();
      return resolveCollectionTracks(selectedCollection.value).filter(
        (track) => {
          if (!track?.id || seen.has(track.id)) return false;
          seen.add(track.id);
          return true;
        },
      );
    }

    return buildSeparationPlan({
      currentTrack: currentTrack.value,
      queuedTracks: queuedTracks.value,
      sourceUpcomingTracks: sourceUpcomingTracks.value,
    });
  });
  const queuedTrackIds = computed(
    () =>
      new Set(
        (unref(queue)?.items ?? [])
          .filter(({ recipeId }) => recipeId === selectedMode.value)
          .map(({ trackId }) => trackId),
      ),
  );
  const visibleSourceTracks = computed(() =>
    sourceTracks.value.filter(({ id }) => !queuedTrackIds.value.has(id)),
  );
  const preparedTracks = computed(() =>
    visibleSourceTracks.value.filter(
      (track) => track.separation?.results?.[selectedMode.value],
    ),
  );
  const unpreparedTracks = computed(() =>
    visibleSourceTracks.value.filter(
      (track) => !track.separation?.results?.[selectedMode.value],
    ),
  );
  const planHint = computed(() =>
    separationPlanSummary(unpreparedTracks.value),
  );
  const isBusy = computed(() => Boolean(activeAction.value));
  const isStarting = computed(() => activeAction.value === 'start');
  const isRestarting = computed(() => activeAction.value === 'restart');

  async function enqueueTracks(tracks, { action, regenerate }) {
    const trackIds = tracks.map(({ id }) => id);
    if (
      trackIds.length === 0 ||
      isBusy.value ||
      typeof enqueue !== 'function'
    ) {
      return null;
    }
    const mode = selectedMode.value;

    activeAction.value = action;
    try {
      const enabled = await requireFeatureGate(
        FEATURE_IDS.AUDIO_PROCESSING_FLOW,
        {
          label: '伴奏功能',
          title: '先完成初次設定',
          message: '請先到設定啟用伴奏功能。',
          source: 'separation',
          operation: 'enqueue',
        },
      );
      if (!enabled) return null;

      return enqueue(trackIds, mode, regenerate);
    } finally {
      activeAction.value = '';
    }
  }

  function startUnpreparedTracks() {
    return enqueueTracks(unpreparedTracks.value, {
      action: 'start',
      regenerate: false,
    });
  }

  function restartPreparedTracks() {
    return enqueueTracks(preparedTracks.value, {
      action: 'restart',
      regenerate: true,
    });
  }

  return {
    selectedMode,
    modeOptions,
    selectedSourceId,
    sourceOptions,
    sourceTracks,
    unpreparedTracks,
    preparedTracks,
    planHint,
    isBusy,
    isStarting,
    isRestarting,
    startUnpreparedTracks,
    restartPreparedTracks,
  };
}
