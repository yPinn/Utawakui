import { shallowRef } from 'vue';
import { normalizeOutputLocalFonts } from '../../utils/outputLocalFonts.js';

function browserLocalFontQuery() {
  return typeof window === 'undefined' ||
    typeof window.queryLocalFonts !== 'function'
    ? undefined
    : window.queryLocalFonts.bind(window);
}

export function createLocalFontsCatalog({
  getQueryLocalFonts = browserLocalFontQuery,
} = {}) {
  const fonts = shallowRef([]);
  const status = shallowRef('idle');
  const error = shallowRef('');

  async function load() {
    const queryLocalFonts = getQueryLocalFonts();
    if (typeof queryLocalFonts !== 'function') {
      status.value = 'unsupported';
      fonts.value = [];
      return;
    }

    status.value = 'loading';
    error.value = '';
    try {
      const result = await queryLocalFonts();
      fonts.value = normalizeOutputLocalFonts(Array.from(result ?? []));
      status.value = 'ready';
    } catch (cause) {
      fonts.value = [];
      if (['NotAllowedError', 'SecurityError'].includes(cause?.name)) {
        status.value = 'denied';
        return;
      }
      status.value = 'error';
      error.value = '目前無法讀取本機字體，請再試一次。';
    }
  }

  return { error, fonts, load, status };
}

export function useLocalFonts() {
  return createLocalFontsCatalog();
}
