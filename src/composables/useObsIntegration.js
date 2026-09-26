import { reactive, readonly } from 'vue';

// Module-scope singleton, same pattern as useSystemUsage.js — one OBS
// connection applies to the whole app, not per-component. Mirrors
// electron/main/obsAdapter.js's getStatus() shape exactly so this file stays
// a thin projection, not a second source of truth.
const state = reactive({
  desired: { enabled: false, host: '127.0.0.1', port: 4455 },
  observed: {
    lifecycle: 'disabled',
    obsWebSocketVersion: null,
    negotiatedRpcVersion: null,
    streaming: { active: false, timecode: null, durationMs: null },
    recording: { active: false, timecode: null, durationMs: null },
  },
  error: null,
});

let unsubscribe = null;

function hasBridge(method) {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.[method] === 'function'
  );
}

function applyStatus(status) {
  if (!status) return;
  state.desired = { ...state.desired, ...status.desired };
  state.observed = {
    ...state.observed,
    ...status.observed,
    streaming: { ...state.observed.streaming, ...status.observed?.streaming },
    recording: { ...state.observed.recording, ...status.observed?.recording },
  };
  state.error = status.error ?? null;
}

function ensureSubscription() {
  if (unsubscribe || !hasBridge('onObsStatus')) return;
  unsubscribe = window.Utawakui.onObsStatus(applyStatus);
}

async function refreshObsStatus() {
  ensureSubscription();
  if (!hasBridge('getObsStatus')) return;
  try {
    applyStatus(await window.Utawakui.getObsStatus());
  } catch {
    // no-op — state just keeps its last known value.
  }
}

async function getObsSettings() {
  if (!hasBridge('getObsSettings')) return null;
  return window.Utawakui.getObsSettings();
}

// settings may include a `password` field — write-only, never echoed back
// (see obsHandlers.js). Resolves with the fresh adapter status.
async function updateObsSettings(settings) {
  if (!hasBridge('updateObsSettings')) return null;
  const status = await window.Utawakui.updateObsSettings(settings);
  applyStatus(status);
  return status;
}

async function clearObsPassword() {
  if (!hasBridge('clearObsPassword')) return null;
  return window.Utawakui.clearObsPassword();
}

async function connectObs() {
  if (!hasBridge('connectObs')) return null;
  const status = await window.Utawakui.connectObs();
  applyStatus(status);
  return status;
}

async function disconnectObs() {
  if (!hasBridge('disconnectObs')) return null;
  const status = await window.Utawakui.disconnectObs();
  applyStatus(status);
  return status;
}

// Resolves the recorded marker entry, or null when there's nothing to mark
// against (bridge unavailable, or main reports not currently live/
// recording — see sessionHistoryService.js's own addMarker()). Doesn't
// touch `state` — a marker doesn't change the connection/streaming status.
async function addMarker(label) {
  if (!hasBridge('addObsMarker')) return null;
  return window.Utawakui.addObsMarker(label);
}

// The live session if one is running, otherwise the most recently
// completed one, or null before any session has ever existed — see
// sessionHistoryService.js's getLatestSession() doc.
async function getLatestSession() {
  if (!hasBridge('getObsLatestSession')) return null;
  return window.Utawakui.getObsLatestSession();
}

export function useObsIntegration() {
  ensureSubscription();
  return {
    state: readonly(state),
    refreshObsStatus,
    getObsSettings,
    updateObsSettings,
    clearObsPassword,
    connectObs,
    disconnectObs,
    addMarker,
    getLatestSession,
  };
}
