import { useSettingsPreference } from './useSettingsPreference.js';
import { t } from '../utils/i18n.js';

export function usePlaybackDockPreference() {
  const bridge = globalThis.window?.Utawakui;
  return useSettingsPreference({
    scope: bridge,
    key: 'obs-arrangement-dock',
    initialValue: false,
    read: () => bridge.getObsArrangementDock(),
    write: (enabled) => bridge.setObsArrangementDock(enabled),
    validate: (value) => typeof value === 'boolean',
    readMessage: t('obs.dock.readFailed'),
    saveMessage: t('obs.dock.saveFailed'),
  });
}
