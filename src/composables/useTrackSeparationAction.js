import { computed, shallowRef, unref } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { DEFAULT_SEPARATION_PRESET_ID } from '../constants/separationPresets.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useAppNotifications } from './useAppNotifications.js';

const OPEN_SEPARATION_STATUSES = new Set(['pending', 'checking', 'running']);

function trackHasSeparation(track) {
  return (
    Boolean(track?.hasSeparation) ||
    Object.values(track?.separation?.results ?? {}).some(Boolean)
  );
}

export function useTrackSeparationAction({
  separationController,
  tracksById,
  featureGateAccess = useFeatureGateAccess(),
} = {}) {
  const enqueueingTrackId = shallowRef('');
  const error = shallowRef('');
  const notifications = useAppNotifications();
  const vsQueuedTrackIds = computed(
    () =>
      new Set(
        (unref(separationController?.queue)?.items ?? [])
          .filter(({ status }) => OPEN_SEPARATION_STATUSES.has(status))
          .map(({ trackId }) => trackId),
      ),
  );

  async function queueTrackForSeparation(track) {
    const trackId = String(track?.id ?? '');
    const canonicalTrack = unref(tracksById)?.get?.(trackId);
    if (
      !canonicalTrack ||
      trackHasSeparation(canonicalTrack) ||
      vsQueuedTrackIds.value.has(trackId) ||
      enqueueingTrackId.value ||
      typeof separationController?.enqueue !== 'function'
    ) {
      return null;
    }

    error.value = '';
    enqueueingTrackId.value = trackId;
    try {
      const enabled = await featureGateAccess.requireFeatureGate(
        FEATURE_IDS.AUDIO_PROCESSING_FLOW,
        {
          label: '伴奏處理',
          title: '先完成初次設定',
          message: '請先到設定啟用伴奏處理。',
          source: 'library',
          operation: 'enqueue-track',
        },
      );
      if (!enabled) return null;

      notifications.clear(NOTIFICATION_KEYS.LIBRARY_SEPARATION_ENQUEUE);

      const result = await separationController.enqueue(
        [trackId],
        DEFAULT_SEPARATION_PRESET_ID,
        false,
      );
      if (!result) {
        error.value =
          unref(separationController.error) || '歌曲目前無法加入伴奏處理佇列。';
        notifications.notify({
          key: NOTIFICATION_KEYS.LIBRARY_SEPARATION_ENQUEUE,
          title: '伴奏處理未加入',
          message: error.value,
          tone: 'danger',
        });
      }
      return result;
    } finally {
      enqueueingTrackId.value = '';
    }
  }

  function clearError() {
    error.value = '';
  }

  return {
    enqueueingTrackId,
    error,
    vsQueuedTrackIds,
    queueTrackForSeparation,
    clearError,
  };
}
