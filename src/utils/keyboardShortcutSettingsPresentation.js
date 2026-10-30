import {
  SHORTCUT_COMMANDS,
  normalizeShortcutChord,
} from '../../shared/keyboardShortcutContract.mjs';
import { createKeyboardBindings } from './inputBindingRegistry.js';
import {
  formatShortcutChord,
  shortcutCommandLabel,
} from './keyboardShortcutPresentation.js';
import { t } from './i18n.js';

// Read-only presentation, never a capability grant or a command dispatch input.
export function shortcutRuntimePresentation(runtime) {
  const phases = [
    'disabled',
    'active',
    'blocked',
    'degraded',
    'suspended',
    'disposed',
  ];
  if (
    !runtime ||
    !phases.includes(runtime.state) ||
    typeof runtime.busy !== 'boolean' ||
    !Array.isArray(runtime.eligibleCommands) ||
    runtime.eligibleCommands.length > SHORTCUT_COMMANDS.length ||
    new Set(runtime.eligibleCommands).size !==
      runtime.eligibleCommands.length ||
    runtime.eligibleCommands.some(
      (id) => !SHORTCUT_COMMANDS.some((command) => command.id === id),
    ) ||
    !Array.isArray(runtime.active) ||
    runtime.active.length > runtime.eligibleCommands.length
  )
    throw TypeError('Invalid shortcut runtime');
  const seen = new Set();
  for (const binding of runtime.active) {
    if (
      !binding ||
      !runtime.eligibleCommands.includes(binding.command) ||
      seen.has(binding.command)
    )
      throw TypeError('Invalid active shortcut');
    normalizeShortcutChord(binding.chord, 'global');
    seen.add(binding.command);
  }
  if (runtime.busy)
    return { status: t('shortcuts.status.busy'), tone: 'muted' };
  if (['blocked', 'degraded', 'suspended', 'disposed'].includes(runtime.state))
    return { status: t('shortcuts.status.paused'), tone: 'warning' };
  if (!runtime.eligibleCommands.length)
    return { status: t('shortcuts.status.notAvailable'), tone: 'muted' };
  if (runtime.sessionDisabled === true)
    return { status: t('shortcuts.status.sessionDisabled'), tone: 'muted' };
  return runtime.state === 'active' && runtime.active.length
    ? { status: t('shortcuts.status.registered'), tone: 'info' }
    : { status: t('shortcuts.status.inactive'), tone: 'muted' };
}

export const SHORTCUT_CATEGORIES = Object.freeze(
  [
    {
      id: 'playback',
      label: t('shortcuts.categories.playback.label'),
      guidance: t('shortcuts.categories.playback.guidance'),
      commands: ['player.play-pause', 'player.previous', 'player.next'],
    },
    {
      id: 'audio',
      label: t('shortcuts.categories.audio.label'),
      guidance: t('shortcuts.categories.audio.guidance'),
      commands: [
        'player.volume-up',
        'player.volume-down',
        'player.mute',
        'player.transpose-up',
        'player.transpose-down',
      ],
    },
    {
      id: 'lyrics',
      label: t('shortcuts.categories.lyrics.label'),
      guidance: t('shortcuts.categories.lyrics.guidance'),
      commands: ['lyrics.offset-up', 'lyrics.offset-down'],
    },
    {
      id: 'reference',
      label: t('shortcuts.categories.reference.label'),
      guidance: '',
      commands: [],
    },
  ].map((category) =>
    Object.freeze({ ...category, commands: Object.freeze(category.commands) }),
  ),
);

export const SHORTCUT_USAGE_NOTES = Object.freeze([
  t('shortcuts.usage.configure'),
  t('shortcuts.usage.typing'),
  t('shortcuts.usage.hold'),
]);
const titles = {
  'player.volume-up': t('shortcuts.commands.playerVolumeUp.title'),
  'player.volume-down': t('shortcuts.commands.playerVolumeDown.title'),
  'player.mute': t('shortcuts.commands.playerMute.title'),
  'lyrics.offset-up': t('shortcuts.commands.lyricsOffsetUp.title'),
  'lyrics.offset-down': t('shortcuts.commands.lyricsOffsetDown.title'),
};
const descriptions = {
  'player.play-pause': t('shortcuts.commands.playerPlayPause.description'),
  'player.previous': t('shortcuts.commands.playerPrevious.description'),
  'player.next': t('shortcuts.commands.playerNext.description'),
};
export function shortcutSettingsRows(
  configuration,
  categoryId,
  loaded,
  bindingScope = 'app',
  runtime = null,
) {
  const category = SHORTCUT_CATEGORIES.find(({ id }) => id === categoryId);
  const bindings = new Map(
    configuration.bindings.map((binding) => [binding.command, binding.app]),
  );
  return (category?.commands ?? []).map((id) => {
    const command = SHORTCUT_COMMANDS.find((item) => item.id === id),
      app = bindings.get(id);
    if (bindingScope === 'global') {
      const binding = configuration.bindings.find(
        (item) => item.command === id,
      ).global;
      const eligible = runtime?.eligibleCommands.includes(id) === true;
      const registered = runtime?.active.some(
        (item) =>
          item.command === id &&
          binding &&
          ['key', 'ctrl', 'alt', 'shift'].every(
            (key) => item.chord[key] === binding[key],
          ),
      );
      return {
        ...command,
        label: shortcutCommandLabel(id),
        app,
        title: titles[id] ?? shortcutCommandLabel(id),
        guidance: descriptions[id] ?? '',
        scope: t('shortcuts.scope.global'),
        keys:
          loaded && binding ? formatShortcutChord(binding).split(' + ') : [],
        status: t(
          !loaded
            ? 'shortcuts.status.notLoaded'
            : !eligible
              ? 'shortcuts.status.notAvailable'
              : !binding
                ? 'shortcuts.status.unset'
                : registered
                  ? 'shortcuts.status.registered'
                  : runtime?.sessionDisabled
                    ? 'shortcuts.status.sessionDisabled'
                    : !configuration.globalEnabled
                      ? 'shortcuts.status.inactive'
                      : 'shortcuts.status.paused',
        ),
        global: binding,
      };
    }
    const active = loaded && app.mode !== 'disabled';
    const chord = active
      ? app.mode === 'custom'
        ? app.chord
        : command.defaultApp
      : null;
    const status = t(
      !loaded
        ? 'shortcuts.status.notLoaded'
        : app.mode === 'disabled'
          ? 'shortcuts.status.disabled'
          : !chord
            ? 'shortcuts.status.unset'
            : app.mode === 'custom'
              ? 'shortcuts.status.custom'
              : 'shortcuts.status.default',
    );
    const volume = ['player.volume-up', 'player.volume-down'].includes(id);
    const scope = t(
      app.mode === 'custom'
        ? 'shortcuts.scope.custom'
        : !chord
          ? 'shortcuts.scope.unset'
          : volume
            ? command.defaultShiftWildcard
              ? 'shortcuts.scope.defaultVolumeShift'
              : 'shortcuts.scope.defaultVolume'
            : command.defaultShiftWildcard
              ? 'shortcuts.scope.defaultShift'
              : 'shortcuts.scope.default',
    );
    return {
      ...command,
      label: shortcutCommandLabel(id),
      app,
      title: titles[id] ?? shortcutCommandLabel(id),
      status,
      keys: chord ? formatShortcutChord(chord).split(' + ') : [],
      guidance: descriptions[id] ?? '',
      scope,
    };
  });
}

const fixedKeys = (binding) => {
  if (binding.key.startsWith('f')) return [binding.key.toUpperCase()];
  if (binding.key.startsWith('browser'))
    return [binding.key === 'browserback' ? 'BrowserBack' : 'BrowserForward'];
  return formatShortcutChord({
    key: binding.key,
    ctrl: binding.ctrl,
    alt: binding.alt,
    shift: binding.shift === true,
  }).split(' + ');
};
// Rows name catalog keys; view bindings pass their already-resolved label.
const row = (context, chords, action, note = '') =>
  Object.freeze({
    context: t(`shortcuts.reference.contexts.${context}`),
    chords,
    action,
    note: note ? t(`shortcuts.reference.notes.${note}`) : '',
  });
const entry = (context, chords, action, note) =>
  row(context, chords, t(`shortcuts.reference.actions.${action}`), note);
const pair = (modifier, first, second) => [
  [...modifier, first],
  [...modifier, second],
];
const arrows = [['←'], ['↑'], ['↓'], ['→']];
const fixed = createKeyboardBindings();
export const SHORTCUT_REFERENCE_SECTIONS = Object.freeze([
  {
    id: 'navigation',
    title: t('shortcuts.reference.sections.navigation'),
    rows: [
      ...fixed
        .filter((binding) => binding.view || binding.history)
        .map((binding) =>
          binding.history
            ? entry(
                'mainWindow',
                [fixedKeys(binding)],
                binding.history === 'back' ? 'previousPage' : 'nextPage',
              )
            : row('mainWindow', [fixedKeys(binding)], binding.label),
        ),
      entry('mainWindow', [['F4']], 'nothing'),
    ],
  },
  {
    id: 'practice',
    title: t('shortcuts.reference.sections.practice'),
    guidance: t('shortcuts.reference.sections.practiceGuidance'),
    rows: [
      entry('tempo', pair(['Ctrl', 'Shift'], '↑', '↓'), 'tempo'),
      entry('guideVocal', [['G']], 'guideVocal', 'guideVocal'),
      entry('obsMarker', [['K']], 'addMarker'),
      entry('waveformHandle', arrows, 'movePanel'),
      entry('waveformOverview', [['←'], ['↓']], 'pageToStart', 'viewOnly'),
      entry('waveformOverview', [['→'], ['↑']], 'pageToEnd'),
      entry('waveformOverview', [['Page Up'], ['Page Down']], 'fivePages'),
      entry('waveformOverview', [['Home'], ['End']], 'showEdges'),
      entry('waveformPanel', [['='], ['-']], 'zoom', 'viewZoom'),
      entry('cueHandles', [['←'], ['→']], 'nudgeCue', 'saveAfter'),
      entry('cueHandles', [['Esc']], 'cancelDrag'),
      entry('readingEdit', [['Enter'], ['Esc']], 'confirmEdit'),
    ],
  },
  {
    id: 'widgets',
    title: t('shortcuts.reference.sections.widgets'),
    rows: [
      entry('panelView', [['`']], 'togglePanel', 'panelView'),
      entry('panelView', [['Esc']], 'restorePanel', 'restorePanel'),
      entry('rightPanel', [['Esc']], 'collapsePanel'),
      entry('trackRow', [['Space'], ['Enter']], 'selectTrack', 'trackRow'),
      entry('sortableRow', [['↑'], ['↓']], 'moveRow'),
      entry(
        'sliderDefault',
        [['ContextMenu'], ['Shift', 'F10']],
        'reset',
        'sliderReset',
      ),
      entry('reorderableHeader', pair(['Alt'], '←', '→'), 'moveColumn'),
      entry('columnEdge', [['←'], ['→']], 'nudgeColumn'),
      entry('columnEdge', pair(['Shift'], '←', '→'), 'resizeColumn'),
      entry('columnEdge', [['Home'], ['End']], 'columnLimits'),
      entry('queueRow', pair(['Alt'], '↑', '↓'), 'moveRow'),
      entry('panelEdge', [['Enter'], ['Space']], 'toggleEdge'),
      entry('playlistEdge', [['←'], ['Home']], 'collapsePlaylist'),
      entry('playlistEdge', [['→'], ['End']], 'expandPlaylist'),
      entry('rightPanelEdge', [['←'], ['→']], 'resizePanel'),
      entry('rightPanelEdge', [['Home'], ['End']], 'panelLimits'),
      entry('noteOrPhoto', arrows, 'nudgeItem'),
      entry(
        'noteOrPhoto',
        arrows.map((keys) => ['Shift', ...keys]),
        'moveItem',
      ),
      entry('noteOrPhoto', [['Home']], 'resetItem'),
      entry('photoStack', [['Enter'], ['Space']], 'flipPhoto', 'photoStack'),
      entry('noteDirectEdit', [['Esc']], 'finishNote', 'noteKeep'),
      entry('longRead', [['←'], ['Page Up']], 'previousPage'),
      entry('longRead', [['→'], ['Page Down']], 'nextPage'),
      entry(
        'lyricsScroll',
        [
          ['↑'],
          ['↓'],
          ['Home'],
          ['End'],
          ['Page Up'],
          ['Page Down'],
          ['Space'],
        ],
        'pauseFollow',
      ),
    ],
  },
  {
    id: 'system',
    title: t('shortcuts.reference.sections.system'),
    rows: [
      entry(
        'mediaKeys',
        [['MediaPlayPause'], ['MediaTrackPrevious'], ['MediaTrackNext']],
        'mediaKeys',
        'mediaKeys',
      ),
    ],
  },
]);
