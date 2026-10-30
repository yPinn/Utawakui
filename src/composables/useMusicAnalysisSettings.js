import { useMusicAnalysisCapabilitySession } from './analysis/useMusicAnalysisCapabilitySession.js';
import { t } from '../utils/i18n.js';

import { useSettingsPreference } from './useSettingsPreference.js';

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

export function useMusicAnalysisSettings(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const { capability, owner: capabilityOwner } =
    useMusicAnalysisCapabilitySession({ bridge });
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'auto-music-analysis',
    initialValue: true,
    read: () => bridge.getAutoMusicAnalysis(),
    write: (value) => bridge.setAutoMusicAnalysis(value),
    validate: (value) => typeof value === 'boolean',
    readMessage: t('capabilities.bpm.readFailed'),
    saveMessage: t('capabilities.bpm.saveFailed'),
  });
  let initialized = false;

  async function initialize() {
    if (!initialized) {
      initialized = true;
      capabilityOwner.subscribeProgress();
    }
    await Promise.all([capabilityOwner.refreshStatus(), preference.refresh()]);
  }

  return {
    capability,
    autoAnalyze: preference.value,
    capabilityBusy: capabilityOwner.busy,
    capabilityError: capabilityOwner.error,
    capabilityReadError: capabilityOwner.readError,
    refreshCapability: capabilityOwner.refreshStatus,
    preferenceBusy: preference.busy,
    preferenceReading: preference.reading,
    preferenceLoaded: preference.loaded,
    preferenceReadError: preference.readError,
    preferenceSaveError: preference.saveError,
    preferenceError: preference.error,
    refreshPreference: preference.refresh,
    progressPercent: capabilityOwner.progressPercent,
    stageLabel: capabilityOwner.stageLabel,
    initialize,
    setAutoAnalyze: preference.save,
    prepare: capabilityOwner.prepare,
    repair: capabilityOwner.repair,
    remove: capabilityOwner.remove,
  };
}
