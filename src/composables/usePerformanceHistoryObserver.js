import { usePlayer } from './usePlayer.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

// One subscription at the App lifetime boundary. The audio element remains
// authority; this observer never starts, stops, seeks or owns timing.
export function usePerformanceHistoryObserver() {
  const player = usePlayer();
  const epoch = globalThis.crypto.randomUUID();
  const { recordError } = useAppDiagnostics();
  let revision = -1;
  const dispose = player.onPlaying((event) => {
    const track = player.state.track;
    // Arrangement/manual starts are recorded atomically with progress in main.
    if (
      !track ||
      track.arrangementRequestId ||
      event.playbackRevision === revision ||
      !window.Utawakui?.observeConfirmedPerformance
    )
      return;
    revision = event.playbackRevision;
    void window.Utawakui.observeConfirmedPerformance({
      epoch,
      playbackRevision: event.playbackRevision,
      trackId: event.trackId,
    })
      .then((result) => {
        if (result?.ok === false)
          throw new Error('performance observation rejected');
      })
      .catch((error) => {
        revision = -1;
        recordError(error, {
          code: 'PERFORMANCE_HISTORY_OBSERVE_FAILED',
          title: '演出時間軸未更新',
          message: '這次演出時間戳未能保存，請檢查紀錄後重試。',
          source: 'performance-history',
          operation: 'observe-playing',
        });
      });
  });
  return { dispose };
}
