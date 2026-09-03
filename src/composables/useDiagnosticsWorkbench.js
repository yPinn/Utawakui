import { reactive, readonly } from 'vue';

// Same real cap as diagnosticsHandlers.js's MAX_RECENT_LIMIT — the workbench
// reads the full stored/normalized event (level/source/operation/code/
// context/stack), unlike the Settings surface's count-only public
// projection. Dev-only reader; see docs/adr/0008 for why the ordinary UI
// must stay count-only.
const RECENT_LIMIT = 500;

const state = reactive({
  events: [],
  isLoading: false,
  error: null,
});

function bridgeMethod(name) {
  const method = globalThis.window?.Utawakui?.[name];
  return typeof method === 'function' ? method : null;
}

async function refresh() {
  const listRecentDiagnostics = bridgeMethod('listRecentDiagnostics');
  if (!listRecentDiagnostics) {
    state.error = '重新啟動後即可讀取錯誤紀錄。';
    return false;
  }

  state.isLoading = true;
  state.error = null;
  try {
    const events = await listRecentDiagnostics(RECENT_LIMIT);
    state.events = Array.isArray(events) ? events : [];
    return true;
  } catch {
    state.error = '無法讀取錯誤紀錄，請稍後再試一次。';
    return false;
  } finally {
    state.isLoading = false;
  }
}

export function useDiagnosticsWorkbench() {
  return {
    state: readonly(state),
    refresh,
  };
}
