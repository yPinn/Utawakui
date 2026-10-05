import { computed, readonly } from 'vue';
import { useSerializedPlanStore } from './useSerializedPlanStore.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const DEFAULT_DIM_DB = -12;

export const BGM_STANDBY_DEFAULT_SETTINGS = Object.freeze({
  volume: 0.25,
  isMuted: false,
  loop: true,
  fadeInSeconds: 1,
  fadeOutSeconds: 0.6,
  dimDb: DEFAULT_DIM_DB,
  dimAttackMs: 100,
  dimReleaseMs: 600,
  preRollSeconds: 0.75,
  postRollSeconds: 1,
});

function createEmptyPlan() {
  return {
    version: 3,
    updatedAt: null,
    trackIds: [],
    currentTrackId: null,
    positionSeconds: 0,
    settings: { ...BGM_STANDBY_DEFAULT_SETTINGS },
    items: [],
  };
}

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.getBgmStandbyPlan === 'function'
  );
}

const { state, enqueue, refresh, initialize, dispose } = useSerializedPlanStore(
  {
    createEmptyPlan,
    hasBridge,
    fetchPlan: () => window.Utawakui.getBgmStandbyPlan(),
    invalidResponseMessage: 'invalid BGM standby response',
    errorPresentation: {
      code: 'BGM_STANDBY_RENDERER_FAILED',
      title: 'BGM 未更新',
      message: 'BGM 未更新，請再試一次。',
      source: 'bgm-standby',
    },
    recordError: useAppDiagnostics().recordError,
  },
);

if (import.meta.hot) import.meta.hot.dispose(dispose);

const currentItem = computed(
  () =>
    state.plan.items.find(
      (item) => item.trackId === state.plan.currentTrackId,
    ) ?? null,
);

function setTrack(trackId) {
  return enqueue(() => window.Utawakui.setBgmStandbyTrack(trackId), {
    name: 'set-track',
  });
}

function updateSettings(settings) {
  return enqueue(() => window.Utawakui.updateBgmStandbySettings(settings), {
    name: 'update-settings',
  });
}

function updatePosition(trackId, positionSeconds) {
  return enqueue(
    () =>
      window.Utawakui.updateBgmStandbyPosition({
        trackId,
        positionSeconds,
      }),
    { name: 'update-position' },
  );
}

export function useBgmStandbyPlan() {
  return {
    state: readonly(state),
    currentItem,
    initialize,
    refresh,
    setTrack,
    updateSettings,
    updatePosition,
  };
}
