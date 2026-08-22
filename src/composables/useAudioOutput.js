import { computed, shallowRef, watch } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { usePlayer } from './usePlayer.js';
import { shortenDeviceLabel } from '../utils/audioDeviceLabel.js';

// Module-scope singleton, same pattern as useTheme.js/useSidebarWidth.js —
// one capture output device applies to the whole app, not per-component
// state. Owns device enumeration/selection; usePlayer.js owns the actual
// audio graph (applyCaptureDevice) and stays free of any Web
// MediaDevices/settings concerns.

const { state: playerState, applyCaptureDevice } = usePlayer();
const { recordError } = useAppDiagnostics();

const devices = shallowRef([]);
const captureErrorNotice = shallowRef(null);

watch(
  () => playerState.captureError,
  (error) => {
    if (!error) {
      captureErrorNotice.value = null;
      return;
    }

    const technicalError =
      error instanceof Error ? error : new Error(String(error));
    const selectionWasCleared = !playerState.captureDeviceId;
    captureErrorNotice.value = recordError(technicalError, {
      code: selectionWasCleared
        ? 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE'
        : 'AUDIO_OUTPUT_PROCESSING_FAILED',
      severity: 'error',
      title: selectionWasCleared
        ? '擷取輸出裝置無法使用'
        : '擷取輸出暫時無法使用',
      message: selectionWasCleared
        ? '先前的擷取輸出裝置已無法使用，已關閉擷取輸出。'
        : '擷取輸出暫時無法使用，請重新選擇裝置。',
      actionLabel: '重新選擇裝置',
      source: 'audio-output',
      operation: 'apply-capture-device',
      context: { retryable: true },
    });
  },
  { immediate: true },
);

// The monitor (headphone) chain in usePlayer.js never calls setSinkId() —
// it always plays through whatever the OS's current default output device
// is, unlike the capture chain above which the user explicitly targets.
// This resolves that device's real name so UI referring to "no capture
// device selected" can say what it actually plays through instead of
// assuming headphones. Falls back to a generic label before enumeration
// resolves or if the platform never surfaces a 'default' entry.
const monitorDeviceLabel = computed(() => {
  const device = devices.value.find((d) => d.deviceId === 'default');
  return shortenDeviceLabel(device?.label) || '系統預設輸出';
});

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices.value = all.filter((d) => d.kind === 'audiooutput');
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_LIST_FAILED',
      title: '輸出裝置讀取失敗',
      message: '目前無法讀取輸出裝置，請再試一次。',
      actionLabel: '重試',
      source: 'audio-output',
      operation: 'list-devices',
      context: { retryable: true },
    });
  }
}

if (navigator.mediaDevices) {
  refreshDevices();
  // A virtual audio cable being installed/removed while Settings is open
  // should update the picker without the user needing to reopen the app.
  navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
}

// Optimistic persist, same shape as useTheme.js's toggleTheme: apply to the
// live audio graph first (so the UI reflects it immediately, including any
// applyCaptureDevice failure via playerState.captureError), then persist.
// A rejected persist surfaces as an unhandled rejection while the graph
// stays on the new device, same tradeoff useTheme.js already accepts.
async function selectDevice(deviceId) {
  try {
    await applyCaptureDevice(deviceId);
    await window.Utawakui?.setCaptureDevice(playerState.captureDeviceId);
    return Boolean(playerState.captureDeviceId === deviceId || !deviceId);
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_SAVE_FAILED',
      title: '輸出裝置未儲存',
      message: '輸出裝置未儲存，請重新選擇。',
      actionLabel: '重新選擇裝置',
      source: 'audio-output',
      operation: 'save-device',
      context: { retryable: true },
    });
    return false;
  }
}

// Restores the persisted device on startup. Called once from App.vue,
// mirroring useTheme()'s bare useTheme() call for the same reason — this
// module's own top-level code only sets up enumeration, not playback, so
// something has to explicitly kick off the initial applyCaptureDevice().
async function restoreInitialDevice() {
  const deviceId = window.Utawakui?.initialCaptureDeviceId ?? null;
  if (!deviceId) return;
  try {
    await applyCaptureDevice(deviceId);
    if (!playerState.captureDeviceId) {
      await window.Utawakui?.setCaptureDevice(null);
    }
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_RESTORE_FAILED',
      title: '輸出裝置未恢復',
      message: '先前的輸出裝置無法使用，請重新選擇。',
      actionLabel: '重新選擇裝置',
      source: 'audio-output',
      operation: 'restore-device',
      context: { retryable: true },
    });
  }
}

export function useAudioOutput() {
  return {
    devices,
    monitorDeviceLabel,
    captureErrorNotice,
    selectDevice,
    restoreInitialDevice,
  };
}
