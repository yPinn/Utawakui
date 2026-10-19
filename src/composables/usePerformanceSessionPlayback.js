import { useLibrary } from './useLibrary.js';
import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { registerPlaybackArrangement } from './usePlaybackTransport.js';
import { usePerformanceSessionPlan } from './usePerformanceSessionPlan.js';
import { usePerformanceSessionPlaybackController } from './usePerformanceSessionPlaybackController.js';
import { toPlayableTrack } from '../utils/playableTrack.js';

const plan = usePerformanceSessionPlan();
const library = useLibrary();
const controller = usePerformanceSessionPlaybackController({
  plan,
  player: usePlayer(),
  queue: usePlaybackQueue(),
  getTracks: () => library.state.tracks,
  toPlayableTrack,
});
const unregister = registerPlaybackArrangement(controller);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    unregister();
    controller.dispose();
  });

export function usePerformanceSessionPlayback() {
  return controller;
}
