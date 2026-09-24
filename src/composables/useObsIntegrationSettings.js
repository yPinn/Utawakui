import { computed, reactive, shallowRef } from 'vue';
import { useObsIntegration } from './useObsIntegration.js';
import {
  defaultSkipThresholdMs as DEFAULT_SKIP_THRESHOLD_MS,
  minSkipThresholdMs as SKIP_THRESHOLD_MIN_MS,
  maxSkipThresholdMs as SKIP_THRESHOLD_MAX_MS,
} from '../../shared/obsSessionValues.json';

// Row-specific wrapper around the module-scope useObsIntegration() state,
// same split as useSeparationSettings.js/useMusicAnalysisSettings.js: the
// connection status itself is shared app-wide, but the draft host/port/
// password inputs and save/retry busy state belong only to this Settings
// row.
export function useObsIntegrationSettings() {
  const obs = useObsIntegration();

  const host = shallowRef('127.0.0.1');
  const port = shallowRef('4455');
  const password = shallowRef('');
  const hasStoredPassword = shallowRef(false);
  // Shown to the user in whole seconds, not raw milliseconds — converted at
  // the read/save boundary only; main still owns and validates the ms value
  // (see electron/lib/config.js's isValidObsIntegration).
  const skipThresholdSeconds = shallowRef(
    String(Math.round(DEFAULT_SKIP_THRESHOLD_MS / 1000)),
  );
  const state = reactive({
    isLoading: false,
    isSaving: false,
    error: '',
  });

  async function refreshSettings() {
    state.isLoading = true;
    state.error = '';
    try {
      const settings = await obs.getObsSettings();
      if (settings) {
        host.value = settings.host ?? host.value;
        port.value = String(settings.port ?? port.value);
        hasStoredPassword.value = Boolean(settings.hasPassword);
        if (Number.isFinite(settings.skipThresholdMs)) {
          skipThresholdSeconds.value = String(
            Math.round(settings.skipThresholdMs / 1000),
          );
        }
      }
      await obs.refreshObsStatus();
    } catch {
      state.error = '目前無法讀取 OBS 連線設定，請再試一次。';
    } finally {
      state.isLoading = false;
    }
  }

  async function save({ enabled }) {
    state.isSaving = true;
    state.error = '';
    try {
      const trimmedHost = host.value.trim() || '127.0.0.1';
      const parsedPort = Number.parseInt(port.value, 10);
      const nextPort = Number.isFinite(parsedPort) ? parsedPort : 4455;
      const parsedThresholdSeconds = Number.parseInt(
        skipThresholdSeconds.value,
        10,
      );
      const nextSkipThresholdMs = Number.isFinite(parsedThresholdSeconds)
        ? Math.min(
            SKIP_THRESHOLD_MAX_MS,
            Math.max(SKIP_THRESHOLD_MIN_MS, parsedThresholdSeconds * 1000),
          )
        : DEFAULT_SKIP_THRESHOLD_MS;
      await obs.updateObsSettings({
        enabled,
        host: trimmedHost,
        port: nextPort,
        skipThresholdMs: nextSkipThresholdMs,
        ...(password.value ? { password: password.value } : {}),
      });
      if (password.value) hasStoredPassword.value = true;
      password.value = '';
      host.value = trimmedHost;
      port.value = String(nextPort);
      skipThresholdSeconds.value = String(
        Math.round(nextSkipThresholdMs / 1000),
      );
      return true;
    } catch {
      state.error = '目前無法儲存 OBS 連線設定，請再試一次。';
      return false;
    } finally {
      state.isSaving = false;
    }
  }

  async function retryConnect() {
    state.isSaving = true;
    state.error = '';
    try {
      await obs.connectObs();
      return true;
    } catch {
      state.error =
        '目前無法連線至 OBS，請確認 OBS 已開啟並啟用 WebSocket 伺服器。';
      return false;
    } finally {
      state.isSaving = false;
    }
  }

  return {
    status: obs.state,
    host,
    port,
    password,
    skipThresholdSeconds,
    hasStoredPassword,
    isLoading: computed(() => state.isLoading),
    isSaving: computed(() => state.isSaving),
    error: computed(() => state.error),
    refreshSettings,
    save,
    retryConnect,
  };
}
