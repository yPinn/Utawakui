import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, ref } from 'vue';
import { mount } from '../components/ui/uiTestHost.js';
import { useAppView } from './useAppView.js';

const commands = vi.hoisted(() => ({
  canExecute: vi.fn(),
  execute: vi.fn(),
  invalidate: vi.fn(),
  dispose: vi.fn(),
}));
const createCommands = vi.hoisted(() => vi.fn(() => commands));
vi.mock('./useShortcutCommands.js', () => ({
  useShortcutCommands: createCommands,
}));

const player = vi.hoisted(() => ({
  state: { volume: 0.5, transposeSemitones: 0, tempoRate: 1 },
  setVolume: vi.fn(),
  toggleMute: vi.fn(),
  toggleCaptureGuideVocal: vi.fn(),
  setTransposeSemitones: vi.fn(),
  setTempoRate: vi.fn(),
}));
vi.mock('./usePlayer.js', () => ({ usePlayer: () => player }));

const requestHistoryTraversal = vi.hoisted(() => vi.fn());
vi.mock('./useNavigationInput.js', () => ({ requestHistoryTraversal }));

const addMarkerMock = vi.hoisted(() => vi.fn());
vi.mock('./useObsIntegration.js', () => ({
  useObsIntegration: () => ({ addMarker: addMarkerMock }),
}));

let keydownListener;
let mountedShortcuts;

beforeEach(() => {
  keydownListener = null;
  createCommands.mockClear();
  commands.canExecute.mockReset().mockReturnValue(true);
  commands.execute
    .mockReset()
    .mockResolvedValue({ ok: true, status: 'executed' });
  commands.invalidate.mockClear();
  commands.dispose.mockClear();
  addMarkerMock.mockClear();
  requestHistoryTraversal.mockClear();
  Object.assign(player.state, {
    volume: 0.5,
    transposeSemitones: 0,
    tempoRate: 1,
  });
  for (const key of [
    'setVolume',
    'toggleMute',
    'toggleCaptureGuideVocal',
    'setTransposeSemitones',
    'setTempoRate',
  ]) {
    player[key].mockClear();
  }
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type, listener) => {
      if (type === 'keydown') keydownListener = listener;
    }),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  mountedShortcuts?.app.unmount();
  mountedShortcuts = null;
  vi.unstubAllGlobals();
  useAppView().openLibraryContent();
});

async function setupShortcuts(options) {
  const appView = useAppView();
  appView.openLibraryContent();
  const { useKeyboardShortcuts } = await import('./useKeyboardShortcuts.js');

  mountedShortcuts = mount({
    setup() {
      useKeyboardShortcuts(options);
      return () => h('div');
    },
  });

  return appView;
}

const customConfig = () => ({
  schemaVersion: 1,
  globalEnabled: false,
  bindings: [
    {
      command: 'player.next',
      app: {
        mode: 'custom',
        chord: { key: 'j', ctrl: true, alt: false, shift: false },
      },
      global: null,
    },
  ],
});

describe('custom command dispatcher', () => {
  it('also yields a custom volume arrow to a focused reader while leaving other custom modifier policy intact', async () => {
    await setupShortcuts({
      shortcutConfiguration: {
        schemaVersion: 1,
        globalEnabled: false,
        bindings: [
          {
            command: 'player.volume-up',
            app: {
              mode: 'custom',
              chord: { key: 'arrowup', ctrl: false, alt: false, shift: false },
            },
            global: null,
          },
        ],
      },
    });
    const target = {
      tagName: 'DIV',
      getAttribute: (name) => (name === 'tabindex' ? '0' : null),
    };
    expect(dispatchKey('ArrowUp', { target })).not.toHaveBeenCalled();
    expect(commands.execute).not.toHaveBeenCalled();
    dispatchKey('ArrowUp');
    expect(commands.execute).toHaveBeenCalledWith(
      'player.volume-up',
      expect.any(Object),
    );
  });
  it('removes the listener and invalidates its owner exactly once on unmount', async () => {
    const config = ref(customConfig());
    await setupShortcuts({ shortcutConfiguration: config });
    dispatchKey('j', { ctrlKey: true });
    const current = commands.execute.mock.calls[0][1].isCurrent;
    mountedShortcuts.app.unmount();
    mountedShortcuts = null;
    expect(commands.dispose).toHaveBeenCalledOnce();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'keydown',
      keydownListener,
    );
    expect(current()).toBe(false);
    dispatchKey('j', { ctrlKey: true });
    expect(commands.execute).toHaveBeenCalledTimes(1);
  });
  it('keeps legacy defaults without constructing the custom executor', async () => {
    await setupShortcuts();
    expect(createCommands).not.toHaveBeenCalled();
    dispatchKey('ArrowUp', { ctrlKey: true, repeat: true });
    expect(player.setTransposeSemitones).toHaveBeenCalledWith(1);
  });
  it('executes exactly one candidate only when its owner can execute, preventing default only after acceptance', async () => {
    await setupShortcuts({ shortcutConfiguration: customConfig() });
    expect(dispatchKey('j', { ctrlKey: true })).toHaveBeenCalledOnce();
    expect(commands.execute).toHaveBeenCalledWith(
      'player.next',
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
    commands.canExecute.mockReturnValue(false);
    expect(dispatchKey('j', { ctrlKey: true })).not.toHaveBeenCalled();
    expect(commands.execute).toHaveBeenCalledTimes(1);
  });
  it('yields custom commands to native widgets, repeat, IME, handled input and transient overlays', async () => {
    let blocked = false;
    await setupShortcuts({
      shortcutConfiguration: customConfig(),
      getShortcutContext: () => ({ blocked }),
    });
    for (const extra of [
      { target: { tagName: 'INPUT' } },
      { target: { tagName: 'BUTTON' } },
      { repeat: true },
      { defaultPrevented: true },
      { isComposing: true },
      { getModifierState: () => true },
    ])
      expect(
        dispatchKey('j', { ctrlKey: true, ...extra }),
      ).not.toHaveBeenCalled();
    blocked = true;
    expect(dispatchKey('j', { ctrlKey: true })).not.toHaveBeenCalled();
    expect(commands.execute).not.toHaveBeenCalled();
  });
  it('blocks all dispatch while recording, without silently changing legacy overlay policy', async () => {
    let recording = true;
    await setupShortcuts({
      shortcutConfiguration: customConfig(),
      getShortcutContext: () => ({ recording, blocked: true }),
    });
    expect(dispatchKey('m')).not.toHaveBeenCalled();
    expect(player.toggleMute).not.toHaveBeenCalled();
    recording = false;
    dispatchKey('m');
    expect(player.toggleMute).toHaveBeenCalledOnce();
  });
  it('invalidates old mappings on immutable configuration replacement and falls back to the legacy baseline on invalid schema', async () => {
    const config = ref(customConfig());
    await setupShortcuts({ shortcutConfiguration: config });
    dispatchKey('j', { ctrlKey: true });
    const current = commands.execute.mock.calls[0][1].isCurrent;
    expect(current()).toBe(true);
    config.value = { ...customConfig(), bindings: [] };
    expect(current()).toBe(false);
    expect(commands.invalidate).toHaveBeenCalledTimes(2);
    expect(dispatchKey('j', { ctrlKey: true })).not.toHaveBeenCalled();
    config.value = { schemaVersion: 100 };
    expect(dispatchKey('j', { ctrlKey: true })).not.toHaveBeenCalled();
    dispatchKey('ArrowUp', { ctrlKey: true });
    expect(player.setTransposeSemitones).toHaveBeenCalledWith(1);
  });
});

function dispatchKey(key, modifiers = {}) {
  const preventDefault = vi.fn();
  keydownListener({
    key,
    preventDefault,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    target: null,
    ...modifiers,
  });
  return preventDefault;
}

const EDITABLE_TARGET = { tagName: 'INPUT' };

describe('useKeyboardShortcuts', () => {
  it.each(['ArrowUp', 'ArrowDown'])(
    'yields default %s volume to handled events, focused tools, widgets, overlays and IME, including Shift',
    async (key) => {
      let blocked = false;
      await setupShortcuts({ getShortcutContext: () => ({ blocked }) });
      const element = (attributes = {}, parentElement = null) => ({
        tagName: 'DIV',
        parentElement,
        getAttribute: (name) => attributes[name] ?? null,
      });
      const widget = element({ role: 'slider' });
      const focusable = element({ tabindex: '0' });
      for (const shiftKey of [false, true]) {
        for (const extra of [
          { defaultPrevented: true },
          { target: element({}, widget) },
          { target: focusable },
          { target: element(), composedPath: () => [element(), focusable] },
          { isComposing: true },
          { keyCode: 229 },
          { getModifierState: (name) => name === 'AltGraph' },
        ])
          expect(
            dispatchKey(key, { shiftKey, ...extra }),
          ).not.toHaveBeenCalled();
        blocked = true;
        expect(dispatchKey(key, { shiftKey })).not.toHaveBeenCalled();
        blocked = false;
      }
      expect(player.setVolume).not.toHaveBeenCalled();
      expect(player.setTransposeSemitones).not.toHaveBeenCalled();
      expect(player.setTempoRate).not.toHaveBeenCalled();
      dispatchKey(key, { repeat: true, shiftKey: true });
      expect(player.setVolume).toHaveBeenCalledOnce();
    },
  );
  it.each(['ArrowDown', 'ArrowUp'])(
    'leaves native SELECT %s to the control without adjusting player volume',
    async (key) => {
      await setupShortcuts();
      const preventDefault = dispatchKey(key, {
        target: { tagName: 'SELECT' },
      });
      expect(preventDefault).not.toHaveBeenCalled();
      expect(player.setVolume).not.toHaveBeenCalled();
    },
  );

  it('retains destination shortcuts while a native SELECT is focused', async () => {
    const appView = await setupShortcuts();
    const preventDefault = dispatchKey('F2', { target: { tagName: 'SELECT' } });
    expect(appView.activeView.value).toBe('performance');
    expect(preventDefault).toHaveBeenCalledOnce();
  });
  it('maps F1-F3 to Library, Performance, and Display while leaving F4 unused', async () => {
    const appView = await setupShortcuts();

    dispatchKey('F2');
    expect(appView.activeView.value).toBe('performance');

    const f3PreventDefault = dispatchKey('F3');
    expect(appView.activeView.value).toBe('display');
    expect(f3PreventDefault).toHaveBeenCalled();

    const f4PreventDefault = dispatchKey('F4');
    expect(appView.activeView.value).toBe('display');
    expect(f4PreventDefault).not.toHaveBeenCalled();
  });

  it('maps F9 to Settings, preserves return context, and focuses its Folder trigger', async () => {
    const settingsTrigger = {
      focus: vi.fn(() => {
        document.activeElement = settingsTrigger;
      }),
    };
    vi.stubGlobal('document', {
      activeElement: null,
      querySelector: vi.fn((selector) =>
        selector === '[data-app-workflow-trigger="settings"]'
          ? settingsTrigger
          : null,
      ),
    });
    const appView = await setupShortcuts();
    appView.setActiveView('display');

    const f9PreventDefault = dispatchKey('F9');
    await nextTick();

    expect(appView.activeView.value).toBe('settings');
    expect(appView.returnView.value).toBe('display');
    expect(f9PreventDefault).toHaveBeenCalled();
    expect(settingsTrigger.focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(settingsTrigger);
  });

  it('moves focus to the selected workflow destination when an F-key leaves Settings', async () => {
    const workflowTrigger = {
      focus: vi.fn(() => {
        document.activeElement = workflowTrigger;
      }),
    };
    vi.stubGlobal('document', {
      activeElement: null,
      querySelector: vi.fn((selector) =>
        selector === '[data-app-workflow-trigger="performance"]'
          ? workflowTrigger
          : null,
      ),
    });
    const appView = await setupShortcuts();
    appView.openSettings();

    dispatchKey('F2');
    await nextTick();

    expect(appView.activeView.value).toBe('performance');
    expect(workflowTrigger.focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(workflowTrigger);
  });

  it('maps F5-F8 to the hidden Music Analysis, Diagnostics, Lyrics Provider Review, and Visual System workbenches', async () => {
    const appView = await setupShortcuts({
      internalViewShortcuts: {
        f5: 'music-analysis',
        f6: 'diagnostics-workbench',
        f7: 'lyrics-provider-review',
        f8: 'visual-system',
      },
    });

    const f5PreventDefault = dispatchKey('F5');
    expect(appView.activeView.value).toBe('music-analysis');
    expect(f5PreventDefault).toHaveBeenCalled();

    const f6PreventDefault = dispatchKey('F6');
    expect(appView.activeView.value).toBe('diagnostics-workbench');
    expect(f6PreventDefault).toHaveBeenCalled();

    const f7PreventDefault = dispatchKey('F7');
    expect(appView.activeView.value).toBe('lyrics-provider-review');
    expect(f7PreventDefault).toHaveBeenCalled();

    const f8PreventDefault = dispatchKey('F8');
    expect(appView.activeView.value).toBe('visual-system');
    expect(f8PreventDefault).toHaveBeenCalled();
  });

  it('leaves F5-F8 unused when internal workbenches are disabled', async () => {
    const appView = await setupShortcuts({
      internalViewShortcuts: {},
    });

    const f5PreventDefault = dispatchKey('F5');
    expect(appView.activeView.value).toBe('library');
    expect(f5PreventDefault).not.toHaveBeenCalled();

    const f6PreventDefault = dispatchKey('F6');
    expect(appView.activeView.value).toBe('library');
    expect(f6PreventDefault).not.toHaveBeenCalled();

    const f7PreventDefault = dispatchKey('F7');
    expect(appView.activeView.value).toBe('library');
    expect(f7PreventDefault).not.toHaveBeenCalled();

    const f8PreventDefault = dispatchKey('F8');
    expect(appView.activeView.value).toBe('library');
    expect(f8PreventDefault).not.toHaveBeenCalled();
  });

  it('maps K to adding an OBS session marker', async () => {
    await setupShortcuts();

    dispatchKey('k');

    expect(addMarkerMock).toHaveBeenCalledOnce();
  });

  it('maps M and G to mute and capture guide vocal without preventing default', async () => {
    await setupShortcuts();

    expect(dispatchKey('m')).not.toHaveBeenCalled();
    expect(dispatchKey('G')).not.toHaveBeenCalled();

    expect(player.toggleMute).toHaveBeenCalledOnce();
    expect(player.toggleCaptureGuideVocal).toHaveBeenCalledOnce();
  });

  it('adjusts volume by 10% with ArrowUp/ArrowDown and clamps to 0..1', async () => {
    await setupShortcuts();

    expect(dispatchKey('ArrowUp')).toHaveBeenCalled();
    expect(player.setVolume).toHaveBeenLastCalledWith(0.6);

    player.state.volume = 0.95;
    dispatchKey('ArrowUp');
    expect(player.setVolume).toHaveBeenLastCalledWith(1);

    player.state.volume = 0.05;
    expect(dispatchKey('ArrowDown')).toHaveBeenCalled();
    expect(player.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('maps Ctrl+ArrowUp/Down to transpose and Ctrl+Shift+ArrowUp/Down to tempo', async () => {
    await setupShortcuts();

    expect(dispatchKey('ArrowUp', { ctrlKey: true })).toHaveBeenCalled();
    expect(player.setTransposeSemitones).toHaveBeenLastCalledWith(1);
    dispatchKey('ArrowDown', { ctrlKey: true });
    expect(player.setTransposeSemitones).toHaveBeenLastCalledWith(-1);

    dispatchKey('ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(player.setTempoRate).toHaveBeenLastCalledWith(1.05);
    dispatchKey('ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(player.setTempoRate).toHaveBeenLastCalledWith(0.95);
    expect(player.setVolume).not.toHaveBeenCalled();
  });

  it('ignores every non-F-key shortcut while typing in an editable field', async () => {
    await setupShortcuts();

    for (const modifiers of [
      { key: 'm' },
      { key: 'g' },
      { key: 'k' },
      { key: 'ArrowUp' },
      { key: 'ArrowUp', ctrlKey: true },
      { key: 'ArrowUp', ctrlKey: true, shiftKey: true },
    ]) {
      const { key, ...rest } = modifiers;
      expect(
        dispatchKey(key, { ...rest, target: EDITABLE_TARGET }),
      ).not.toHaveBeenCalled();
    }

    expect(player.toggleMute).not.toHaveBeenCalled();
    expect(player.toggleCaptureGuideVocal).not.toHaveBeenCalled();
    expect(addMarkerMock).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();
    expect(player.setTransposeSemitones).not.toHaveBeenCalled();
    expect(player.setTempoRate).not.toHaveBeenCalled();
  });

  it('still switches destinations from an editable field', async () => {
    const appView = await setupShortcuts();

    dispatchKey('F2', { target: EDITABLE_TARGET });

    expect(appView.activeView.value).toBe('performance');
  });

  it('reserves Alt and Meta combinations, including F-keys', async () => {
    const appView = await setupShortcuts();

    for (const modifiers of [{ altKey: true }, { metaKey: true }]) {
      dispatchKey('F2', modifiers);
      dispatchKey('m', modifiers);
      dispatchKey('ArrowUp', modifiers);
      dispatchKey('ArrowUp', { ...modifiers, ctrlKey: true });
    }

    expect(appView.activeView.value).toBe('library');
    expect(player.toggleMute).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();
    expect(player.setTransposeSemitones).not.toHaveBeenCalled();
  });

  it('does not treat other Ctrl combinations as plain shortcuts', async () => {
    const appView = await setupShortcuts();

    dispatchKey('m', { ctrlKey: true });
    dispatchKey('k', { ctrlKey: true });
    dispatchKey('F2', { ctrlKey: true });

    expect(player.toggleMute).not.toHaveBeenCalled();
    expect(addMarkerMock).not.toHaveBeenCalled();
    expect(appView.activeView.value).toBe('library');
  });

  it('ignores unbound keys', async () => {
    await setupShortcuts();

    expect(dispatchKey('x')).not.toHaveBeenCalled();
    expect(dispatchKey(' ')).not.toHaveBeenCalled();
  });

  describe('history traversal', () => {
    it('maps Alt+ArrowLeft/Right to back and forward, even while typing', async () => {
      await setupShortcuts();

      expect(
        dispatchKey('ArrowLeft', { altKey: true, target: EDITABLE_TARGET }),
      ).toHaveBeenCalled();
      expect(requestHistoryTraversal).toHaveBeenLastCalledWith('back');

      expect(
        dispatchKey('ArrowRight', { altKey: true, shiftKey: true }),
      ).toHaveBeenCalled();
      expect(requestHistoryTraversal).toHaveBeenLastCalledWith('forward');
    });

    it('maps the browser navigation keys to back and forward', async () => {
      await setupShortcuts();

      expect(dispatchKey('BrowserBack')).toHaveBeenCalled();
      expect(requestHistoryTraversal).toHaveBeenLastCalledWith('back');
      expect(dispatchKey('BrowserForward')).toHaveBeenCalled();
      expect(requestHistoryTraversal).toHaveBeenLastCalledWith('forward');
    });

    it('does not traverse on key auto-repeat but still blocks the default', async () => {
      await setupShortcuts();

      expect(
        dispatchKey('ArrowLeft', { altKey: true, repeat: true }),
      ).toHaveBeenCalled();
      dispatchKey('BrowserBack', { repeat: true });

      expect(requestHistoryTraversal).not.toHaveBeenCalled();
    });

    it('yields Alt+Arrow to a component that already handled the event', async () => {
      await setupShortcuts();

      expect(
        dispatchKey('ArrowLeft', { altKey: true, defaultPrevented: true }),
      ).not.toHaveBeenCalled();
      expect(requestHistoryTraversal).not.toHaveBeenCalled();
    });

    it('ignores unrelated Alt and Arrow combinations', async () => {
      await setupShortcuts();

      dispatchKey('ArrowLeft');
      dispatchKey('ArrowUp', { altKey: true });
      dispatchKey('ArrowLeft', { altKey: true, ctrlKey: true });
      dispatchKey('ArrowLeft', { metaKey: true });

      expect(requestHistoryTraversal).not.toHaveBeenCalled();
    });
  });
});
