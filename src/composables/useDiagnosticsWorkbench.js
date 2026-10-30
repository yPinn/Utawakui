import { reactive, readonly } from 'vue';
import {
  parseDiagnosticsBundle,
  TRIAGE_STATUSES,
} from '../utils/diagnosticIssues.js';

// Same real cap as diagnosticsHandlers.js's MAX_RECENT_LIMIT — the workbench
// reads the full stored/normalized event (level/source/operation/code/
// context/stack), unlike the Settings surface's count-only public
// projection. Dev-only reader; see docs/adr/0008 for why the ordinary UI
// must stay count-only.
const RECENT_LIMIT = 500;
// Dev-only, per-machine triage marks keyed by issue fingerprint.
const TRIAGE_STORAGE_KEY = 'utawakui.dev.diagnosticsTriage';

function readTriage() {
  try {
    const parsed = JSON.parse(
      globalThis.localStorage?.getItem(TRIAGE_STORAGE_KEY) ?? '{}',
    );
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const state = reactive({
  events: [],
  isLoading: false,
  error: null,
  // null = this machine's live records; otherwise the loaded file name.
  bundleName: null,
  triage: readTriage(),
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
    state.bundleName = null;
    return true;
  } catch {
    state.error = '無法讀取錯誤紀錄，請稍後再試一次。';
    return false;
  } finally {
    state.isLoading = false;
  }
}

// The file is chosen in a main-owned dialog; only its name and text return.
async function openBundle() {
  const openDiagnosticsBundle = bridgeMethod('openDiagnosticsBundle');
  if (!openDiagnosticsBundle) {
    state.error = '重新啟動後即可載入匯出檔。';
    return false;
  }
  let result;
  try {
    result = await openDiagnosticsBundle();
  } catch {
    result = { ok: false };
  }
  if (result?.ok && result.cancelled) return false;
  const events = result?.ok ? parseDiagnosticsBundle(result.text) : null;
  if (!events) {
    state.error = result?.ok
      ? '這個檔案不是錯誤紀錄匯出檔。'
      : '無法讀取這個檔案。';
    return false;
  }
  state.events = events;
  state.bundleName = result.name;
  state.error = null;
  return true;
}

function setTriage(fingerprint, status) {
  if (!TRIAGE_STATUSES.includes(status)) return;
  if (status === 'open') delete state.triage[fingerprint];
  else state.triage[fingerprint] = status;
  try {
    globalThis.localStorage?.setItem(
      TRIAGE_STORAGE_KEY,
      JSON.stringify(state.triage),
    );
  } catch {
    // Storage is a convenience; the in-memory mark still applies.
  }
}

function triageOf(fingerprint) {
  return state.triage[fingerprint] ?? 'open';
}

export function useDiagnosticsWorkbench() {
  return {
    state: readonly(state),
    refresh,
    openBundle,
    setTriage,
    triageOf,
  };
}
