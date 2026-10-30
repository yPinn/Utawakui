export function defineKeyboardBinding(binding) {
  return Object.freeze({
    ctrl: false,
    alt: false,
    meta: false,
    shift: null,
    editable: 'ignore',
    preventDefault: false,
    noRepeat: false,
    skipIfHandled: false,
    devOnly: false,
    view: null,
    history: null,
    ...binding,
  });
}

const PLAYER_BINDINGS = [
  {
    id: 'player.transpose-up',
    key: 'arrowup',
    ctrl: true,
    shift: false,
    preventDefault: true,
  },
  {
    id: 'player.transpose-down',
    key: 'arrowdown',
    ctrl: true,
    shift: false,
    preventDefault: true,
  },
  {
    id: 'player.tempo-up',
    key: 'arrowup',
    ctrl: true,
    shift: true,
    preventDefault: true,
  },
  {
    id: 'player.tempo-down',
    key: 'arrowdown',
    ctrl: true,
    shift: true,
    preventDefault: true,
  },
  { id: 'player.mute', key: 'm' },
  { id: 'player.guide-vocal', key: 'g' },
  {
    id: 'player.volume-up',
    key: 'arrowup',
    preventDefault: true,
  },
  {
    id: 'player.volume-down',
    key: 'arrowdown',
    preventDefault: true,
  },
  // Placeholder key pending the owner's unified keybinding review.
  { id: 'obs.marker', key: 'k' },
];

// Browser-style history traversal (ADR 0025). Windows-only app, so no Cmd+[ / ].
function historyBinding(id, key, history, extra = {}) {
  return {
    id,
    key,
    history,
    editable: 'allow',
    preventDefault: true,
    noRepeat: true,
    ...extra,
  };
}

const HISTORY_BINDINGS = [
  historyBinding('history.back', 'arrowleft', 'back', {
    alt: true,
    skipIfHandled: true,
  }),
  historyBinding('history.forward', 'arrowright', 'forward', {
    alt: true,
    skipIfHandled: true,
  }),
  historyBinding('history.back.browser-key', 'browserback', 'back'),
  historyBinding('history.forward.browser-key', 'browserforward', 'forward'),
];

export const LEGACY_KEYBOARD_BINDINGS = Object.freeze(
  [...PLAYER_BINDINGS, ...HISTORY_BINDINGS].map(defineKeyboardBinding),
);
