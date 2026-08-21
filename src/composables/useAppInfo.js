import { reactive, readonly } from 'vue';
import { appErrorMessage } from '../utils/appErrors.js';

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
    state.error = appErrorMessage(error);
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
