import { onMounted, onScopeDispose } from 'vue';
import { useAppRightDock } from './useAppRightDock.js';
import { useObsIntegration } from './useObsIntegration.js';
import { usePerformanceSessionPlayback } from './usePerformanceSessionPlayback.js';
import { usePlaybackDockPreference } from './usePlaybackDockPreference.js';
import { usePlaybackDockBehavior } from './usePlaybackDockBehavior.js';

export function usePlaybackDockDisplay() {
  const preference = usePlaybackDockPreference();
  const obs = useObsIntegration();
  const stop = usePlaybackDockBehavior({
    dock: useAppRightDock(),
    obs: obs.state,
    enabled: preference.value,
    active: usePerformanceSessionPlayback().ownsPlayback,
  });
  onMounted(() => {
    void preference.refresh();
  });
  onScopeDispose(stop);
}
