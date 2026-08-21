import { reactive, readonly, shallowRef } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

// Single shared instance (module scope, not per-component), same as
// useSeparation.js/usePlayer.js: LyricsWorkspace unmounts on every tab
// switch, so state kept in component refs would appear to vanish mid-run
// even though a generation worker keeps going on the main process.
const { recordError } = useAppDiagnostics();

function docKey(trackId, sourceFilename) {
  return `${trackId}::${sourceFilename}`;
}

const state = reactive({
  // `${trackId}::${sourceFilename}` -> reading doc ({ lines, ... }) or
  // absent (never fetched / no reading exists).
  docs: new Map(),
  inFlight: new Set(),
  errors: new Map(),
});

// Which display variant is selected — lives here rather than in
// LyricsWorkspace's own refs so switching tabs and back doesn't reset it.
const variant = shallowRef('off'); // 'off' | 'furigana' | 'romaji'

let unsubscribeProgress = null;
if (
  typeof window !== 'undefined' &&
  typeof window.Utawakui?.onLyricsReadingProgress === 'function'
) {
  // Per-line stage events, not a percent — inFlight membership alone drives
  // the button state today. Subscribed so a future progress indicator has
  // something to hook without another IPC round trip.
  unsubscribeProgress = window.Utawakui.onLyricsReadingProgress(() => {});
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeProgress?.();
  });
}

function getDoc(trackId, sourceFilename) {
  return state.docs.get(docKey(trackId, sourceFilename)) ?? null;
}

function isGenerating(trackId, sourceFilename) {
  return state.inFlight.has(docKey(trackId, sourceFilename));
}

function errorFor(trackId, sourceFilename) {
  return state.errors.get(docKey(trackId, sourceFilename)) ?? null;
}

async function loadReading(trackId, sourceFilename) {
  if (!trackId || !sourceFilename) return null;
  const key = docKey(trackId, sourceFilename);
  try {
    const doc = await window.Utawakui.getLyricsReading(trackId, sourceFilename);
    if (doc) state.docs.set(key, doc);
    else state.docs.delete(key);
    return doc;
  } catch (err) {
    recordError(err, {
      title: '讀取讀音資料失敗',
      source: 'lyrics-reading',
      operation: 'get',
      context: { trackId, sourceFilename },
    });
    return null;
  }
}

async function generateReading(trackId, sourceFilename, lines, script) {
  const key = docKey(trackId, sourceFilename);
  if (state.inFlight.has(key)) return;
  state.errors.delete(key);
  state.inFlight.add(key);
  try {
    const doc = await window.Utawakui.generateLyricsReading(
      trackId,
      sourceFilename,
      lines,
      script,
    );
    state.docs.set(key, doc);
  } catch (err) {
    const appError = recordError(err, {
      title: '產生讀音失敗',
      source: 'lyrics-reading',
      operation: 'generate',
      context: { trackId, sourceFilename },
    });
    state.errors.set(key, appError.message);
  } finally {
    state.inFlight.delete(key);
  }
}

async function setReadingLine(trackId, sourceFilename, lineIndex, readingKana) {
  const key = docKey(trackId, sourceFilename);
  try {
    const doc = await window.Utawakui.setLyricsReadingLine(
      trackId,
      sourceFilename,
      lineIndex,
      readingKana,
    );
    state.docs.set(key, doc);
    state.errors.delete(key);
  } catch (err) {
    const appError = recordError(err, {
      title: '修改讀音失敗',
      source: 'lyrics-reading',
      operation: 'set-line',
      context: { trackId, sourceFilename, lineIndex },
    });
    state.errors.set(key, appError.message);
  }
}

async function deleteReading(trackId, sourceFilename) {
  const key = docKey(trackId, sourceFilename);
  try {
    await window.Utawakui.deleteLyricsReading(trackId, sourceFilename);
    state.docs.delete(key);
    state.errors.delete(key);
  } catch (err) {
    recordError(err, {
      title: '刪除讀音失敗',
      source: 'lyrics-reading',
      operation: 'delete',
      context: { trackId, sourceFilename },
    });
  }
}

function setVariant(next) {
  variant.value = next;
}

export function useLyricsReading() {
  return {
    state: readonly(state),
    variant,
    getDoc,
    isGenerating,
    errorFor,
    loadReading,
    generateReading,
    setReadingLine,
    deleteReading,
    setVariant,
  };
}
