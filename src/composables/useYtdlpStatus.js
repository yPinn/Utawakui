import { reactive, readonly } from 'vue';

const state = reactive({
  version: null,
  binaryFound: false,
  lastCheckedAt: null,
  lastCheckResult: null,
  isLoading: false,
  isChecking: false,
  error: '',
});

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.getYtdlpStatus === 'function'
  );
}

function applyStatus(status) {
  state.version = status?.version ?? null;
  state.binaryFound = Boolean(status?.binaryFound);
  state.lastCheckedAt = status?.lastCheckedAt ?? null;
  state.lastCheckResult = status?.lastCheckResult ?? null;
}

async function refreshStatus() {
  if (!hasBridge()) {
    state.error = '需要重新啟動應用程式才能讀取 yt-dlp 狀態。';
    return;
  }

  state.isLoading = true;
  try {
    applyStatus(await window.Utawakui.getYtdlpStatus());
    state.error = '';
  } catch (err) {
    state.error = `讀取 yt-dlp 狀態失敗：${err.message}`;
  } finally {
    state.isLoading = false;
  }
}

async function checkForUpdate() {
  if (!hasBridge() || state.isChecking) return;

  state.isChecking = true;
  try {
    applyStatus(await window.Utawakui.checkYtdlpUpdate());
    state.error = '';
  } catch (err) {
    state.error = `檢查更新失敗：${err.message}`;
  } finally {
    state.isChecking = false;
  }
}

export function useYtdlpStatus() {
  return {
    state: readonly(state),
    refreshStatus,
    checkForUpdate,
  };
}
