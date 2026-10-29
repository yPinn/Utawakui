import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultShortcutConfiguration } from '../../shared/keyboardShortcutContract.mjs';
import {
  useKeyboardShortcutSettings,
  createKeyboardShortcutSettings,
} from './useKeyboardShortcutSettings.js';

afterEach(() => vi.useRealTimers());
it.each(['failed', 'pending', 'timeout'])(
  'can stop confirmed background bindings while runtime status is %s',
  async (mode) => {
    if (mode !== 'failed') vi.useFakeTimers();
    const pendingRuntime = Promise.withResolvers();
    const runtime = {
      state: 'active',
      busy: false,
      eligibleCommands: ['player.next'],
      active: [],
    };
    const cfg = { ...defaultShortcutConfiguration(), globalEnabled: true };
    const bridge = {
      getKeyboardShortcuts: vi.fn(async () => ({
        status: 'ready',
        revision: 'a'.repeat(64),
        configuration: cfg,
        runtime,
      })),
      getKeyboardShortcutRuntime: vi.fn(() =>
        mode === 'failed'
          ? Promise.reject(Error('private runtime'))
          : pendingRuntime.promise,
      ),
      setKeyboardShortcuts: vi.fn(async (input) => ({
        status: 'ready',
        revision: 'b'.repeat(64),
        configuration: input.configuration,
        runtime: { ...runtime, state: 'disabled', sessionDisabled: true },
      })),
      enableKeyboardShortcuts: vi.fn(),
    };
    const owner = createKeyboardShortcutSettings({
      bridge,
      globalCommands: ['player.next'],
    });
    await owner.initialize();
    const reading = owner.refreshRuntime();
    if (mode === 'failed') await reading;
    if (mode === 'timeout') {
      await vi.advanceTimersByTimeAsync(10001);
      await reading;
    }
    expect(await owner.setGlobalEnabled(true)).toBe(false);
    expect(await owner.setGlobalEnabled(false)).toBe(true);
    expect(bridge.setKeyboardShortcuts).toHaveBeenCalledExactlyOnceWith({
      expectedRevision: 'a'.repeat(64),
      configuration: { ...cfg, globalEnabled: false },
    });
    expect(bridge.enableKeyboardShortcuts).not.toHaveBeenCalled();
    expect(owner.runtime.value.sessionDisabled).toBe(true);
    expect(owner.configuration.value.globalEnabled).toBe(false);
    if (mode === 'pending') {
      pendingRuntime.resolve(runtime);
      await reading;
      expect(owner.runtime.value.sessionDisabled).toBe(true);
    }
    owner.dispose();
  },
);
it('allows an explicit stop retry after both runtime reading and stop persistence fail', async () => {
  const cfg = { ...defaultShortcutConfiguration(), globalEnabled: true };
  const bridge = {
    getKeyboardShortcuts: vi.fn(async () => ({
      status: 'ready',
      revision: 'a'.repeat(64),
      configuration: cfg,
    })),
    getKeyboardShortcutRuntime: vi
      .fn()
      .mockRejectedValue(Error('runtime unavailable')),
    setKeyboardShortcuts: vi
      .fn()
      .mockRejectedValueOnce(Error('disk unavailable'))
      .mockImplementation(async (input) => ({
        status: 'ready',
        revision: 'b'.repeat(64),
        configuration: input.configuration,
      })),
    enableKeyboardShortcuts: vi.fn(),
  };
  const owner = createKeyboardShortcutSettings({
    bridge,
    globalCommands: ['player.next'],
  });
  await owner.initialize();
  await owner.refreshRuntime();
  expect(await owner.setGlobalEnabled(false)).toBe(false);
  expect(owner.configuration.value.globalEnabled).toBe(true);
  expect(owner.state.saveError).toBeTruthy();
  expect(await owner.setGlobalEnabled(false)).toBe(true);
  expect(bridge.setKeyboardShortcuts).toHaveBeenCalledTimes(2);
  expect(bridge.enableKeyboardShortcuts).not.toHaveBeenCalled();
  owner.dispose();
});
it.each(['production', 'unknown', 'invalid', 'disposed'])(
  'runtime projection cannot grant a stop action to %s settings',
  async (kind) => {
    const runtime = {
      state: 'active',
      busy: false,
      eligibleCommands: ['player.next'],
      active: [],
    };
    const bridge = {
      getKeyboardShortcuts: vi.fn(async () =>
        kind === 'invalid'
          ? { status: 'invalid' }
          : {
              status: 'ready',
              revision: 'a'.repeat(64),
              configuration: {
                ...defaultShortcutConfiguration(),
                globalEnabled: true,
              },
            },
      ),
      getKeyboardShortcutRuntime: vi.fn(async () => runtime),
      setKeyboardShortcuts: vi.fn(),
    };
    const owner =
      kind === 'production'
        ? useKeyboardShortcutSettings({ bridge })
        : createKeyboardShortcutSettings({
            bridge,
            globalCommands:
              kind === 'unknown' ? ['unknown.command'] : ['player.next'],
          });
    await owner.initialize();
    await owner.refreshRuntime();
    if (kind === 'disposed') owner.dispose();
    expect(owner.canStopGlobal.value).toBe(false);
    expect(await owner.setGlobalEnabled(false)).toBe(false);
    expect(bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    owner.dispose();
  },
);
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
it('isolates background capability from the production singleton and preserves App bindings', async () => {
  const f = setup();
  f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue({
    state: 'disabled',
    busy: false,
    eligibleCommands: ['player.next'],
    active: [],
  });
  const owner = createKeyboardShortcutSettings({
    bridge: f.bridge,
    globalCommands: ['player.next'],
  });
  await owner.initialize();
  await owner.refreshRuntime();
  await f.owner.initialize();
  await f.owner.refreshRuntime();
  expect(owner.canConfigure('player.next', 'global')).toBe(true);
  expect(f.owner.canConfigure('player.next', 'global')).toBe(false);
  expect(owner.canConfigure('player.previous', 'global')).toBe(false);
  const next = owner.configurationFor(
    'player.next',
    { key: 'j', ctrl: true, alt: false, shift: true },
    'global',
  );
  expect(next.globalEnabled).toBe(false);
  expect(next.bindings.find((b) => b.command === 'player.next').app).toEqual({
    mode: 'default',
  });
  expect(() =>
    f.owner.configurationFor(
      'player.next',
      next.bindings.find((b) => b.command === 'player.next').global,
      'global',
    ),
  ).toThrow();
  owner.dispose();
  f.owner.dispose();
});
it('only the explicit enable action uses the fixed enable bridge and keeps failed activation separate from persistence', async () => {
  const f = setup();
  const cfg = {
    ...defaultShortcutConfiguration(),
    bindings: defaultShortcutConfiguration().bindings.map((b) =>
      b.command === 'player.next'
        ? { ...b, global: { key: 'j', ctrl: true, alt: false, shift: true } }
        : b,
    ),
  };
  const runtime = {
    state: 'disabled',
    busy: false,
    eligibleCommands: ['player.next'],
    active: [],
  };
  f.bridge.getKeyboardShortcuts.mockResolvedValue({
    status: 'ready',
    revision,
    configuration: cfg,
  });
  f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue(runtime);
  f.bridge.enableKeyboardShortcuts = vi.fn(async (input) => ({
    status: 'ready',
    revision: nextRevision,
    configuration: input.configuration,
    runtime: { ...runtime, state: 'degraded' },
  }));
  const owner = createKeyboardShortcutSettings({
    bridge: f.bridge,
    globalCommands: ['player.next'],
  });
  await owner.initialize();
  await owner.refreshRuntime();
  expect(await owner.setGlobalEnabled(true)).toBe(true);
  expect(f.bridge.enableKeyboardShortcuts).toHaveBeenCalledTimes(1);
  expect(f.bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
  expect(owner.configuration.value.globalEnabled).toBe(true);
  expect(owner.runtimePresentation.value.status).toBe('暫停使用');
  owner.dispose();
  f.owner.dispose();
});
it('trial tests an enabled candidate without saving or changing confirmed configuration and bounds failure text', async () => {
  const f = setup();
  const runtime = {
    state: 'disabled',
    busy: false,
    eligibleCommands: ['player.next'],
    active: [],
  };
  f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue(runtime);
  f.bridge.testKeyboardShortcuts = vi
    .fn()
    .mockResolvedValue({ status: 'tested', runtime });
  const owner = createKeyboardShortcutSettings({
    bridge: f.bridge,
    globalCommands: ['player.next'],
  });
  await owner.initialize();
  await owner.refreshRuntime();
  const before = owner.configuration.value;
  const chord = { key: 'j', ctrl: true, alt: false, shift: true };
  expect(await owner.testBinding('player.next', chord)).toBe(true);
  expect(f.bridge.testKeyboardShortcuts.mock.calls[0][0]).toMatchObject({
    expectedRevision: null,
    configuration: { globalEnabled: true },
  });
  expect(f.bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
  expect(owner.configuration.value).toBe(before);
  f.bridge.testKeyboardShortcuts.mockResolvedValue({
    status: 'occupied',
    private: 'E:/secret',
    runtime,
  });
  expect(await owner.testBinding('player.next', chord)).toBe(false);
  expect(owner.state.testError).toContain('其他程式');
  expect(JSON.stringify(owner.state)).not.toContain('secret');
  owner.dispose();
  f.owner.dispose();
});
it('separates a failed stop save from the stopped runtime and cannot re-enable through an App edit or read', async () => {
  const f = setup();
  const cfg = { ...defaultShortcutConfiguration(), globalEnabled: true };
  f.bridge.getKeyboardShortcuts.mockResolvedValue({
    status: 'ready',
    revision,
    configuration: cfg,
  });
  const runtime = {
    state: 'disabled',
    busy: false,
    eligibleCommands: ['player.next'],
    active: [],
    sessionDisabled: true,
  };
  f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue(runtime);
  const owner = createKeyboardShortcutSettings({
    bridge: f.bridge,
    globalCommands: ['player.next'],
  });
  await owner.initialize();
  await owner.refreshRuntime();
  f.bridge.setKeyboardShortcuts.mockRejectedValue(Error('private disk'));
  expect(await owner.setGlobalEnabled(false)).toBe(false);
  expect(owner.configuration.value.globalEnabled).toBe(true);
  expect(owner.runtime.value.sessionDisabled).toBe(true);
  expect(owner.runtimePresentation.value.status).toBe('本次已停用');
  expect(owner.state.saveError).toContain('重新讀取');
  await owner.refresh();
  expect(owner.runtime.value.sessionDisabled).toBe(true);
  await owner.saveBinding('player.next', { mode: 'disabled' });
  expect(
    f.bridge.setKeyboardShortcuts.mock.calls.at(-1)[0].configuration
      .globalEnabled,
  ).toBe(false);
  owner.dispose();
  f.owner.dispose();
});
it('trial timeout and disposal never authorize a late result or mutate confirmed preferences', async () => {
  vi.useFakeTimers();
  const f = setup();
  const runtime = {
    state: 'disabled',
    busy: false,
    eligibleCommands: ['player.next'],
    active: [],
  };
  f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue(runtime);
  const pending = Promise.withResolvers();
  f.bridge.testKeyboardShortcuts = vi.fn().mockReturnValue(pending.promise);
  const owner = createKeyboardShortcutSettings({
    bridge: f.bridge,
    globalCommands: ['player.next'],
  });
  await owner.initialize();
  await owner.refreshRuntime();
  const testing = owner.testBinding('player.next', {
    key: 'j',
    ctrl: true,
    alt: false,
    shift: true,
  });
  expect(owner.state.testing).toBe(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await testing).toBe(false);
  expect(owner.canConfigure('player.next', 'global')).toBe(false);
  pending.resolve({ status: 'tested', runtime });
  await Promise.resolve();
  expect(owner.runtime.value).toBeNull();
  expect(owner.configuration.value).toEqual(defaultShortcutConfiguration());
  owner.dispose();
  f.owner.dispose();
});

describe('shared machine shortcut settings owner', () => {
  it('reads runtime status separately without saving, activating or disabling App preferences', async () => {
    const f = setup();
    f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue({
      state: 'disabled',
      busy: false,
      eligibleCommands: [],
      active: [],
    });
    await f.owner.initialize();
    const configuration = f.owner.configuration.value;
    expect(await f.owner.refreshRuntime()).toBe(true);
    expect(f.owner.runtimePresentation.value.status).toBe('尚未開放');
    expect(f.owner.configuration.value).toBe(configuration);
    expect(f.owner.state.loaded).toBe(true);
    expect(f.bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    f.owner.dispose();
  });
  it('fails closed on malformed runtime and retries without changing saved bindings', async () => {
    const f = setup();
    f.bridge.getKeyboardShortcutRuntime = vi.fn().mockResolvedValue({
      state: 'active',
      busy: false,
      eligibleCommands: ['arbitrary'],
      active: [],
    });
    await f.owner.initialize();
    expect(await f.owner.refreshRuntime()).toBe(false);
    expect(f.owner.runtimePresentation.value).toBe(null);
    expect(f.owner.state.runtimeError).toContain('重新讀取');
    expect(f.owner.canEdit.value).toBe(true);
    f.bridge.getKeyboardShortcutRuntime.mockResolvedValue({
      state: 'disabled',
      busy: false,
      eligibleCommands: [],
      active: [],
    });
    expect(await f.owner.refreshRuntime()).toBe(true);
    expect(f.owner.state.runtimeError).toBe('');
    expect(f.bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    f.owner.dispose();
  });
  it('does not overlap runtime reads or apply a reply after disposal', async () => {
    const f = setup(),
      pending = deferred();
    f.bridge.getKeyboardShortcutRuntime = vi
      .fn()
      .mockReturnValue(pending.promise);
    const reading = f.owner.refreshRuntime();
    expect(await f.owner.refreshRuntime()).toBe(false);
    f.owner.dispose();
    pending.resolve({
      state: 'disabled',
      busy: false,
      eligibleCommands: [],
      active: [],
    });
    expect(await reading).toBe(false);
    expect(f.owner.runtimePresentation.value).toBe(null);
    expect(f.owner.state.runtimeReading).toBe(false);
    expect(f.bridge.getKeyboardShortcutRuntime).toHaveBeenCalledTimes(1);
  });
  it('bounds a hung runtime read and ignores its eventual reply', async () => {
    vi.useFakeTimers();
    const f = setup(),
      pending = deferred();
    f.bridge.getKeyboardShortcutRuntime = vi
      .fn()
      .mockReturnValue(pending.promise);
    const reading = f.owner.refreshRuntime();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await reading).toBe(false);
    pending.resolve({
      state: 'disabled',
      busy: false,
      eligibleCommands: [],
      active: [],
    });
    await Promise.resolve();
    expect(f.owner.runtimePresentation.value).toBe(null);
    expect(f.owner.state.runtimeReading).toBe(false);
    f.owner.dispose();
  });
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
