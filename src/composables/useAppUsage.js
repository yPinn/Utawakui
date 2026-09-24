import { reactive, readonly } from 'vue';

// Module-scope singleton, same pattern as useAppUpdate.js — one sampling
// subscription applies to the whole app, not per-component.

const state = reactive({
  cpuPercent: null,
  ramPercent: null,
});

let unsubscribe = null;

function hasBridge(method) {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.[method] === 'function'
  );
}

function applyStatus(status) {
  state.cpuPercent = Number.isFinite(status?.cpuPercent)
    ? status.cpuPercent
    : null;
  state.ramPercent = Number.isFinite(status?.ramPercent)
    ? status.ramPercent
    : null;
}

function ensureSubscription() {
  if (unsubscribe || !hasBridge('onAppUsage')) return;
  unsubscribe = window.Utawakui.onAppUsage(applyStatus);
}

// Best-effort: on failure, the titlebar just keeps showing the last known
// value (or the initial placeholder) instead of throwing.
async function refreshAppUsage() {
  ensureSubscription();
  if (!hasBridge('getAppUsage')) return;
  try {
    applyStatus(await window.Utawakui.getAppUsage());
  } catch {
    // no-op
  }
}

export function useAppUsage() {
  ensureSubscription();
  return { state: readonly(state), refreshAppUsage };
}
