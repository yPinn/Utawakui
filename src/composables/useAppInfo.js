import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

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
    state.error = '需要重新啟動應用程式才能讀取版本資訊。';
    return;
  }

  state.isLoading = true;
  try {
    const version = await window.Utawakui.getAppVersion();
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error('版本資訊格式不正確');
    }
    state.currentVersion = version;
    state.error = null;
  } catch (error) {
    state.error = recordError(error, {
      code: 'APP_INFO_READ_FAILED',
      title: '版本資訊讀取失敗',
      message: '目前無法讀取版本資訊，請稍後再試。',
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
