import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick } from 'vue';
import { mount } from '../components/ui/uiTestHost.js';
import { useKeyboardShortcutRecorder } from './useKeyboardShortcutRecorder.js';
import {
  defaultShortcutConfiguration,
  validateShortcutConfiguration,
} from '../../shared/keyboardShortcutContract.mjs';
import { LEGACY_KEYBOARD_BINDINGS } from '../../shared/keyboardBindingDefinitions.mjs';
let mounted, listeners;
beforeEach(() => {
  listeners = {};
  vi.stubGlobal('window', {
    addEventListener: vi.fn((name, fn) => (listeners[name] = fn)),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  mounted?.app.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});
function setup() {
  const token = Symbol(),
    settings = {
      beginRecording: vi.fn(() => token),
      finishRecording: vi.fn(),
      saveBinding: vi.fn().mockResolvedValue(true),
      configurationFor: (id, app) =>
        validateShortcutConfiguration(
          {
            ...defaultShortcutConfiguration(),
            bindings: defaultShortcutConfiguration().bindings.map((b) =>
              b.command === id ? { ...b, app } : b,
            ),
          },
          LEGACY_KEYBOARD_BINDINGS,
        ),
    };
  const focus = vi.fn();
  let recorder;
  mounted = mount({
    setup() {
      recorder = useKeyboardShortcutRecorder({ settings, focusCommand: focus });
      return () => h('div');
    },
  });
  return { settings, focus, recorder, token };
}
const key = (value, extra = {}) => ({
  key: value,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});
describe('shortcut recording lifecycle', () => {
  it('uses global Escape/hidden cancellation and bounds unexpected save errors without clearing a committed intent', async () => {
    const doc = {
      hidden: false,
      addEventListener: vi.fn((name, listener) => (listeners[name] = listener)),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', doc);
    const f = setup();
    expect(await f.recorder.apply()).toBe(false);
    f.recorder.begin('player.next');
    listeners.keydown(key('Escape'));
    expect(f.recorder.state.command).toBeNull();
    f.recorder.begin('player.next');
    doc.hidden = true;
    listeners.visibilitychange();
    expect(f.recorder.state.command).toBeNull();
    f.recorder.begin('player.next');
    f.recorder.capture(key('j', { ctrlKey: true }));
    const d = Promise.withResolvers();
    f.settings.saveBinding.mockReturnValue(d.promise);
    const task = f.recorder.apply();
    f.recorder.cancel();
    expect(f.recorder.begin('player.previous')).toBe(false);
    expect(f.recorder.state.command).toBe('player.next');
    d.reject(Error('private path'));
    expect(await task).toBe(false);
    expect(f.recorder.state.error).not.toContain('private');
    expect(f.recorder.state.candidate.key).toBe('j');
  });
  it('captures a candidate without executing or saving until Apply, keeping the recording session active', async () => {
    const f = setup();
    expect(f.recorder.begin('player.next')).toBe(true);
    f.recorder.capture(key('Control', { ctrlKey: true }));
    expect(f.recorder.state.candidate).toBeNull();
    f.recorder.capture(key('J', { ctrlKey: true }));
    expect(f.recorder.state.capturing).toBe(false);
    expect(f.settings.saveBinding).not.toHaveBeenCalled();
    expect(f.settings.finishRecording).not.toHaveBeenCalled();
    expect(await f.recorder.apply()).toBe(true);
    await nextTick();
    expect(f.settings.saveBinding).toHaveBeenCalledWith('player.next', {
      mode: 'custom',
      chord: { key: 'j', ctrl: true, alt: false, shift: false },
    });
    expect(f.settings.finishRecording).toHaveBeenCalledWith(f.token);
    expect(f.focus).toHaveBeenCalledWith('player.next');
  });
  it.each([
    { key: 'F9' },
    { key: 'Process', isComposing: true },
    { key: 'j', ctrlKey: true, altKey: true },
    { key: 'j', metaKey: true },
    { key: '1', location: 3 },
  ])('rejects reserved/IME/AltGr/Meta/numpad candidates %j', (value) => {
    const f = setup();
    f.recorder.begin('player.next');
    f.recorder.capture(key(value.key, value));
    expect(f.recorder.state.candidate).toBeNull();
    expect(f.recorder.state.error).toBeTruthy();
    expect(f.settings.saveBinding).not.toHaveBeenCalled();
  });
  it('explains a fixed wildcard conflict and ignores auto-repeat or already handled input', () => {
    const f = setup();
    f.recorder.begin('player.next');
    f.recorder.capture(key('m', { shiftKey: true }));
    expect(f.recorder.state.error).toContain('歌曲靜音');
    f.recorder.capture(key('j', { ctrlKey: true, repeat: true }));
    expect(f.recorder.state.candidate).toBeNull();
    f.recorder.capture(key('j', { ctrlKey: true, defaultPrevented: true }));
    expect(f.recorder.state.candidate).toBeNull();
  });
  it.each(['Escape', 'Tab'])(
    'cancels %s without saving a partial chord',
    (value) => {
      const f = setup();
      f.recorder.begin('player.next');
      const event = key(value);
      f.recorder.capture(event);
      expect(f.recorder.state.command).toBeNull();
      expect(f.settings.saveBinding).not.toHaveBeenCalled();
      if (value === 'Tab') expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );
  it('cancels on native blur and unmount, with no late focus from a committed save', async () => {
    const f = setup();
    f.recorder.begin('player.next');
    listeners.blur();
    expect(f.recorder.state.command).toBeNull();
    f.recorder.begin('player.next');
    f.recorder.capture(key('j', { ctrlKey: true }));
    const d = Promise.withResolvers();
    f.settings.saveBinding.mockReturnValue(d.promise);
    const task = f.recorder.apply();
    mounted.app.unmount();
    mounted = null;
    d.resolve(true);
    await task;
    await nextTick();
    expect(f.focus).not.toHaveBeenCalled();
    expect(window.removeEventListener).toHaveBeenCalled();
  });
  it('retains a failed complete candidate for retry, and does not record if the owner is unavailable', async () => {
    const f = setup();
    f.settings.beginRecording.mockReturnValueOnce(null);
    expect(f.recorder.begin('player.next')).toBe(false);
    f.recorder.begin('player.next');
    f.recorder.capture(key('j', { ctrlKey: true }));
    f.settings.saveBinding.mockResolvedValue(false);
    expect(await f.recorder.apply()).toBe(false);
    expect(f.recorder.state.candidate.key).toBe('j');
    expect(f.recorder.state.saving).toBe(false);
  });
});
