import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultShortcutConfiguration } from '../../shared/keyboardShortcutContract.mjs';
import { useKeyboardShortcutSettings } from './useKeyboardShortcutSettings.js';

afterEach(() => vi.useRealTimers());
const revision = 'a'.repeat(64),
  nextRevision = 'b'.repeat(64);
const config = () => ({
  ...defaultShortcutConfiguration(),
  bindings: defaultShortcutConfiguration().bindings.map((b) =>
    b.command === 'player.next'
      ? {
          ...b,
          app: {
            mode: 'custom',
            chord: { key: 'j', ctrl: true, alt: false, shift: false },
          },
        }
      : b,
  ),
});
const deferred = () => Promise.withResolvers();
function setup() {
  const bridge = {
    getKeyboardShortcuts: vi.fn().mockResolvedValue({
      status: 'ready',
      revision: null,
      configuration: defaultShortcutConfiguration(),
    }),
    setKeyboardShortcuts: vi.fn().mockResolvedValue({
      status: 'ready',
      revision,
      configuration: config(),
    }),
  };
  return { bridge, owner: useKeyboardShortcutSettings({ bridge }) };
}

describe('shared machine shortcut settings owner', () => {
  it('rejects fabricated write acknowledgements without activating them', async () => {
    for (const reply of [
      { status: 'ready', revision: null, configuration: config() },
      {
        status: 'ready',
        revision,
        configuration: defaultShortcutConfiguration(),
      },
      { status: 'ready', revision: 'private', configuration: config() },
    ]) {
      const f = setup();
      await f.owner.initialize();
      f.bridge.setKeyboardShortcuts.mockResolvedValue(reply);
      expect(await f.owner.save(config())).toBe(false);
      expect(f.owner.configuration.value).toEqual(
        defaultShortcutConfiguration(),
      );
      expect(f.owner.state.saveError).toBeTruthy();
    }
  });
  it('does not activate a timed-out or disposed write when its late acknowledgement arrives', async () => {
    vi.useFakeTimers();
    for (const dispose of [false, true]) {
      const f = setup();
      await f.owner.initialize();
      const d = deferred();
      f.bridge.setKeyboardShortcuts.mockReturnValue(d.promise);
      const task = f.owner.save(config());
      if (dispose) f.owner.dispose();
      else await vi.advanceTimersByTimeAsync(10001);
      d.resolve({ status: 'ready', revision, configuration: config() });
      expect(await task).toBe(false);
      expect(f.owner.configuration.value).toEqual(
        defaultShortcutConfiguration(),
      );
      expect(f.owner.state.busy).toBe(false);
    }
  });
  it('shares one confirmed owner per bridge, initializes once and remains independent of the library', async () => {
    const f = setup();
    expect(useKeyboardShortcutSettings({ bridge: f.bridge })).toBe(f.owner);
    await Promise.all([f.owner.initialize(), f.owner.initialize()]);
    expect(f.bridge.getKeyboardShortcuts).toHaveBeenCalledOnce();
    expect(f.owner.state.loaded).toBe(true);
    expect(f.owner.configuration.value).toEqual(defaultShortcutConfiguration());
  });
  it('activates only a confirmed save, forwards CAS and refuses queued writes', async () => {
    const f = setup();
    await f.owner.initialize();
    const d = deferred();
    f.bridge.setKeyboardShortcuts.mockReturnValue(d.promise);
    const saved = f.owner.saveBinding('player.next', config().bindings[2].app);
    expect(f.owner.configuration.value).toEqual(defaultShortcutConfiguration());
    expect(await f.owner.saveBinding('player.next', { mode: 'disabled' })).toBe(
      false,
    );
    expect(f.bridge.setKeyboardShortcuts).toHaveBeenCalledWith({
      expectedRevision: null,
      configuration: config(),
    });
    d.resolve({ status: 'ready', revision, configuration: config() });
    expect(await saved).toBe(true);
    expect(f.owner.configuration.value).toEqual(config());
    expect(f.owner.state.busy).toBe(false);
  });
  it('keeps active bindings and candidate error on an unconfirmed/failed write', async () => {
    const f = setup();
    await f.owner.initialize();
    f.bridge.setKeyboardShortcuts.mockRejectedValue(Error('private path'));
    expect(await f.owner.save(config())).toBe(false);
    expect(f.owner.configuration.value).toEqual(defaultShortcutConfiguration());
    expect(f.owner.state.saveError).not.toContain('private');
    expect(f.owner.state.saveError).toBeTruthy();
  });
  it.each(['invalid', 'unsupported', 'conflict'])(
    'deactivates stale custom bindings and requires a fresh read on %s',
    async (status) => {
      const f = setup();
      f.bridge.getKeyboardShortcuts.mockResolvedValue({
        status: 'ready',
        revision,
        configuration: config(),
      });
      await f.owner.initialize();
      f.bridge.setKeyboardShortcuts.mockResolvedValue({ status });
      expect(await f.owner.restoreAll()).toBe(false);
      expect(f.owner.configuration.value).toEqual(
        defaultShortcutConfiguration(),
      );
      expect(f.owner.canEdit.value).toBe(false);
      expect(f.owner.state.readError).toBeTruthy();
    },
  );
  it('blocks edits and custom activation on bad reads or fabricated missing-file custom settings', async () => {
    for (const reply of [
      { status: 'invalid' },
      { status: 'unsupported' },
      { status: 'ready', revision: null, configuration: config() },
      { status: 'ready', revision: 'bad', configuration: config() },
    ]) {
      const f = setup();
      f.bridge.getKeyboardShortcuts.mockResolvedValue(reply);
      await f.owner.initialize();
      expect(f.owner.canEdit.value).toBe(false);
      expect(await f.owner.save(config())).toBe(false);
      expect(f.bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    }
  });
  it('validates fixed/wildcard conflicts before IPC, and restores only the selected row', async () => {
    const f = setup();
    await f.owner.initialize();
    expect(() =>
      f.owner.configurationFor('player.next', {
        mode: 'custom',
        chord: { key: 'm', ctrl: false, alt: false, shift: true },
      }),
    ).toThrow('conflict');
    expect(
      await f.owner.saveBinding('player.next', {
        mode: 'custom',
        chord: { key: 'm', ctrl: false, alt: false, shift: true },
      }),
    ).toBe(false);
    expect(f.bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    await f.owner.save(config());
    f.bridge.setKeyboardShortcuts.mockImplementation(async (input) => ({
      status: 'ready',
      revision: nextRevision,
      configuration: input.configuration,
    }));
    expect(
      await f.owner.saveBinding('player.transpose-up', { mode: 'disabled' }),
    ).toBe(true);
    expect(f.owner.configuration.value.bindings[2].app.mode).toBe('custom');
    expect(f.owner.configuration.value.bindings[3].app.mode).toBe('disabled');
  });
  it('holds a recording token until its owner finishes, without letting a stale recorder clear a new one', async () => {
    const f = setup();
    expect(f.owner.beginRecording('player.next')).toBeNull();
    await f.owner.initialize();
    const first = f.owner.beginRecording('player.next'),
      second = f.owner.beginRecording('player.previous');
    expect(f.owner.isRecording.value).toBe(true);
    f.owner.finishRecording(first);
    expect(f.owner.isRecording.value).toBe(true);
    f.owner.finishRecording(second);
    expect(f.owner.isRecording.value).toBe(false);
    expect(f.owner.beginRecording('arbitrary')).toBeNull();
  });
  it('bounds read/save waits and ignores replies after disposal', async () => {
    vi.useFakeTimers();
    const f = setup(),
      d = deferred();
    f.bridge.getKeyboardShortcuts.mockReturnValue(d.promise);
    const read = f.owner.initialize();
    await vi.advanceTimersByTimeAsync(10001);
    await read;
    expect(f.owner.state.readError).toBeTruthy();
    expect(f.owner.state.reading).toBe(false);
    d.resolve({ status: 'ready', revision, configuration: config() });
    await Promise.resolve();
    expect(f.owner.configuration.value).toEqual(defaultShortcutConfiguration());
    const g = setup();
    const late = deferred();
    g.bridge.getKeyboardShortcuts.mockReturnValue(late.promise);
    const pending = g.owner.initialize();
    g.owner.dispose();
    late.resolve({ status: 'ready', revision, configuration: config() });
    await pending;
    expect(g.owner.state.loaded).toBe(false);
  });
});
