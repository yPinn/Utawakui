import { onScopeDispose, readonly, shallowRef } from 'vue';
import { createMicrophoneResearchRuntime } from '../microphone/researchRuntime.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

export function useMicrophoneResearch({
  access = window.Utawakui,
  stopWhenHidden = false,
  preferSystemDefault = false,
} = {}) {
  const state = shallowRef(null);
  const { recordError } = useAppDiagnostics();
  const runtime = createMicrophoneResearchRuntime({
    mediaDevices: navigator.mediaDevices,
    access,
    preferSystemDefault,
    createContext: () => new AudioContext({ latencyHint: 'interactive' }),
    publish: (value) => {
      state.value = value;
    },
    onError: (error, code) =>
      recordError(error, {
        code,
        title: 'Mic 研究操作未完成',
        message: '請確認輸入裝置後重試。',
        source: 'microphone-research',
        operation: 'input-analysis',
        context: { retryable: true },
        persist: access === window.Utawakui,
      }),
  });
  const stopOnUnload = () => runtime.stop();
  const activityVisibilityChanged = () => {
    runtime.setActivitySuspended(document.hidden);
    if (stopWhenHidden && document.hidden) runtime.stop();
  };
  activityVisibilityChanged();
  document.addEventListener('visibilitychange', activityVisibilityChanged);
  window.addEventListener('pagehide', stopOnUnload);
  onScopeDispose(() => {
    window.removeEventListener('pagehide', stopOnUnload);
    document.removeEventListener('visibilitychange', activityVisibilityChanged);
    runtime.destroy();
  });
  return { state: readonly(state), ...runtime };
}
