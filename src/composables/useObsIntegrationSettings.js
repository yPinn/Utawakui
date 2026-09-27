import { computed, reactive, shallowRef } from 'vue';
import { useObsIntegration } from './useObsIntegration.js';
import { isValidObsHost } from '../../shared/obsConnectionContract.mjs';
import OBS_CONNECTION_VALUES from '../../shared/obsConnectionValues.json';
import {
  defaultSkipThresholdMs as DEFAULT_SKIP_THRESHOLD_MS,
  minSkipThresholdMs as SKIP_THRESHOLD_MIN_MS,
  maxSkipThresholdMs as SKIP_THRESHOLD_MAX_MS,
} from '../../shared/obsSessionValues.json';

const {
  defaultHost: DEFAULT_HOST,
  defaultPort: DEFAULT_PORT,
  minPort: MIN_PORT,
  maxPort: MAX_PORT,
  maxHostLength: MAX_HOST_LENGTH,
  maxPasswordLength: MAX_PASSWORD_LENGTH,
} = OBS_CONNECTION_VALUES;

function parseBoundedInteger(value, minimum, maximum) {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

// Row-specific wrapper around the module-scope useObsIntegration() state,
// same split as useSeparationSettings.js/useMusicAnalysisSettings.js: the
// connection status itself is shared app-wide, but the draft host/port/
// password inputs and save/retry busy state belong only to this Settings
// row.
export function useObsIntegrationSettings() {
  const obs = useObsIntegration();

  const host = shallowRef(DEFAULT_HOST);
  const port = shallowRef(String(DEFAULT_PORT));
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
  let settingsGeneration = 0;
  let committedSettings = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    skipThresholdMs: DEFAULT_SKIP_THRESHOLD_MS,
  };

  async function refreshSettings() {
    if (state.isLoading || state.isSaving) return false;
    const generation = ++settingsGeneration;
    state.isLoading = true;
    state.error = '';
    try {
      const settings = await obs.getObsSettings();
      if (settingsGeneration !== generation) return false;
      if (settings) {
        host.value = settings.host ?? host.value;
        port.value = String(settings.port ?? port.value);
        hasStoredPassword.value = Boolean(settings.hasPassword);
        if (Number.isFinite(settings.skipThresholdMs)) {
          skipThresholdSeconds.value = String(
            Math.round(settings.skipThresholdMs / 1000),
          );
        }
        committedSettings = {
          host: host.value,
          port: Number(port.value),
          skipThresholdMs: Number.isFinite(settings.skipThresholdMs)
            ? settings.skipThresholdMs
            : DEFAULT_SKIP_THRESHOLD_MS,
        };
      }
      await obs.refreshObsStatus();
      return settingsGeneration === generation;
    } catch {
      if (settingsGeneration === generation) {
        state.error = '無法讀取設定，請再試一次。';
      }
      return false;
    } finally {
      if (settingsGeneration === generation) state.isLoading = false;
    }
  }

  async function save({ enabled }) {
    if (state.isSaving) return false;
    state.error = '';
    const shouldEnable = enabled === true;
    let connectionSettings;
    if (shouldEnable) {
      const trimmedHost = host.value.trim();
      if (!isValidObsHost(trimmedHost, MAX_HOST_LENGTH)) {
        state.error = '請輸入有效的主機名稱或 IP。';
        return false;
      }
      const nextPort = parseBoundedInteger(port.value, MIN_PORT, MAX_PORT);
      if (nextPort === null) {
        state.error = `連接埠必須是 ${MIN_PORT} 到 ${MAX_PORT} 的整數。`;
        return false;
      }
      const minimumSeconds = SKIP_THRESHOLD_MIN_MS / 1000;
      const maximumSeconds = SKIP_THRESHOLD_MAX_MS / 1000;
      const nextThresholdSeconds = parseBoundedInteger(
        skipThresholdSeconds.value,
        minimumSeconds,
        maximumSeconds,
      );
      if (nextThresholdSeconds === null) {
        state.error = `略過門檻必須是 ${minimumSeconds} 到 ${maximumSeconds} 的整數秒。`;
        return false;
      }
      if (password.value.length > MAX_PASSWORD_LENGTH) {
        state.error = `密碼不可超過 ${MAX_PASSWORD_LENGTH} 個字元。`;
        return false;
      }
      connectionSettings = {
        enabled: true,
        host: trimmedHost,
        port: nextPort,
        skipThresholdMs: nextThresholdSeconds * 1000,
      };
    } else {
      connectionSettings = { enabled: false, ...committedSettings };
    }

    settingsGeneration += 1;
    state.isLoading = false;
    state.isSaving = true;
    try {
      await obs.updateObsSettings({
        ...connectionSettings,
        ...(shouldEnable && password.value ? { password: password.value } : {}),
      });
      if (shouldEnable) {
        if (password.value) hasStoredPassword.value = true;
        password.value = '';
        host.value = connectionSettings.host;
        port.value = String(connectionSettings.port);
        skipThresholdSeconds.value = String(
          Math.round(connectionSettings.skipThresholdMs / 1000),
        );
        committedSettings = {
          host: connectionSettings.host,
          port: connectionSettings.port,
          skipThresholdMs: connectionSettings.skipThresholdMs,
        };
      }
      return true;
    } catch {
      state.error = '無法儲存設定，請再試一次。';
      return false;
    } finally {
      state.isSaving = false;
    }
  }

  async function retryConnect() {
    if (state.isSaving) return false;
    state.isSaving = true;
    state.error = '';
    try {
      await obs.connectObs();
      return true;
    } catch {
      await obs.refreshObsStatus();
      if (!obs.state.error) {
        state.error = '無法連線。請確認 OBS 已啟動 WebSocket。';
      }
      return false;
    } finally {
      state.isSaving = false;
    }
  }

  async function clearPassword() {
    if (state.isSaving) return false;
    settingsGeneration += 1;
    state.isLoading = false;
    state.isSaving = true;
    state.error = '';
    try {
      const result = await obs.clearObsPassword();
      if (result?.hasPassword !== false) throw new Error('removal unconfirmed');
      hasStoredPassword.value = false;
      password.value = '';
      return true;
    } catch {
      state.error = '無法移除密碼，請再試一次。';
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
    clearPassword,
  };
}
