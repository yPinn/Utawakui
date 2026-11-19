import {
  companion,
  companionStatus,
  deviceLabel,
  pairingCode,
} from './bootstrap.js';
import { createApp, shallowRef } from 'vue';
import CompanionApp from '../../companion/CompanionApp.vue';
import { registerRendererSurfaceRoot } from '../../utils/rendererSurfaceRegistry.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import '../../styles/tokens.css';
import '../../styles/base.css';

document.documentElement.lang = UI_LOCALE;
const surfaceRoot = registerRendererSurfaceRoot('performer');
const matchCode = shallowRef('');
createApp(CompanionApp, {
  status: companionStatus,
  matchCode,
  remote: { sendCommand: companion.sendCommand, resume: companion.resume },
}).mount(surfaceRoot);

async function start() {
  if (pairingCode) {
    companionStatus.value = 'pairing';
    const result = await companion
      .pair(pairingCode, deviceLabel(), {
        onMatchCode: (code) => {
          matchCode.value = code;
          companionStatus.value = 'awaiting-approval';
        },
      })
      .catch(() => ({
        ok: false,
        status: 'pairing-failed',
      }));
    matchCode.value = '';
    if (!result.ok) {
      companionStatus.value = ['pairing-denied', 'pairing-busy'].includes(
        result.status,
      )
        ? result.status
        : 'pairing-failed';
      return;
    }
  }
  companion.connect();
}

void start();
