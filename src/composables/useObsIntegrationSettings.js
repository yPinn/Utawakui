import {
  computed,
  getCurrentScope,
  onScopeDispose,
  reactive,
  shallowRef,
} from 'vue';
import { useObsIntegration } from './useObsIntegration.js';
import { isValidObsHost } from '../../shared/obsConnectionContract.mjs';
import OBS_CONNECTION_VALUES from '../../shared/obsConnectionValues.json';
import {
  defaultSkipThresholdMs as DEFAULT_SKIP_THRESHOLD_MS,
  minSkipThresholdMs as SKIP_THRESHOLD_MIN_MS,
  maxSkipThresholdMs as SKIP_THRESHOLD_MAX_MS,
} from '../../shared/obsSessionValues.json';
import { t } from '../utils/i18n.js';

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

const sessions = new WeakMap();

// The settings owner shares the connection owner's lifetime so a pending
// save/removal keeps its busy state and failure on return to Settings.
// Mounted consumers release write-only password input on leaving the page.
function createSettingsOwner(obs) {
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
    readError: '',
    saveError: '',
    passwordError: '',
    connectionError: '',
    validated: false,
    validationAttempt: 0,
  });
  const validation = computed(() => ({
    host: isValidObsHost(host.value.trim(), MAX_HOST_LENGTH)
      ? ''
      : t('obs.validation.host'),
    port:
      parseBoundedInteger(port.value, MIN_PORT, MAX_PORT) !== null
        ? ''
        : t('obs.validation.port', { min: MIN_PORT, max: MAX_PORT }),
    skipThresholdSeconds:
      parseBoundedInteger(
        skipThresholdSeconds.value,
        SKIP_THRESHOLD_MIN_MS / 1000,
        SKIP_THRESHOLD_MAX_MS / 1000,
      ) !== null
        ? ''
        : t('obs.validation.skipThreshold', {
            min: SKIP_THRESHOLD_MIN_MS / 1000,
            max: SKIP_THRESHOLD_MAX_MS / 1000,
          }),
    password:
      password.value.length <= MAX_PASSWORD_LENGTH
        ? ''
        : t('obs.validation.password', { max: MAX_PASSWORD_LENGTH }),
  }));
  const fieldErrors = computed(() => (state.validated ? validation.value : {}));
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
    const statusRefresh = obs.refreshObsStatus();

    try {
      const settings = await obs.getObsSettings();
      if (settingsGeneration !== generation) return false;
      if (!settings) throw new Error('settings unavailable');
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
      state.readError = '';
      return settingsGeneration === generation;
    } catch {
      if (settingsGeneration === generation) {
        state.readError = t('obs.messages.readFailed');
      }
      return false;
    } finally {
      await statusRefresh;
      if (settingsGeneration === generation) state.isLoading = false;
    }
  }

  async function save({ enabled }) {
    if (state.isSaving || state.readError) return false;
    const shouldEnable = enabled === true;
    let connectionSettings;
    if (shouldEnable) {
      state.validated = true;
      state.validationAttempt += 1;
      if (Object.values(validation.value).some(Boolean)) return false;
      const trimmedHost = host.value.trim();
      const nextPort = Number(port.value);
      const nextThresholdSeconds = Number(skipThresholdSeconds.value);
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
    const submittedPassword = shouldEnable && Boolean(password.value);
    try {
      const result = await obs.updateObsSettings({
        ...connectionSettings,
        ...(shouldEnable && password.value ? { password: password.value } : {}),
      });
      if (!result) throw new Error('settings save unconfirmed');
      if (shouldEnable) {
        if (submittedPassword) hasStoredPassword.value = true;
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
      state.saveError = '';
      state.readError = '';
      state.validated = false;
      return true;
    } catch {
      state.saveError = t('obs.messages.saveFailed');
      return false;
    } finally {
      state.isSaving = false;
    }
  }

  async function retryConnect() {
    if (state.isSaving) return false;
    state.isSaving = true;

    try {
      const result = await obs.connectObs();
      if (!result) throw new Error('connection unconfirmed');
      state.connectionError = '';
      return true;
    } catch {
      await obs.refreshObsStatus();
      if (!obs.state.error) {
        state.connectionError = t('obs.messages.connectFailed');
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

    try {
      const result = await obs.clearObsPassword();
      if (result?.hasPassword !== false) throw new Error('removal unconfirmed');
      state.passwordError = '';
      hasStoredPassword.value = false;
      password.value = '';
      return true;
    } catch {
      state.passwordError = t('obs.messages.removePasswordFailed');
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
    fieldErrors,
    validationAttempt: computed(() => state.validationAttempt),
    readError: computed(() => state.readError),
    saveError: computed(() => state.saveError),
    passwordError: computed(() => state.passwordError),
    connectionError: computed(() =>
      obs.state.error || obs.state.observed?.lifecycle === 'ready'
        ? ''
        : state.connectionError,
    ),
    error: computed(
      () =>
        state.readError ||
        Object.values(fieldErrors.value).find(Boolean) ||
        state.saveError ||
        state.passwordError ||
        state.connectionError,
    ),
    refreshSettings,
    refreshStatus: obs.refreshObsStatus,
    save,
    retryConnect,
    clearPassword,
  };
}

export function useObsIntegrationSettings() {
  const obs = useObsIntegration();
  if (!sessions.has(obs.state))
    sessions.set(obs.state, createSettingsOwner(obs));
  const owner = sessions.get(obs.state);
  if (getCurrentScope())
    onScopeDispose(() => {
      owner.password.value = '';
    });
  return owner;
}
