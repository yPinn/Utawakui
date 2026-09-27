import { computed, shallowRef, watch } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { usePlayer } from './usePlayer.js';
import { shortenDeviceLabel } from '../utils/audioDeviceLabel.js';

// Module-scope singleton, same pattern as useTheme.js/useSidebarWidth.js —
// one capture output device applies to the whole app, not per-component
// state. Owns device enumeration/selection; usePlayer.js owns the actual
// audio graph (applyCaptureDevice) and stays free of any Web
// MediaDevices/settings concerns.

const {
  state: playerState,
  applyCaptureDevice,
  prepareCaptureDevice,
} = usePlayer();
const { recordError } = useAppDiagnostics();

const devices = shallowRef([]);
const captureErrorNotice = shallowRef(null);

function recordCaptureUnavailable(error) {
  const technicalError =
    error instanceof Error ? error : new Error(String(error));
  return recordError(technicalError, {
    code: 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
    severity: 'error',
    title: '擷取輸出已關閉',
    message: '先前的裝置無法使用。',
    actionLabel: '選擇裝置',
    source: 'audio-output',
    operation: 'apply-capture-device',
    context: { retryable: true },
  });
}

async function clearPersistedCaptureDevice() {
  try {
    await window.Utawakui?.setCaptureDevice(null);
    return true;
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_SAVE_FAILED',
      severity: 'error',
      title: '裝置設定未清除',
      message: '擷取已停止。請選擇其他裝置。',
      actionLabel: '選擇裝置',
      source: 'audio-output',
      operation: 'clear-device',
      context: { retryable: true },
    });
    return false;
  }
}

watch(
  () => playerState.captureError,
  async (error) => {
    if (!error) {
      captureErrorNotice.value = null;
      return;
    }

    const technicalError =
      error instanceof Error ? error : new Error(String(error));
    const selectionWasCleared = !playerState.captureDeviceId;
    captureErrorNotice.value = selectionWasCleared
      ? recordCaptureUnavailable(technicalError)
      : recordError(technicalError, {
          code: 'AUDIO_OUTPUT_PROCESSING_FAILED',
          severity: 'error',
          title: '擷取輸出中斷',
          message: '請選擇其他裝置。',
          actionLabel: '選擇裝置',
          source: 'audio-output',
          operation: 'apply-capture-device',
          context: { retryable: true },
        });
    if (selectionWasCleared) {
      await clearPersistedCaptureDevice();
    }
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
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices.value = all.filter((d) => d.kind === 'audiooutput');
    return true;
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_LIST_FAILED',
      title: '無法讀取輸出裝置',
      message: '請再試一次。',
      actionLabel: '重試',
      source: 'audio-output',
      operation: 'list-devices',
      context: { retryable: true },
    });
    return false;
  }
}

let initialDeviceRefresh = Promise.resolve(false);
if (navigator.mediaDevices) {
  initialDeviceRefresh = refreshDevices();
  // A virtual audio cable being installed/removed while Settings is open
  // should update the picker without the user needing to reopen the app.
  navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
}

// Explicit selections are applied to the live graph first, then persisted.
// Startup restoration takes the separate prepare-only path below so merely
// opening the app never starts a native capture renderer.
async function selectDevice(deviceId) {
  try {
    await applyCaptureDevice(deviceId);
    await window.Utawakui?.setCaptureDevice(playerState.captureDeviceId);
    const selected = Boolean(
      playerState.captureDeviceId === deviceId || !deviceId,
    );
    if (selected) captureErrorNotice.value = null;
    return selected;
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_SAVE_FAILED',
      title: '裝置未儲存',
      message: '請重新選擇。',
      actionLabel: '選擇裝置',
      source: 'audio-output',
      operation: 'save-device',
      context: { retryable: true },
    });
    return false;
  }
}

// Validates the persisted preference on startup, but only prepares it. The
// player activates the native capture graph on first playback. Missing
// devices fail closed to capture-off and are removed from main config.
async function restoreInitialDevice() {
  const deviceId = window.Utawakui?.initialCaptureDeviceId ?? null;
  if (!deviceId) return;
  const deviceListAvailable = await initialDeviceRefresh;
  if (!deviceListAvailable) return;
  const deviceStillExists = devices.value.some(
    (device) => device.deviceId === deviceId,
  );
  if (!deviceStillExists) {
    captureErrorNotice.value = recordCaptureUnavailable(
      new Error('Persisted capture output device is unavailable.'),
    );
    await clearPersistedCaptureDevice();
    return;
  }
  try {
    const prepared = prepareCaptureDevice(deviceId);
    if (!prepared || !playerState.captureDeviceId) {
      await clearPersistedCaptureDevice();
    }
  } catch (error) {
    captureErrorNotice.value = recordError(error, {
      code: 'AUDIO_OUTPUT_RESTORE_FAILED',
      title: '先前的裝置無法使用',
      message: '請選擇其他裝置。',
      actionLabel: '選擇裝置',
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
