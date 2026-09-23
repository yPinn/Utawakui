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
  if (unsubscribe || !hasBridge('onSystemUsage')) return;
  unsubscribe = window.Utawakui.onSystemUsage(applyStatus);
}

// Best-effort: on failure, the titlebar just keeps showing the last known
// value (or the initial placeholder) instead of throwing.
async function refreshSystemUsage() {
  ensureSubscription();
  if (!hasBridge('getSystemUsage')) return;
  try {
    applyStatus(await window.Utawakui.getSystemUsage());
  } catch {
    // no-op
  }
}

export function useSystemUsage() {
  ensureSubscription();
  return { state: readonly(state), refreshSystemUsage };
}
