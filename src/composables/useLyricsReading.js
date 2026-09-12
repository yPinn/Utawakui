import { reactive, readonly, shallowRef } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

// Single shared instance (module scope, not per-component), same as
// useSeparation.js/usePlayer.js: LyricsWorkspace unmounts on every tab
// switch, so state kept in component refs would appear to vanish mid-run
// even though a generation worker keeps going on the main process.
const { recordError } = useAppDiagnostics();

const READING_SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_READING_ID_LENGTH = 200;
const MAX_READING_LINES = 10_000;
const MAX_READING_LINE_TEXT_LENGTH = 10_000;

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
const loadRevisions = new Map();
const loadsInFlight = new Map();

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

async function loadReading(trackId, sourceFilename, document) {
  if (!trackId || !sourceFilename || !document) return null;
  const key = docKey(trackId, sourceFilename);
  const identity = canonicalIdentity(document);
  if (!identity) return undefined;
  // Include the bounded line map so only equivalent canonical requests share
  // a promise; a newer document for the same source must still supersede it.
  const requestKey = `${key}\0${JSON.stringify(identity)}`;
  const existingRequest = loadsInFlight.get(requestKey);
  if (existingRequest) return existingRequest;

  const revision = (loadRevisions.get(key) ?? 0) + 1;
  loadRevisions.set(key, revision);
  const request = (async () => {
    try {
      const doc = await window.Utawakui.getLyricsReading(
        trackId,
        sourceFilename,
        identity,
      );
      if (loadRevisions.get(key) !== revision)
        return getDoc(trackId, sourceFilename);
      if (doc) state.docs.set(key, doc);
      else state.docs.delete(key);
      state.errors.delete(key);
      return doc;
    } catch (err) {
      if (loadRevisions.get(key) !== revision) return undefined;
      state.docs.delete(key);
      const appError = recordError(err, {
        title: '讀取讀音資料失敗',
        message: '目前無法讀取讀音資料，請再試一次。',
        source: 'lyrics-reading',
        operation: 'get',
        context: { trackId, sourceFilename },
      });
      state.errors.set(key, appError.message);
      return undefined;
    }
  })();
  loadsInFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (loadsInFlight.get(requestKey) === request) {
      loadsInFlight.delete(requestKey);
    }
  }
}

function canonicalIdentity(document, targetLineId = null) {
  const documentId = document?.documentId;
  const normalizerProfileId = document?.normalizerProfileId;
  const sourceFingerprint = document?.source?.sha256;
  const sourceLines = document?.lines;
  if (
    typeof documentId !== 'string' ||
    documentId.length === 0 ||
    documentId.length > MAX_READING_ID_LENGTH ||
    typeof normalizerProfileId !== 'string' ||
    normalizerProfileId.length === 0 ||
    normalizerProfileId.length > MAX_READING_ID_LENGTH ||
    !READING_SHA256_RE.test(sourceFingerprint) ||
    !Array.isArray(sourceLines) ||
    sourceLines.length > MAX_READING_LINES
  ) {
    return null;
  }

  const lineIds = new Set();
  const lines = [];
  for (const line of sourceLines) {
    if (
      typeof line?.lineId !== 'string' ||
      line.lineId.length === 0 ||
      line.lineId.length > MAX_READING_ID_LENGTH ||
      lineIds.has(line.lineId) ||
      typeof line.text !== 'string' ||
      line.text.length > MAX_READING_LINE_TEXT_LENGTH
    ) {
      return null;
    }
    lineIds.add(line.lineId);
    lines.push({ lineId: line.lineId, text: line.text });
  }
  if (targetLineId !== null && !lineIds.has(targetLineId)) return null;

  return {
    documentId,
    normalizerProfileId,
    sourceFingerprint,
    lines,
    ...(targetLineId !== null ? { targetLineId } : {}),
  };
}

async function generateReading(trackId, sourceFilename, document, script) {
  const identity = canonicalIdentity(document);
  if (!trackId || !sourceFilename || !identity) return undefined;
  const key = docKey(trackId, sourceFilename);
  if (state.inFlight.has(key)) return;
  state.errors.delete(key);
  state.inFlight.add(key);
  try {
    const doc = await window.Utawakui.generateLyricsReading(
      trackId,
      sourceFilename,
      identity,
      script,
    );
    loadRevisions.set(key, (loadRevisions.get(key) ?? 0) + 1);
    state.docs.set(key, doc);
  } catch (err) {
    const appError = recordError(err, {
      title: '產生讀音失敗',
      message: '讀音未產生，請再試一次。',
      source: 'lyrics-reading',
      operation: 'generate',
      context: { trackId, sourceFilename },
    });
    state.errors.set(key, appError.message);
  } finally {
    state.inFlight.delete(key);
  }
}

async function setReadingLine(
  trackId,
  sourceFilename,
  document,
  lineId,
  readingKana,
) {
  const identity = canonicalIdentity(document, lineId);
  if (!trackId || !sourceFilename || !identity) return undefined;
  const key = docKey(trackId, sourceFilename);
  try {
    const doc = await window.Utawakui.setLyricsReadingLine(
      trackId,
      sourceFilename,
      identity,
      readingKana,
    );
    loadRevisions.set(key, (loadRevisions.get(key) ?? 0) + 1);
    state.docs.set(key, doc);
    state.errors.delete(key);
  } catch (err) {
    const appError = recordError(err, {
      title: '修改讀音失敗',
      message: '讀音未儲存，請再試一次。',
      source: 'lyrics-reading',
      operation: 'set-line',
      context: { trackId, sourceFilename, lineId },
    });
    state.errors.set(key, appError.message);
  }
}

async function deleteReading(trackId, sourceFilename) {
  const key = docKey(trackId, sourceFilename);
  try {
    await window.Utawakui.deleteLyricsReading(trackId, sourceFilename);
    loadRevisions.set(key, (loadRevisions.get(key) ?? 0) + 1);
    state.docs.delete(key);
    state.errors.delete(key);
  } catch (err) {
    recordError(err, {
      title: '刪除讀音失敗',
      message: '目前無法刪除讀音，請再試一次。',
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
