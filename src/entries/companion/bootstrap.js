// Runs before any module reads the UI locale: installs the companion bridge
// as the performer bridge and derives the language from the phone browser.
import { shallowRef } from 'vue';
import {
  createCompanionBridge,
  takePairingCode,
} from '../../companion/companionBridge.js';

export const companionStatus = shallowRef('connecting');
export const pairingCode = takePairingCode(window.location, window.history);

export const companion = createCompanionBridge({
  location: window.location,
  storage: globalThis.localStorage,
  onStatus: (status) => {
    companionStatus.value = status;
  },
});

const language = String(globalThis.navigator?.language ?? '').toLowerCase();
window.UtawakuiPerformer = {
  ...companion.performerBridge,
  initialUiLocale: language.startsWith('zh') ? 'zh-TW' : 'en-US',
};

export function deviceLabel() {
  const agent = String(globalThis.navigator?.userAgent ?? '');
  if (/iPhone/u.test(agent)) return 'iPhone';
  if (/iPad/u.test(agent)) return 'iPad';
  if (/Android/u.test(agent)) return 'Android';
  return 'Phone';
}
