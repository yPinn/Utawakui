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
const lightTheme = window.matchMedia('(prefers-color-scheme: light)');
const surfaceRoot = registerRendererSurfaceRoot('performer');
const themeColor = document.querySelector('meta[name="theme-color"]');
function syncTheme() {
  document.documentElement.dataset.uiTheme = lightTheme.matches
    ? 'light'
    : 'dark';
  const surface = getComputedStyle(surfaceRoot)
    .getPropertyValue('--ui-color-surface')
    .trim();
  if (surface) {
    themeColor.content = surface;
    document.documentElement.style.backgroundColor = surface;
  }
}
syncTheme();
lightTheme.addEventListener('change', syncTheme);
const matchCode = shallowRef('');
createApp(CompanionApp, {
  status: companionStatus,
  matchCode,
  remote: companion,
}).mount(surfaceRoot);

async function start() {
  if (pairingCode) {
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
