import {
  SHORTCUT_COMMANDS,
  normalizeShortcutChord,
} from './keyboardShortcutContract.mjs';
const commands = new Set(SHORTCUT_COMMANDS.map((c) => c.id));
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Reflect.ownKeys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const revision = (v) => Number.isSafeInteger(v) && v > 0;
export function parseReceiverIntent(operation, value) {
  const keys = {
    confirm: ['receiverId', 'offerId', 'contextRevision'],
    admit: ['receiverId', 'offerId', 'sequence'],
    release: ['receiverId'],
  }[operation];
  if (
    !keys ||
    !exact(value, keys) ||
    !uuid.test(value.receiverId) ||
    (keys.includes('offerId') && !uuid.test(value.offerId)) ||
    (keys.includes('contextRevision') && !revision(value.contextRevision)) ||
    (keys.includes('sequence') && !revision(value.sequence))
  )
    throw TypeError('Invalid shortcut receiver intent');
  return Object.freeze({ ...value });
}
export function parseReceiverOffer(value) {
  if (
    !exact(value, [
      'version',
      'receiverId',
      'offerId',
      'bootId',
      'generation',
      'active',
      'role',
    ]) ||
    value.version !== 1 ||
    ![value.receiverId, value.offerId, value.bootId].every(
      (v) => typeof v === 'string' && uuid.test(v),
    ) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !['main', 'background', 'blocked'].includes(value.role) ||
    !Array.isArray(value.active) ||
    value.active.length > SHORTCUT_COMMANDS.length
  )
    throw TypeError('Invalid shortcut receiver offer');
  const seen = new Set(),
    active = value.active.map((binding) => {
      if (
        !exact(binding, ['command', 'chord']) ||
        !commands.has(binding.command) ||
        seen.has(binding.command)
      )
        throw TypeError('Invalid active shortcut');
      seen.add(binding.command);
      return Object.freeze({
        command: binding.command,
        chord: normalizeShortcutChord(binding.chord, 'global'),
      });
    });
  return Object.freeze({ ...value, active: Object.freeze(active) });
}
export function parseGlobalShortcutEnvelope(value) {
  if (
    !exact(value, [
      'version',
      'receiverId',
      'offerId',
      'bootId',
      'generation',
      'sequence',
      'contextRevision',
      'command',
    ]) ||
    value.version !== 1 ||
    ![value.receiverId, value.offerId, value.bootId].every(
      (v) => typeof v === 'string' && uuid.test(v),
    ) ||
    !revision(value.generation) ||
    !revision(value.sequence) ||
    !revision(value.contextRevision) ||
    !commands.has(value.command)
  )
    throw TypeError('Invalid global shortcut envelope');
  return Object.freeze({ ...value });
}
// Ownership is an exact chord comparison even for repeats and blocked input.
// Event-to-command parsing deliberately rejects repeat/IME and cannot serve it.
export function ownsGlobalShortcut(event, active) {
  if (event.metaKey || typeof event.key !== 'string') return false;
  const aliases = {
    up: 'arrowup',
    down: 'arrowdown',
    left: 'arrowleft',
    right: 'arrowright',
    ' ': 'space',
    spacebar: 'space',
  };
  const key = aliases[event.key.toLowerCase()] ?? event.key.toLowerCase();
  return active.some(
    ({ chord }) =>
      chord.key === key &&
      chord.ctrl === Boolean(event.ctrlKey) &&
      chord.alt === Boolean(event.altKey) &&
      chord.shift === Boolean(event.shiftKey),
  );
}
