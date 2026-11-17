'use strict';

const { hashAudioFile } = require('../works/trackBinding');
const {
  createTrackBinding,
  isStoreTrackId,
  readTrackStore,
  sha256Hex,
  writeTrackStore,
} = require('./trackSidecarStore');

const storeFile = 'track-languages.json';
const maxBatchTracks = 1000;
// Broad sung-language groups, in display order. `zxx` marks no vocals.
const LANGUAGES = Object.freeze(['zh', 'ja', 'ko', 'en', 'other', 'zxx']);
const NO_VOCALS = 'zxx';
const chineseFamily = new Set(['zh', 'cmn', 'yue', 'nan', 'hak', 'wuu', 'lzh']);

function invalid(code = 'invalid') {
  return Object.assign(
    new Error(`Invalid track language operation (${code})`),
    { languageStatus: code },
  );
}

const ordered = (codes) => LANGUAGES.filter((code) => codes.includes(code));

// Saves accept only the broad groups; no vocals excludes every language.
function languageList(languages) {
  if (
    !Array.isArray(languages) ||
    !languages.every((code) => LANGUAGES.includes(code)) ||
    new Set(languages).size !== languages.length ||
    (languages.includes(NO_VOCALS) && languages.length > 1)
  )
    throw invalid();
  return ordered(languages);
}

// Reads fold finer or unknown codes into the broad groups.
function storedGroup(code) {
  if (typeof code !== 'string' || !code) return null;
  if (LANGUAGES.includes(code)) return code;
  const language = code.split('-')[0].toLowerCase();
  return chineseFamily.has(language) ? 'zh' : 'other';
}

function readEdit(store, trackId) {
  const entry = store[trackId];
  if (entry === undefined) return null;
  if (
    typeof entry?.audioSha256 !== 'string' ||
    !sha256Hex.test(entry.audioSha256) ||
    !Array.isArray(entry.languages)
  )
    throw new Error('Invalid track language entry');
  let languages = ordered(entry.languages.map(storedGroup));
  if (languages.length > 1)
    languages = languages.filter((code) => code !== NO_VOCALS);
  return { audioSha256: entry.audioSha256, languages };
}

function createTrackLanguagesService({
  getLibraryContext,
  hashAudio = hashAudioFile,
}) {
  const { checkScope, audioBinding, editToken } = createTrackBinding({
    getLibraryContext,
    hashAudio,
    invalid,
  });
  let batching = false;
  const readStore = (dir) =>
    readTrackStore(dir, storeFile, { name: 'track language', invalid });

  function view(scope, trackId, audio, edit) {
    return {
      editToken: editToken(scope, trackId, audio, edit),
      languages: edit?.languages ?? [],
      needsReview: Boolean(edit && edit.audioSha256 !== audio),
    };
  }

  async function bound(trackId) {
    const scope = getLibraryContext();
    const audio = await audioBinding(scope, trackId);
    if (!audio) throw invalid('missing');
    checkScope(scope);
    return { scope, audio };
  }

  async function get(trackId) {
    const { scope, audio } = await bound(trackId);
    return view(scope, trackId, audio, readEdit(readStore(scope.dir), trackId));
  }

  async function save({ trackId, token, languages }) {
    if (typeof token !== 'string' || !sha256Hex.test(token)) throw invalid();
    const list = languageList(languages);
    const { scope, audio } = await bound(trackId);
    const store = readStore(scope.dir);
    if (token !== editToken(scope, trackId, audio, readEdit(store, trackId)))
      throw invalid('stale');
    if (list.length) store[trackId] = { audioSha256: audio, languages: list };
    else delete store[trackId];
    const edit = store[trackId] ? readEdit(store, trackId) : null;
    writeTrackStore(scope.dir, storeFile, store, { name: 'Track language' });
    return view(scope, trackId, audio, edit);
  }

  // Saved languages for the whole library; the audio binding is checked on open.
  function list() {
    const scope = getLibraryContext();
    const store = readStore(scope.dir);
    const tracks = Object.create(null);
    for (const trackId of Object.keys(store)) {
      if (!isStoreTrackId(trackId)) continue;
      try {
        tracks[trackId] = { languages: readEdit(store, trackId).languages };
      } catch {
        // A damaged entry stays unlisted; opening that track reports it.
      }
    }
    return { tracks };
  }

  async function applyBatch({ trackIds, language }) {
    if (batching) throw invalid('busy');
    if (
      !Array.isArray(trackIds) ||
      !trackIds.length ||
      trackIds.length > maxBatchTracks ||
      new Set(trackIds).size !== trackIds.length ||
      !trackIds.every(isStoreTrackId)
    )
      throw invalid();
    const languages = languageList([language]);
    batching = true;
    try {
      const scope = getLibraryContext();
      const bound = [];
      for (const trackId of trackIds) {
        const audio = await audioBinding(scope, trackId);
        if (audio) bound.push([trackId, audio]);
      }
      checkScope(scope);
      if (bound.length) {
        const store = readStore(scope.dir);
        for (const [trackId, audio] of bound)
          store[trackId] = { audioSha256: audio, languages };
        writeTrackStore(scope.dir, storeFile, store, {
          name: 'Track language',
        });
      }
      return { updated: bound.length, skipped: trackIds.length - bound.length };
    } finally {
      batching = false;
    }
  }

  return { get, save, list, applyBatch };
}

module.exports = { LANGUAGES, createTrackLanguagesService };
