import { computed, ref } from 'vue';
import { usePlayer } from './usePlayer.js';
import { shortenDeviceLabel } from '../utils/audioDeviceLabel.js';

// Module-scope singleton, same pattern as useTheme.js/useSidebarWidth.js —
// one capture output device applies to the whole app, not per-component
// state. Owns device enumeration/selection; usePlayer.js owns the actual
// audio graph (applyCaptureDevice) and stays free of any Web
// MediaDevices/settings concerns.

const { state: playerState, applyCaptureDevice } = usePlayer();

const devices = ref([]);

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
  const all = await navigator.mediaDevices.enumerateDevices();
  devices.value = all.filter((d) => d.kind === 'audiooutput');
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
  await applyCaptureDevice(deviceId);
  await window.Utawakui?.setCaptureDevice(playerState.captureDeviceId);
}

// Restores the persisted device on startup. Called once from App.vue,
// mirroring useTheme()'s bare useTheme() call for the same reason — this
// module's own top-level code only sets up enumeration, not playback, so
// something has to explicitly kick off the initial applyCaptureDevice().
async function restoreInitialDevice() {
  const deviceId = window.Utawakui?.initialCaptureDeviceId ?? null;
  if (deviceId) await applyCaptureDevice(deviceId);
}

export function useAudioOutput() {
  return { devices, monitorDeviceLabel, selectDevice, restoreInitialDevice };
}
