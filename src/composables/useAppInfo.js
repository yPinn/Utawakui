import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { t } from '../utils/i18n.js';

const { recordError } = useAppDiagnostics();

const state = reactive({
  currentVersion: '',
  isLoading: false,
  error: null,
});

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.getAppVersion === 'function'
  );
}

async function refreshAppInfo() {
  if (!hasBridge()) {
    state.error = t('settings.appInfo.restart');
    return;
  }

  state.isLoading = true;
  try {
    const version = await window.Utawakui.getAppVersion();
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error('invalid app version');
    }
    state.currentVersion = version;
    state.error = null;
  } catch (error) {
    state.error = recordError(error, {
      code: 'APP_INFO_READ_FAILED',
      title: t('settings.appInfo.failedTitle'),
      message: t('settings.appInfo.failed'),
      source: 'app-info',
      operation: 'refresh',
    }).message;
  } finally {
    state.isLoading = false;
  }
}

export function useAppInfo() {
  return {
    state: readonly(state),
    refreshAppInfo,
  };
}
