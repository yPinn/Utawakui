import { shallowRef } from 'vue';
import { t } from '../utils/i18n.js';

export const pairingReturnSessionId = shallowRef(null);

export async function platformVideoRequest(method, ...args) {
  try {
    const response = await window.Utawakui[method](...args);
    if (response?.ok === true || response?.error?.message) return response;
  } catch {
    // Unexpected bridge errors are diagnosed in Main.
  }
  return { ok: false, error: { message: t('platformVideo.fallbackError') } };
}
