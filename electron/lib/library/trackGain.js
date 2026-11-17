'use strict';

const { hashAudioFile } = require('../works/trackBinding');
const audioControlValues = require('../../../shared/audioControlValues.json');
const {
  createTrackBinding,
  readTrackStore,
  sha256Hex,
  writeTrackStore,
} = require('./trackSidecarStore');

const storeFile = 'track-gain.json';
const range = audioControlValues.trackGainDb;

function invalid(code = 'invalid') {
  return Object.assign(new Error(`Invalid track gain operation (${code})`), {
    gainStatus: code,
  });
}

function gainValue(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < range.min ||
    value > range.max ||
    Math.abs(value / range.step - Math.round(value / range.step)) > 1e-9
  )
    throw invalid();
  return value;
}

function readEdit(store, trackId) {
  const entry = store[trackId];
  if (entry === undefined) return null;
  if (
    typeof entry?.audioSha256 !== 'string' ||
    !sha256Hex.test(entry.audioSha256)
  )
    throw new Error('Invalid track gain entry');
  return { audioSha256: entry.audioSha256, gainDb: gainValue(entry.gainDb) };
}

// One non-destructive level trim per recording; a replaced audio file reads
// as unset so an old trim never applies to different audio.
function createTrackGainService({
  getLibraryContext,
  hashAudio = hashAudioFile,
}) {
  const { checkScope, audioBinding, editToken } = createTrackBinding({
    getLibraryContext,
    hashAudio,
    invalid,
  });
  const readStore = (dir) =>
    readTrackStore(dir, storeFile, { name: 'track gain', invalid });

  function view(scope, trackId, audio, edit) {
    const current = edit?.audioSha256 === audio;
    return {
      editToken: editToken(scope, trackId, audio, edit),
      gainDb: current ? edit.gainDb : range.defaultValue,
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

  async function save({ trackId, token, gainDb }) {
    if (typeof token !== 'string' || !sha256Hex.test(token)) throw invalid();
    const value = gainValue(gainDb);
    const { scope, audio } = await bound(trackId);
    const store = readStore(scope.dir);
    if (token !== editToken(scope, trackId, audio, readEdit(store, trackId)))
      throw invalid('stale');
    if (value === range.defaultValue) delete store[trackId];
    else store[trackId] = { audioSha256: audio, gainDb: value };
    writeTrackStore(scope.dir, storeFile, store, { name: 'Track gain' });
    return view(scope, trackId, audio, store[trackId] ?? null);
  }

  return { get, save };
}

module.exports = { createTrackGainService };
