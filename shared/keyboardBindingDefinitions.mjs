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
    label: '移調 +1',
    key: 'arrowup',
    ctrl: true,
    shift: false,
    preventDefault: true,
  },
  {
    id: 'player.transpose-down',
    label: '移調 −1',
    key: 'arrowdown',
    ctrl: true,
    shift: false,
    preventDefault: true,
  },
  {
    id: 'player.tempo-up',
    label: '加快速度',
    key: 'arrowup',
    ctrl: true,
    shift: true,
    preventDefault: true,
  },
  {
    id: 'player.tempo-down',
    label: '放慢速度',
    key: 'arrowdown',
    ctrl: true,
    shift: true,
    preventDefault: true,
  },
  { id: 'player.mute', label: '靜音切換', key: 'm' },
  { id: 'player.guide-vocal', label: '導引人聲切換', key: 'g' },
  {
    id: 'player.volume-up',
    label: '音量 +10%',
    key: 'arrowup',
    preventDefault: true,
  },
  {
    id: 'player.volume-down',
    label: '音量 −10%',
    key: 'arrowdown',
    preventDefault: true,
  },
  // Placeholder key pending the owner's unified keybinding review.
  { id: 'obs.marker', label: '新增 OBS 標記', key: 'k' },
];

// Browser-style history traversal (ADR 0025). Windows-only app, so no Cmd+[ / ].
function historyBinding(id, label, key, history, extra = {}) {
  return {
    id,
    label,
    key,
    history,
    editable: 'allow',
    preventDefault: true,
    noRepeat: true,
    ...extra,
  };
}

const HISTORY_BINDINGS = [
  historyBinding('history.back', '上一頁', 'arrowleft', 'back', {
    alt: true,
    skipIfHandled: true,
  }),
  historyBinding('history.forward', '下一頁', 'arrowright', 'forward', {
    alt: true,
    skipIfHandled: true,
  }),
  historyBinding(
    'history.back.browser-key',
    '上一頁（瀏覽器鍵）',
    'browserback',
    'back',
  ),
  historyBinding(
    'history.forward.browser-key',
    '下一頁（瀏覽器鍵）',
    'browserforward',
    'forward',
  ),
];

export const LEGACY_KEYBOARD_BINDINGS = Object.freeze(
  [...PLAYER_BINDINGS, ...HISTORY_BINDINGS].map(defineKeyboardBinding),
);
