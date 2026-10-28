import { useSettingsPreference } from './useSettingsPreference.js';

export function usePlaybackDockPreference() {
  const bridge = globalThis.window?.Utawakui;
  return useSettingsPreference({
    scope: bridge,
    key: 'obs-arrangement-dock',
    initialValue: false,
    read: () => bridge.getObsArrangementDock(),
    write: (enabled) => bridge.setObsArrangementDock(enabled),
    validate: (value) => typeof value === 'boolean',
    readMessage: '無法讀取播放安排顯示偏好，請再試一次。',
    saveMessage: '無法儲存播放安排顯示偏好，已恢復原設定。',
  });
}
