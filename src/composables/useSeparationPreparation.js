import { computed, shallowRef } from 'vue';
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

const selectedMode = shallowRef(DEFAULT_SEPARATION_PRESET_ID);
const prepareAgain = shallowRef(false);
const isAdding = shallowRef(false);

const modeOptions = Object.freeze(
  SEPARATION_PRESET_OPTIONS.map(({ id, label }) =>
    Object.freeze({ value: id, label }),
  ),
);

export function useSeparationPreparation({
  enqueue,
  playbackQueue = usePlaybackQueue(),
  featureGateAccess = useFeatureGateAccess(),
} = {}) {
  const { currentTrack, queuedTracks, sourceUpcomingTracks } = playbackQueue;
  const { requireFeatureGate } = featureGateAccess;

  const plannedTracks = computed(() =>
    buildSeparationPlan({
      currentTrack: currentTrack.value,
      queuedTracks: queuedTracks.value,
      sourceUpcomingTracks: sourceUpcomingTracks.value,
    }),
  );
  const planHint = computed(() => separationPlanSummary(plannedTracks.value));

  async function preparePlaylist() {
    if (
      plannedTracks.value.length === 0 ||
      isAdding.value ||
      typeof enqueue !== 'function'
    ) {
      return null;
    }

    isAdding.value = true;
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

      return enqueue(
        plannedTracks.value.map(({ id }) => id),
        selectedMode.value,
        prepareAgain.value,
      );
    } finally {
      isAdding.value = false;
    }
  }

  return {
    selectedMode,
    modeOptions,
    prepareAgain,
    isAdding,
    plannedTracks,
    planHint,
    preparePlaylist,
  };
}
