import { APP_DESTINATIONS } from './appDestinationRegistry.js';

// App-level keyboard bindings. Widget conventions (roving arrows, Enter-to-submit,
// Escape-to-dismiss) stay with their components; see docs/contracts/input-bindings.md.
//
// editable: 'ignore' skips the binding while typing in an editable field; 'allow'
// fires regardless of focus. shift: null ignores Shift, true/false requires it.
// Modifiers must match exactly, so Alt and Meta combinations stay reserved unless
// a binding declares them. noRepeat drops key auto-repeat; skipIfHandled yields to
// a component that already handled (preventDefault) the same event.

function define(binding) {
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

function viewBinding(id, label, key, view, devOnly = false) {
  return {
    id,
    label,
    key,
    view,
    editable: 'allow',
    preventDefault: true,
    devOnly,
  };
}

export function createKeyboardBindings({ internalViewShortcuts = {} } = {}) {
  const destinations = APP_DESTINATIONS.map((destination) =>
    viewBinding(
      `view.${destination.id}`,
      `前往${destination.label}`,
      destination.shortcut,
      destination.id,
    ),
  );
  // F4 stays unassigned (ADR 0023); F5-F8 are dev-only workbenches.
  const settings = viewBinding('view.settings', '開啟設定', 'f9', 'settings');
  const internal = Object.entries(internalViewShortcuts).map(([key, view]) =>
    viewBinding(
      `view.internal.${view}`,
      `開啟內部工作台（${view}）`,
      key,
      view,
      true,
    ),
  );

  return Object.freeze(
    [
      ...destinations,
      settings,
      ...internal,
      ...PLAYER_BINDINGS,
      ...HISTORY_BINDINGS,
    ].map(define),
  );
}

export function resolveKeyboardBinding(event, bindings) {
  const key = event.key.toLowerCase();
  const ctrl = Boolean(event.ctrlKey);
  const alt = Boolean(event.altKey);
  const meta = Boolean(event.metaKey);
  const shift = Boolean(event.shiftKey);

  return (
    bindings.find(
      (binding) =>
        binding.key === key &&
        binding.ctrl === ctrl &&
        binding.alt === alt &&
        binding.meta === meta &&
        (binding.shift === null || binding.shift === shift),
    ) ?? null
  );
}

// Mouse back／forward buttons (button 3／4) share the history actions.
export function createPointerBindings() {
  return Object.freeze([
    Object.freeze({
      id: 'history.back.mouse',
      label: '上一頁（滑鼠側鍵）',
      button: 3,
      history: 'back',
    }),
    Object.freeze({
      id: 'history.forward.mouse',
      label: '下一頁（滑鼠側鍵）',
      button: 4,
      history: 'forward',
    }),
  ]);
}

export function resolvePointerBinding(event, bindings) {
  return bindings.find((binding) => binding.button === event.button) ?? null;
}
