import { shallowRef, watch } from 'vue';
import { AUDIO_CONTROL_VALUES } from '../utils/audioPreferences.js';

const range = AUDIO_CONTROL_VALUES.trackGainDb;
const cache = new Map();
// Bumped on every saved trim so consumers can re-apply the current track.
const revision = shallowRef(0);

function bridge() {
  return globalThis.window?.Utawakui;
}

// Per-recording level trim shared by the player and the BGM lane. Read
// failures fall back to 0 dB so playback never waits on this optional value.
async function readTrackGain(trackId) {
  if (!trackId) return { gainDb: range.defaultValue, editToken: null };
  const cached = cache.get(trackId);
  if (cached) return cached;
  try {
    const result = await bridge()?.getTrackGain?.(trackId);
    if (result?.ok && Number.isFinite(result.gainDb)) {
      const entry = { gainDb: result.gainDb, editToken: result.editToken };
      cache.set(trackId, entry);
      return entry;
    }
  } catch {
    /* Optional value; play at 0 dB. */
  }
  return { gainDb: range.defaultValue, editToken: null };
}

async function gainDbFor(trackId) {
  return (await readTrackGain(trackId)).gainDb;
}

async function saveTrackGain(trackId, gainDb) {
  const open = await readTrackGain(trackId);
  if (!open.editToken) return { ok: false, status: 'unavailable' };
  let result;
  try {
    result = await bridge().saveTrackGain(trackId, open.editToken, gainDb);
  } catch {
    return { ok: false, status: 'failed' };
  }
  cache.delete(trackId);
  if (result?.ok) {
    cache.set(trackId, { gainDb: result.gainDb, editToken: result.editToken });
    revision.value += 1;
  }
  return result ?? { ok: false, status: 'failed' };
}

// Re-applies the loaded track's trim after any saved change.
function followSavedTrackGain(getTrackId, apply) {
  return watch(revision, async () => {
    const trackId = getTrackId();
    if (!trackId) return;
    const gainDb = await gainDbFor(trackId);
    if (getTrackId() === trackId) apply(gainDb);
  });
}

function forgetTrackGains() {
  cache.clear();
  revision.value += 1;
}

export function useTrackGain() {
  return {
    range,
    revision,
    readTrackGain,
    gainDbFor,
    saveTrackGain,
    followSavedTrackGain,
    forgetTrackGains,
  };
}
