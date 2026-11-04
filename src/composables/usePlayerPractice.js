import { computed, watch } from 'vue';
import { usePlayer } from './usePlayer.js';
import { useBgmSession } from './useBgmSession.js';
import { usePerformanceSessionPlayback } from './usePerformanceSessionPlayback.js';
import { usePlayerPracticeRuntime } from './player/usePlayerPracticeRuntime.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { t } from '../utils/i18n.js';

let instance;
export function usePlayerPractice() {
  if (instance) return instance;
  const player = usePlayer(),
    bgm = useBgmSession(),
    arrangement = usePerformanceSessionPlayback();
  const queue = usePlaybackQueue();
  const runtime = usePlayerPracticeRuntime({
    player,
    acquireHold: (options) => bgm.acquirePracticeLane(options),
    verifySource: () => player.performanceSettings.verifySource(),
    isSessionOwned: () => arrangement.ownsPlayback.value,
  });
  const unavailableReason = computed(() =>
    arrangement.ownsPlayback.value
      ? t('player.practice.leaveSession')
      : player.state.pendingStartTrackId && !runtime.state.enabled
        ? t('player.practice.preparing')
        : !player.state.track
          ? t('player.practice.chooseTrack')
          : !(player.state.duration > 0)
            ? t('player.practice.waitingAudio')
            : '',
  );
  const canEnable = computed(() => {
    void runtime.state.metadataRevision;
    void player.state.duration;
    return (
      !unavailableReason.value &&
      !runtime.state.loading &&
      runtime.isRangeValid()
    );
  });
  const running = computed(() =>
    Boolean(
      runtime.state.enabled &&
      (player.state.isPlaying ||
        player.state.pendingStartTrackId ||
        ['returning', 'gap', 'source-changing'].includes(runtime.state.phase)),
    ),
  );
  const stop = watch(
    () => arrangement.ownsPlayback.value,
    (owned) => {
      if (owned) {
        const active = runtime.state.enabled;
        runtime.disable({ clear: true });
        if (active) player.pause();
      }
    },
    { flush: 'sync' },
  );
  const stopShuffle = watch(
    () => queue.state.isShuffle,
    () => runtime.disable(),
    { flush: 'sync' },
  );
  const setPoint = (point, value) => {
    if (unavailableReason.value || !['a', 'b'].includes(point)) return false;
    const seconds = value === '' || value === null ? null : Number(value);
    return runtime.setRange(
      point === 'a' ? seconds : runtime.state.a,
      point === 'b' ? seconds : runtime.state.b,
    );
  };
  instance = {
    ...runtime,
    canEnable,
    running,
    unavailableReason,
    setPoint,
    capture(point) {
      return setPoint(
        point,
        Number(player.practiceBoundary.sample().currentTime.toFixed(3)),
      );
    },
    toggle: () =>
      running.value ? player.pause() : runtime.enable({ startPlayback: true }),
    clear: () => runtime.disable({ clear: true }),
    dispose() {
      stop();
      stopShuffle();
      runtime.dispose();
      instance = null;
    },
  };
  return instance;
}
if (import.meta.hot) import.meta.hot.dispose(() => instance?.dispose());
