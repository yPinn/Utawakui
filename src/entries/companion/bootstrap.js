// Installs the phone transport as the shared performer bridge.
import { shallowRef } from 'vue';
import {
  createCompanionBridge,
  takePairingCode,
} from '../../companion/companionBridge.js';

export const pairingCode = takePairingCode(window.location, window.history);
export const companionStatus = shallowRef(pairingCode ? 'pairing' : 'unpaired');

export const companion = createCompanionBridge({
  location: window.location,
  storage: globalThis.localStorage,
  onStatus: (status) => {
    companionStatus.value = status;
  },
});
if (!pairingCode && companion.hasCredential())
  companionStatus.value = 'connecting';

window.UtawakuiPerformer = companion.performerBridge;

export function deviceLabel() {
  const agent = String(globalThis.navigator?.userAgent ?? '');
  if (/iPhone/u.test(agent)) return 'iPhone';
  if (/iPad/u.test(agent)) return 'iPad';
  if (/Android/u.test(agent)) return 'Android';
  return 'Phone';
}
