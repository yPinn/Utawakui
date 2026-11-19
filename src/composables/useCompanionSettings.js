import { readonly, shallowRef } from 'vue';

function resolveBridge(bridge) {
  return bridge ?? globalThis.window?.Utawakui;
}

// Settings owner for the paired-phone listener. Main owns every decision;
// this only mirrors status and forwards bounded intents.
export function useCompanionSettings(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const status = shallowRef(null);
  const busy = shallowRef(false);
  const error = shallowRef('');
  const pairing = shallowRef(null);
  let unsubscribe = null;
  // Several views can share one instance; the listener lives while any uses it.
  let users = 0;

  async function refresh() {
    try {
      const result = await bridge.getCompanionStatus();
      if (result?.ok) {
        const next = { ...result };
        delete next.ok;
        status.value = next;
        if (!next.pairing?.pending) pairing.value = null;
        return true;
      }
    } catch {
      /* Shown as unreadable below. */
    }
    error.value = 'read-failed';
    return false;
  }

  async function act(action) {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    try {
      const result = await action();
      if (!result?.ok) {
        error.value = result?.status ?? 'failed';
        return false;
      }
      return result;
    } catch {
      error.value = 'failed';
      return false;
    } finally {
      busy.value = false;
      // The reply already carries what the caller needs (a new code shows
      // at once); the full status follows in the background.
      void refresh();
    }
  }

  function start() {
    users += 1;
    unsubscribe ??= bridge?.onCompanionStatusChanged?.(() => void refresh());
    return refresh();
  }

  function stop() {
    users = Math.max(0, users - 1);
    if (users) return;
    unsubscribe?.();
    unsubscribe = null;
  }

  return {
    status: readonly(status),
    busy: readonly(busy),
    error: readonly(error),
    pairing: readonly(pairing),
    start,
    stop,
    refresh,
    configure: (input) => act(() => bridge.configureCompanion(input)),
    async beginPairing() {
      const result = await act(() => bridge.beginCompanionPairing());
      if (result)
        pairing.value = { url: result.url, expiresAt: result.expiresAt };
      return Boolean(result);
    },
    async cancelPairing() {
      pairing.value = null;
      try {
        const result = await bridge.cancelCompanionPairing();
        if (result?.ok) return true;
        error.value = result?.status ?? 'failed';
      } catch {
        error.value = 'failed';
      } finally {
        void refresh();
      }
      return false;
    },
    approve: (requestId) =>
      act(() => bridge.approveCompanionPairing(requestId)),
    deny: (requestId) => act(() => bridge.denyCompanionPairing(requestId)),
    revoke: (deviceId) => act(() => bridge.revokeCompanionDevice(deviceId)),
    revokeAll: () => act(() => bridge.revokeAllCompanionDevices()),
    rename: (deviceId, label) =>
      act(() => bridge.renameCompanionDevice(deviceId, label)),
  };
}

let shared = null;

// One mirror for the whole renderer, so an approval raised while Settings is
// closed still reaches the App-level dialog.
export function useSharedCompanion() {
  shared ??= useCompanionSettings();
  return shared;
}
