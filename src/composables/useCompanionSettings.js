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
      await refresh();
    }
  }

  function start() {
    unsubscribe ??= bridge?.onCompanionStatusChanged?.(() => void refresh());
    return refresh();
  }

  function stop() {
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
      return act(() => bridge.cancelCompanionPairing());
    },
    revoke: (deviceId) => act(() => bridge.revokeCompanionDevice(deviceId)),
    revokeAll: () => act(() => bridge.revokeAllCompanionDevices()),
  };
}
