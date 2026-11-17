'use strict';

// Fixed command set a paired phone may send (ADR 0033 / mobile companion
// contract). Nothing else is accepted, and no field beyond these is allowed.
const COMPANION_COMMANDS = Object.freeze([
  'player.play-pause',
  'player.previous',
  'player.next',
  'player.transpose-up',
  'player.transpose-down',
  'player.volume-up',
  'player.volume-down',
  'player.mute',
  'lyrics.offset-up',
  'lyrics.offset-down',
  'reading.off',
  'reading.furigana',
  'reading.romaji',
]);
const COMMAND_SET = new Set(COMPANION_COMMANDS);
const FIELDS = ['command', 'sequence', 'revision', 'trackId'];
const PER_SECOND = 8;
const SAME_COMMAND_INTERVAL_MS = 100;

function parseCompanionCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (
    keys.length !== FIELDS.length ||
    !FIELDS.every((key) => keys.includes(key))
  )
    return null;
  const { command, sequence, revision, trackId } = body;
  if (
    !COMMAND_SET.has(command) ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof trackId !== 'string' ||
    trackId.length < 1 ||
    trackId.length > 200
  )
    return null;
  return { command, sequence, revision, trackId };
}

// Per-device admission: monotonic sequence plus overall and same-command
// rate limits. State is in memory; a restart simply accepts new sequences.
function createCommandAdmission({ now = () => Date.now() } = {}) {
  const devices = new Map();

  function admit(deviceId, { command, sequence }) {
    const state = devices.get(deviceId) ?? {
      lastSequence: -1,
      recent: [],
      lastByCommand: new Map(),
    };
    devices.set(deviceId, state);
    if (sequence <= state.lastSequence) return 'stale';
    const at = now();
    state.recent = state.recent.filter((time) => at - time < 1000);
    const last = state.lastByCommand.get(command);
    if (
      state.recent.length >= PER_SECOND ||
      (last !== undefined && at - last < SAME_COMMAND_INTERVAL_MS)
    )
      return 'rate-limited';
    state.lastSequence = sequence;
    state.recent.push(at);
    state.lastByCommand.set(command, at);
    return null;
  }

  return { admit, forget: (deviceId) => devices.delete(deviceId) };
}

module.exports = {
  COMPANION_COMMANDS,
  createCommandAdmission,
  parseCompanionCommand,
};
