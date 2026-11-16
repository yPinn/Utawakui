'use strict';

const { hashAudioFile } = require('../works/trackBinding');
const {
  createTrackBinding,
  readTrackStore,
  sha256Hex,
  writeTrackStore,
} = require('./trackSidecarStore');

const storeFile = 'track-languages.json';
const maxLanguages = 8;
const noLinguisticContent = 'zxx';
const statuses = new Set(['confirmed', 'pending']);
// BCP 47 tag with an ISO 639 language; no Intl canonicalisation (it folds cmn into zh).
const languageTag =
  /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?(?:-(?:[a-z\d]{5,8}|\d[a-z\d]{3}))*$/iu;

function invalid(code = 'invalid') {
  return Object.assign(
    new Error(`Invalid track language operation (${code})`),
    { languageStatus: code },
  );
}

function normalizeTag(value) {
  if (
    typeof value !== 'string' ||
    value.length > 35 ||
    !languageTag.test(value)
  )
    throw invalid();
  return value
    .split('-')
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 2) return part.toUpperCase();
      if (part.length === 4 && /^[a-z]+$/iu.test(part))
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      return part.toLowerCase();
    })
    .join('-');
}

// Validates one record and applies the language rules shared by read and save.
function languageRecord({ languages, primary, status }) {
  if (!Array.isArray(languages) || languages.length > maxLanguages)
    throw invalid();
  const tags = languages.map(normalizeTag);
  // An unannotated track has no record; `und` is not stored as a language.
  if (new Set(tags).size !== tags.length || tags.includes('und'))
    throw invalid();
  if (tags.includes(noLinguisticContent) && tags.length > 1) throw invalid();
  const main = primary == null ? null : normalizeTag(primary);
  if (main !== null && !tags.includes(main)) throw invalid();
  if (!statuses.has(status) || (status === 'confirmed' && !tags.length))
    throw invalid();
  return {
    languages: tags,
    primary: tags.length === 1 ? tags[0] : main,
    status,
  };
}

function readEdit(store, trackId) {
  const entry = store[trackId];
  if (entry === undefined) return null;
  if (
    typeof entry?.audioSha256 !== 'string' ||
    !sha256Hex.test(entry.audioSha256)
  )
    throw new Error('Invalid track language entry');
  try {
    return { audioSha256: entry.audioSha256, ...languageRecord(entry) };
  } catch (cause) {
    throw new Error('Invalid track language entry', { cause });
  }
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
  const readStore = (dir) =>
    readTrackStore(dir, storeFile, { name: 'track language', invalid });

  function view(scope, trackId, audio, edit) {
    return {
      editToken: editToken(scope, trackId, audio, edit),
      languages: edit?.languages ?? [],
      primary: edit?.primary ?? null,
      status: edit?.status ?? 'pending',
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

  async function save({ trackId, token, languages, primary }) {
    if (typeof token !== 'string' || !sha256Hex.test(token)) throw invalid();
    const record = languageRecord({
      languages,
      primary,
      status:
        Array.isArray(languages) && languages.length ? 'confirmed' : 'pending',
    });
    const { scope, audio } = await bound(trackId);
    const store = readStore(scope.dir);
    if (token !== editToken(scope, trackId, audio, readEdit(store, trackId)))
      throw invalid('stale');
    if (record.status === 'pending') delete store[trackId];
    else store[trackId] = { audioSha256: audio, ...record };
    const edit = store[trackId] ? readEdit(store, trackId) : null;
    writeTrackStore(scope.dir, storeFile, store, { name: 'Track language' });
    return view(scope, trackId, audio, edit);
  }

  return { get, save };
}

module.exports = { createTrackLanguagesService, normalizeTag };
