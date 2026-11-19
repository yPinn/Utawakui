'use strict';

const companionAudioCommands = require('../../../shared/companionAudioCommands.json');
const { maxQueueItems } = require('../../../shared/outputContractValues.json');
const {
  parseCompanionOutputChange,
} = require('../../../shared/companionOutput.mjs');

// Fixed command set a paired phone may send (ADR 0033 / mobile companion
// contract). Seek and queue playback carry one additional bounded field.
const COMPANION_COMMANDS = Object.freeze([
  'player.play-pause',
  'player.previous',
  'player.next',
  'player.seek',
  'queue.play',
  'queue.remove',
  'queue.move-up',
  'queue.move-down',
  'queue.clear',
  'queue.view-queue',
  'queue.view-recent',
  'queue.view-arrangement-pending',
  'queue.view-arrangement-history',
  'queue.play-recent',
  'library.play',
  'library.enqueue',
  'player.transpose-up',
  'player.transpose-down',
  'player.volume-up',
  'player.volume-down',
  'player.mute',
  'reading.off',
  'reading.furigana',
  'reading.romaji',
  'output.set-option',
  ...Object.keys(companionAudioCommands),
]);
const COMMAND_SET = new Set(COMPANION_COMMANDS);
const INDEX_COMMANDS = new Set([
  'queue.play',
  'queue.remove',
  'queue.move-up',
  'queue.move-down',
  'queue.play-recent',
]);
const LIBRARY_COMMANDS = new Set(['library.play', 'library.enqueue']);
const FIELDS = ['command', 'sequence', 'revision', 'trackId'];
const PER_SECOND = 8;
const SAME_COMMAND_INTERVAL_MS = 100;

function parseCompanionCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const seeking = body.command === 'player.seek';
  const picking = INDEX_COMMANDS.has(body.command);
  const library = LIBRARY_COMMANDS.has(body.command);
  const output = body.command === 'output.set-option';
  const fields = seeking
    ? [...FIELDS, 'positionMs']
    : picking
      ? [...FIELDS, 'queueIndex']
      : library
        ? [...FIELDS, 'libraryTrackId']
        : output
          ? [...FIELDS, 'outputChange']
          : FIELDS;
  if (
    Object.keys(body).length !== fields.length ||
    !fields.every((key) => Object.hasOwn(body, key))
  )
    return null;
  const {
    command,
    sequence,
    revision,
    trackId,
    positionMs,
    queueIndex,
    libraryTrackId,
  } = body;
  const outputChange = output && parseCompanionOutputChange(body.outputChange);
  if (
    !COMMAND_SET.has(command) ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof trackId !== 'string' ||
    (!command.startsWith('queue.') &&
      !library &&
      !output &&
      trackId.length < 1) ||
    trackId.length > 200 ||
    (output && !outputChange) ||
    (seeking && (!Number.isSafeInteger(positionMs) || positionMs < 0)) ||
    (picking &&
      (!Number.isSafeInteger(queueIndex) ||
        queueIndex < 0 ||
        queueIndex >= maxQueueItems)) ||
    (library &&
      (typeof libraryTrackId !== 'string' ||
        !libraryTrackId.length ||
        libraryTrackId.length > 200))
  )
    return null;
  return {
    command,
    sequence,
    revision,
    trackId,
    ...(seeking ? { positionMs } : {}),
    ...(picking ? { queueIndex } : {}),
    ...(library ? { libraryTrackId } : {}),
    ...(output ? { outputChange } : {}),
  };
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
