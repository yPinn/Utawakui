import {
  companion,
  companionStatus,
  deviceLabel,
  pairingCode,
} from './bootstrap.js';
import { createApp } from 'vue';
import CompanionApp from '../../companion/CompanionApp.vue';
import { registerRendererSurfaceRoot } from '../../utils/rendererSurfaceRegistry.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import '../../styles/tokens.css';
import '../../styles/base.css';

document.documentElement.lang = UI_LOCALE;
const surfaceRoot = registerRendererSurfaceRoot('performer');
createApp(CompanionApp, { status: companionStatus }).mount(surfaceRoot);

async function start() {
  if (pairingCode) {
    companionStatus.value = 'pairing';
    const result = await companion
      .pair(pairingCode, deviceLabel())
      .catch(() => ({
        ok: false,
        status: 'pairing-failed',
      }));
    if (!result.ok) {
      companionStatus.value =
        result.status === 'devices-full' ? 'devices-full' : 'pairing-failed';
      return;
    }
  }
  companion.connect();
}

void start();
