import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { usePlayerPerformanceSettings } from './usePlayerPerformanceSettings.js';
import { PERFORMANCE_SETTINGS_DEFAULTS as defaults } from '../../../shared/performanceSettings.mjs';
function fixture() {
  const playerState = reactive({
    track: { id: 'one', usesSeparatedAudio: true },
    ...defaults,
    guideVocalOn: true,
    pendingStartTrackId: null,
    playbackRevision: 1,
    audioControlApplication: { ok: true, applied: { ...defaults } },
  });
  const saved = {
    status: 'saved',
    trackId: 'one',
    token: 'token',
    revision: 'rev',
    libraryEpoch: 0,
    values: { ...defaults, transposeSemitones: 3 },
  };
  const bridge = {
    getPerformanceSettings: vi.fn(async () => saved),
    savePerformanceSettings: vi.fn(async (input) => ({
      ...saved,
      values: input.values,
    })),
    removePerformanceSettings: vi.fn(async () => ({
      ...saved,
      status: 'removed',
      values: null,
    })),
    cancelPerformanceSettings: vi.fn(async () => {}),
  };
  const graph = {
    isPlaybackReady: (result) => result?.ok,
    stageAudioControls: vi.fn(),
  };
  const applyValues = vi.fn(async (values) => {
    Object.assign(playerState, {
      transposeSemitones: values.transposeSemitones,
      pitchCents: values.pitchCents,
      tempoRate: values.tempoRate,
      guideVocalOn: values.monitorGuideVocalEnabled,
      audioControlApplication: { ok: true, applied: { ...values } },
    });
    return { ok: true, applied: values };
  });
  const notifications = { notify: vi.fn(), clear: vi.fn() };
  const owner = usePlayerPerformanceSettings({
    playerState,
    bridge,
    graph,
    applyValues,
    notifications,
  });
  return {
    playerState,
    saved,
    bridge,
    graph,
    applyValues,
    notifications,
    owner,
  };
}
describe('player performance settings owner', () => {
  it('keeps copied live values separate from default selection and removal of the stored destination', async () => {
    const f = fixture();
    f.saved.slots = [
      f.saved.values,
      { ...defaults, transposeSemitones: -2 },
      null,
    ];
    f.saved.defaultSlot = 1;
    f.bridge.setDefaultPerformanceSettings = vi.fn(async (input) => ({
      ...f.saved,
      defaultSlot: input.slot,
      values: f.saved.slots[input.slot - 1],
    }));
    f.bridge.removePerformanceSettings.mockResolvedValue({
      ...f.saved,
      slots: [f.saved.values, null, null],
    });
    await f.owner.prepare({ id: 'one' });
    await f.owner.copyToSlot(2);
    expect(await f.owner.setDefault()).toBe(true);
    expect(f.owner.state.snapshot.defaultSlot).toBe(2);
    expect(f.owner.state.snapshot.slots[1].transposeSemitones).toBe(-2);
    expect(f.playerState.transposeSemitones).toBe(3);
    expect(f.owner.dirty.value).toBe(true);
    expect(await f.owner.remove()).toBe(true);
    expect(f.playerState.transposeSemitones).toBe(3);
    expect(f.owner.hasSaved.value).toBe(false);
    expect(f.owner.dirty.value).toBe(true);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
    await f.owner.selectSlot(1);
    await f.owner.selectSlot(2);
    expect(f.playerState.transposeSemitones).toBe(0);
    expect(f.owner.dirty.value).toBe(false);
  });
  it('does not promote an older fulfilled DSP result after later live edits', async () => {
    const f = fixture();
    f.saved.slots = [
      f.saved.values,
      { ...defaults, transposeSemitones: -2 },
      null,
    ];
    await f.owner.prepare({ id: 'one' });
    let release;
    f.applyValues.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const pending = f.owner.selectSlot(2);
    f.playerState.transposeSemitones = 8;
    f.playerState.audioControlApplication = {
      revision: 2,
      ok: true,
      applied: { ...defaults, transposeSemitones: 8 },
    };
    release({ revision: 1, ok: true, applied: f.saved.slots[1] });
    expect(await pending).toBe(false);
    expect(f.owner.state.selectedSlot).toBe(1);
    expect(f.playerState.transposeSemitones).toBe(8);
    expect(f.notifications.notify).not.toHaveBeenCalled();
    await f.owner.save();
    expect(f.bridge.savePerformanceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ slot: 1 }),
    );
  });
  it('does not notify an expected DSP cancellation', async () => {
    const f = fixture();
    await f.owner.prepare({ id: 'one' });
    f.applyValues.mockResolvedValueOnce({ ok: false, status: 'cancelled' });
    expect(await f.owner.selectSlot(2)).toBe(false);
    expect(f.owner.state.selectedSlot).toBe(1);
    expect(f.notifications.notify).not.toHaveBeenCalled();
  });
  it('selects the saved default set on a successful paused-restore retry', async () => {
    const f = fixture();
    f.saved.slots = [null, f.saved.values, null];
    f.saved.defaultSlot = 2;
    f.bridge.getPerformanceSettings.mockResolvedValueOnce({
      status: 'invalid',
    });
    expect(await f.owner.restore(f.playerState.track)).toBe(false);
    expect(await f.owner.retry()).toBe(true);
    expect(f.owner.state.selectedSlot).toBe(2);
    expect(f.graph.stageAudioControls).toHaveBeenCalledWith(f.saved.values);
    expect(f.owner.state.blocked).toBe(false);
  });
  it.each([2, 3])(
    'resets inactive set %s directly in one live batch without loading its saved values or saving',
    async (slot) => {
      const f = fixture();
      f.saved.slots = [
        f.saved.values,
        { ...defaults, transposeSemitones: -2 },
        null,
      ];
      await f.owner.prepare({ id: 'one' });
      f.playerState.transposeSemitones = 9;
      expect(await f.owner.resetSlot(slot)).toBe(true);
      expect(f.applyValues).toHaveBeenCalledExactlyOnceWith(defaults, {
        preservePlayback: true,
      });
      expect(f.owner.state.selectedSlot).toBe(slot);
      expect(f.playerState.transposeSemitones).toBe(0);
      expect(f.owner.hasSaved.value).toBe(slot === 2);
      expect(f.owner.dirty.value).toBe(slot === 2);
      expect(f.owner.state.snapshot.slots[0]).toEqual(f.saved.values);
      expect(f.owner.state.snapshot.slots[1].transposeSemitones).toBe(-2);
      expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
      expect(f.notifications.notify).not.toHaveBeenCalled();
    },
  );
  it('copies saved source values, not temporary edits, to an unsaved destination and saves only on request', async () => {
    const f = fixture();
    f.saved.slots = [
      f.saved.values,
      null,
      { ...defaults, transposeSemitones: -2 },
    ];
    f.saved.defaultSlot = 1;
    f.bridge.savePerformanceSettings.mockImplementation(async (input) => ({
      ...f.saved,
      slots: f.saved.slots.map((value, index) =>
        index === input.slot - 1 ? input.values : value,
      ),
    }));
    await f.owner.prepare({ id: 'one' });
    f.playerState.transposeSemitones = 9;
    expect(await f.owner.copyToSlot(2)).toBe(true);
    expect(f.applyValues).toHaveBeenLastCalledWith(f.saved.slots[0], {
      preservePlayback: true,
    });
    expect(f.playerState.transposeSemitones).toBe(3);
    expect(f.owner.state.selectedSlot).toBe(2);
    expect(f.owner.dirty.value).toBe(true);
    expect(f.owner.hasSaved.value).toBe(false);
    expect(f.owner.state.snapshot.slots[1]).toBeNull();
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
    f.playerState.pitchCents = 15;
    f.playerState.audioControlApplication.applied.pitchCents = 15;
    expect(await f.owner.save()).toBe(true);
    expect(f.bridge.savePerformanceSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: 2,
        values: { ...f.saved.values, pitchCents: 15 },
      }),
    );
    expect(f.owner.state.snapshot.slots[0]).toEqual(f.saved.values);
    expect(f.owner.state.snapshot.defaultSlot).toBe(1);
    expect(f.owner.dirty.value).toBe(false);
    expect(f.notifications.notify).not.toHaveBeenCalled();
  });
  it('keeps an occupied destination unchanged until save and discards the copied draft on set switching', async () => {
    const f = fixture();
    f.saved.slots = [
      f.saved.values,
      { ...defaults, transposeSemitones: -2 },
      null,
    ];
    await f.owner.prepare({ id: 'one' });
    expect(await f.owner.copyToSlot(2)).toBe(true);
    expect(f.owner.state.snapshot.slots[1].transposeSemitones).toBe(-2);
    await f.owner.selectSlot(1);
    await f.owner.selectSlot(2);
    expect(f.playerState.transposeSemitones).toBe(-2);
    expect(f.owner.dirty.value).toBe(false);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
  });
  it('keeps a copied default-valued empty set unsaved, including after cancelling a replacement start', async () => {
    const f = fixture();
    f.saved.values = { ...defaults };
    f.saved.slots = [f.saved.values, null, null];
    f.bridge.getPerformanceSettings.mockImplementation(async ({ trackId }) =>
      trackId === 'one' ? f.saved : { status: 'absent', trackId, values: null },
    );
    await f.owner.prepare({ id: 'one' });
    await f.owner.copyToSlot(2);
    expect(f.owner.dirty.value).toBe(true);
    await f.owner.prepare({ id: 'two' });
    f.owner.cancelStart();
    await f.owner.ensure(f.playerState.track, () => true);
    expect(f.owner.state.selectedSlot).toBe(2);
    expect(f.owner.dirty.value).toBe(true);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
  });
  it('rejects copies without a saved source or track and keeps the source selected on failed or superseded DSP', async () => {
    const f = fixture();
    f.saved.slots = [f.saved.values, null, null];
    await f.owner.prepare({ id: 'one' });
    expect(await f.owner.copyToSlot(1)).toBe(false);
    expect(await f.owner.copyToSlot(4)).toBe(false);
    f.applyValues.mockResolvedValueOnce({ ok: false });
    expect(await f.owner.copyToSlot(2)).toBe(false);
    expect(f.owner.state.selectedSlot).toBe(1);
    let release;
    f.applyValues.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const pending = f.owner.copyToSlot(2);
    expect(await f.owner.copyToSlot(3)).toBe(false);
    f.owner.clear();
    release({ ok: true });
    expect(await pending).toBe(false);
    f.playerState.track = null;
    expect(await f.owner.copyToSlot(2)).toBe(false);
    f.playerState.track = { id: 'one' };
    f.saved.slots = [null, null, null];
    await f.owner.prepare({ id: 'one' });
    expect(await f.owner.copyToSlot(2)).toBe(false);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
  });
  it.each([2, 3])(
    'returns to set %s after cancelling replacement tracks and saves back to that set',
    async (slot) => {
      const f = fixture();
      f.saved.slots = [
        f.saved.values,
        { ...defaults, transposeSemitones: -2 },
        null,
      ];
      f.saved.defaultSlot = 1;
      f.bridge.getPerformanceSettings.mockImplementation(async ({ trackId }) =>
        trackId === 'one'
          ? f.saved
          : { status: 'absent', trackId, values: null },
      );
      await f.owner.prepare({ id: 'one' });
      await f.owner.selectSlot(slot);
      f.playerState.transposeSemitones = 5;
      f.playerState.audioControlApplication.applied.transposeSemitones = 5;
      await f.owner.prepare({ id: 'two' });
      await f.owner.prepare({ id: 'three' });
      f.owner.cancelStart();
      expect(await f.owner.ensure(f.playerState.track, () => true)).toBe(true);
      expect(f.owner.state.selectedSlot).toBe(slot);
      expect(f.playerState.transposeSemitones).toBe(5);
      expect(f.owner.dirty.value).toBe(true);
      expect(await f.owner.save()).toBe(true);
      expect(f.bridge.savePerformanceSettings).toHaveBeenCalledWith(
        expect.objectContaining({ trackId: 'one', slot }),
      );
    },
  );
  it('does not restore a selection from an older occurrence or a cleared scope', async () => {
    const f = fixture();
    f.saved.slots = [f.saved.values, null, null];
    f.saved.defaultSlot = 1;
    f.bridge.getPerformanceSettings.mockImplementation(async ({ trackId }) =>
      trackId === 'one' ? f.saved : { status: 'absent', trackId, values: null },
    );
    await f.owner.prepare({ id: 'one' });
    await f.owner.selectSlot(3);
    await f.owner.prepare({ id: 'two' });
    f.playerState.playbackRevision++;
    f.owner.cancelStart();
    await f.owner.ensure(f.playerState.track, () => true);
    expect(f.owner.state.selectedSlot).toBe(1);
    await f.owner.selectSlot(3);
    await f.owner.prepare({ id: 'two' });
    f.owner.clear();
    f.owner.cancelStart();
    await f.owner.ensure(f.playerState.track, () => true);
    expect(f.owner.state.selectedSlot).toBe(1);
  });
  it('silently rejects track-specific actions when no track is loaded', async () => {
    const f = fixture();
    f.playerState.track = null;
    expect(await f.owner.selectSlot(2)).toBe(false);
    expect(await f.owner.save()).toBe(false);
    expect(await f.owner.reset()).toBe(false);
    expect(await f.owner.resetSlot(2)).toBe(false);
    expect(await f.owner.resetSlot(4)).toBe(false);
    expect(await f.owner.reload()).toBeNull();
    expect(f.applyValues).not.toHaveBeenCalled();
    expect(f.bridge.getPerformanceSettings).not.toHaveBeenCalled();
    expect(f.notifications.notify).not.toHaveBeenCalled();
    expect(f.owner.state.error).toBeNull();
  });
  it('publishes bounded persistent errors to the shared notification owner and clears them on retry or scope changes', async () => {
    const f = fixture();
    f.bridge.getPerformanceSettings.mockResolvedValueOnce({
      status: 'invalid',
    });
    await f.owner.prepare({ id: 'one' });
    expect(f.notifications.notify).toHaveBeenLastCalledWith({
      key: 'player-performance-settings',
      title: '歌曲設定未完成',
      message: '歌曲設定已損壞，原檔已保留。',
      tone: 'danger',
      lifecycle: 'persistent',
    });
    await f.owner.prepare({ id: 'one' });
    expect(f.notifications.clear).toHaveBeenLastCalledWith(
      'player-performance-settings',
    );
    f.applyValues.mockRejectedValueOnce(new Error('private device path'));
    await f.owner.selectSlot(2);
    expect(f.notifications.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        key: 'player-performance-settings',
        message: '本次演唱設定尚未完成，請再試一次。',
      }),
    );
    expect(JSON.stringify(f.notifications.notify.mock.calls)).not.toContain(
      'private',
    );
    f.owner.clear();
    expect(f.notifications.clear).toHaveBeenLastCalledWith(
      'player-performance-settings',
    );
  });
  it('switches to each saved set and discards unsaved edits without writing them', async () => {
    const f = fixture();
    f.saved.slots = [
      f.saved.values,
      {
        transposeSemitones: -2,
        pitchCents: 15,
        tempoRate: 0.9,
        monitorGuideVocalEnabled: false,
      },
      null,
    ];
    f.saved.defaultSlot = 1;
    f.bridge.setDefaultPerformanceSettings = vi.fn(async (input) => ({
      ...f.saved,
      defaultSlot: input.slot,
    }));
    await f.owner.prepare({ id: 'one' });
    f.playerState.transposeSemitones = 8;
    expect(await f.owner.selectSlot(2)).toBe(true);
    expect(f.applyValues).toHaveBeenCalledWith(f.saved.slots[1], {
      preservePlayback: true,
    });
    expect(f.owner.dirty.value).toBe(false);
    expect(f.playerState.guideVocalOn).toBe(false);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
    await f.owner.setDefault();
    expect(f.bridge.setDefaultPerformanceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ slot: 2 }),
    );
    f.playerState.pitchCents = 30;
    expect(await f.owner.selectSlot(3)).toBe(true);
    expect(f.applyValues).toHaveBeenLastCalledWith(defaults, {
      preservePlayback: true,
    });
    expect(f.owner.hasSaved.value).toBe(false);
    expect(f.owner.dirty.value).toBe(false);
    expect(await f.owner.selectSlot(1)).toBe(true);
    expect(f.applyValues).toHaveBeenLastCalledWith(f.saved.slots[0], {
      preservePlayback: true,
    });
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
    expect(f.bridge.getPerformanceSettings).toHaveBeenCalledOnce();
    await f.owner.selectSlot(3);
    await f.owner.save();
    expect(f.bridge.savePerformanceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ slot: 3 }),
    );
  });
  it('keeps explicitly saved edits when returning to the set and ignores a reselect', async () => {
    const f = fixture();
    f.saved.slots = [f.saved.values, null, null];
    f.bridge.savePerformanceSettings.mockImplementation(async (input) => ({
      ...f.saved,
      slots: f.saved.slots.map((value, index) =>
        index === input.slot - 1 ? { ...input.values } : value,
      ),
    }));
    await f.owner.prepare({ id: 'one' });
    f.playerState.transposeSemitones = 6;
    f.playerState.audioControlApplication.applied.transposeSemitones = 6;
    expect(await f.owner.selectSlot(1)).toBe(false);
    expect(f.applyValues).not.toHaveBeenCalled();
    expect(await f.owner.save()).toBe(true);
    await f.owner.selectSlot(2);
    expect(f.playerState.transposeSemitones).toBe(0);
    await f.owner.selectSlot(1);
    expect(f.playerState.transposeSemitones).toBe(6);
    expect(f.bridge.savePerformanceSettings).toHaveBeenCalledOnce();
  });
  it('serializes set switches and keeps selection when DSP fails or scope changes', async () => {
    const f = fixture();
    f.saved.slots = [f.saved.values, { ...defaults }, null];
    await f.owner.prepare({ id: 'one' });
    f.applyValues.mockResolvedValueOnce({ ok: false });
    expect(await f.owner.selectSlot(2)).toBe(false);
    expect(f.owner.state.selectedSlot).toBe(1);
    expect(f.owner.state.error).toContain('尚未確認');
    let release;
    f.applyValues.mockImplementationOnce(
      () => new Promise((done) => (release = done)),
    );
    const pending = f.owner.selectSlot(2);
    expect(f.owner.busy.value).toBe(true);
    expect(await f.owner.selectSlot(3)).toBe(false);
    expect(await f.owner.save()).toBe(false);
    f.owner.clear();
    release({ ok: true });
    expect(await pending).toBe(false);
    expect(f.owner.state.selectedSlot).toBe(1);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
  });
  it('cancels an unresolved read immediately and ignores its late result', async () => {
    const f = fixture();
    let release;
    f.bridge.getPerformanceSettings.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const pending = f.owner.prepare({ id: 'one' });
    await Promise.resolve();
    f.owner.clear();
    expect(await pending).toBeNull();
    release(f.saved);
    await Promise.resolve();
    expect(f.owner.state.snapshot).toBeNull();
    expect(f.owner.state.error).toBeNull();
    expect(f.owner.state.reading).toBe(false);
    expect(f.notifications.notify).not.toHaveBeenCalled();
  });
  it('bounds reads and offers retry without treating timeout as absence', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(),
        retry = vi.fn();
      f.bridge.getPerformanceSettings.mockImplementationOnce(
        () => new Promise(() => {}),
      );
      const pending = f.owner.prepare({ id: 'one' }, { retry });
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await pending).toBeNull();
      expect(f.owner.state.blocked).toBe(true);
      f.owner.retry();
      f.owner.useDefaultsOnce();
      expect(retry.mock.calls).toEqual([[false], [true]]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects duplicate writes and preserves conflict values for explicit reread', async () => {
    const f = fixture();
    await f.owner.prepare({ id: 'one' });
    f.bridge.savePerformanceSettings.mockResolvedValueOnce({
      status: 'conflict',
    });
    const pending = f.owner.save();
    expect(await f.owner.save()).toBe(false);
    expect(await pending).toBe(false);
    expect(f.owner.state.error).toContain('重新讀取');
    expect(f.playerState.transposeSemitones).toBe(0);
    expect(f.bridge.savePerformanceSettings).toHaveBeenCalledOnce();
  });
  it('does not promote failed DSP or a mismatching requested value to a saved snapshot', async () => {
    const f = fixture();
    await f.owner.prepare({ id: 'one' });
    f.playerState.transposeSemitones = 5;
    expect(f.owner.canSave.value).toBe(false);
    expect(await f.owner.save()).toBe(false);
    f.playerState.transposeSemitones = 0;
    f.applyValues.mockResolvedValueOnce({ ok: false, status: 'failed' });
    expect(await f.owner.selectSlot(2)).toBe(false);
    expect(f.owner.state.error).toContain('尚未確認');
    f.applyValues.mockRejectedValueOnce(new Error('private context'));
    expect(await f.owner.reset()).toBe(false);
    expect(f.owner.state.error).not.toContain('private');
  });
  it('invalidates the bound occurrence when Main announces a deletion or scope switch', async () => {
    const f = fixture();
    let invalidate;
    const onScopeInvalidated = vi.fn();
    f.bridge.onPerformanceSettingsInvalidated = (listener) => {
      invalidate = listener;
      return vi.fn();
    };
    const owner = usePlayerPerformanceSettings({
      playerState: f.playerState,
      bridge: f.bridge,
      graph: f.graph,
      applyValues: f.applyValues,
      onScopeInvalidated,
    });
    await owner.prepare({ id: 'one' });
    invalidate({ trackId: 'other', libraryEpoch: 0 });
    expect(owner.state.snapshot).toBeTruthy();
    invalidate({ trackId: 'one', libraryEpoch: 0 });
    expect(owner.state.snapshot).toBeNull();
    expect(onScopeInvalidated).toHaveBeenCalledOnce();
    owner.dispose();
  });
  it('reads defaults only for explicit absence and fails closed for broken data', async () => {
    const f = fixture();
    f.bridge.getPerformanceSettings.mockResolvedValueOnce({
      status: 'absent',
      values: null,
    });
    expect(await f.owner.prepare({ id: 'one' })).toEqual(defaults);
    f.bridge.getPerformanceSettings.mockResolvedValueOnce({
      status: 'invalid',
    });
    expect(await f.owner.prepare({ id: 'one' })).toBeNull();
    expect(f.owner.state.error).toBeTruthy();
  });
  it('saves only a current confirmed click-time snapshot and preserves later edits', async () => {
    const f = fixture();
    await f.owner.prepare({ id: 'one' });
    f.playerState.audioControlApplication = { ok: false, applied: null };
    expect(await f.owner.save()).toBe(false);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
    f.playerState.audioControlApplication = {
      ok: true,
      applied: { ...defaults },
    };
    let release;
    f.bridge.savePerformanceSettings.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const pending = f.owner.save();
    for (const operation of [
      () => f.owner.selectSlot(2),
      () => f.owner.resetSlot(2),
      () => f.owner.copyToSlot(2),
      () => f.owner.reset(),
      () => f.owner.remove(),
      () => f.owner.setDefault(),
    ])
      expect(await operation()).toBe(false);
    expect(await f.owner.reload()).toBeNull();
    f.playerState.transposeSemitones = 5;
    release({ ...f.saved, values: { ...defaults } });
    expect(await pending).toBe(true);
    expect(f.owner.dirty.value).toBe(true);
    expect(f.playerState.transposeSemitones).toBe(5);
    expect(f.notifications.notify).not.toHaveBeenCalled();
    expect(f.bridge.getPerformanceSettings).toHaveBeenCalledOnce();
  });
  it('keeps switch/reset/remove/reload effects separate', async () => {
    const f = fixture();
    f.saved.slots = [null, f.saved.values, null];
    await f.owner.prepare({ id: 'one' });
    await f.owner.selectSlot(2);
    expect(f.applyValues).toHaveBeenCalledWith(f.saved.values, {
      preservePlayback: true,
    });
    await f.owner.reset();
    expect(f.applyValues).toHaveBeenLastCalledWith(defaults, {
      preservePlayback: true,
    });
    await f.owner.remove();
    await f.owner.reload();
    expect(f.applyValues).toHaveBeenCalledTimes(2);
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
  });
  it('rejects late reads and writes after a new occurrence', async () => {
    const f = fixture();
    await f.owner.prepare({ id: 'one' });
    let release;
    f.bridge.savePerformanceSettings.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const pending = f.owner.save();
    await f.owner.prepare({ id: 'two' });
    release(f.saved);
    expect(await pending).toBe(false);
    expect(f.owner.state.trackId).toBe('two');
  });
  it('restore stays lazy and a late read cannot replace an edit', async () => {
    const f = fixture();
    let release;
    f.bridge.getPerformanceSettings.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const pending = f.owner.restore(f.playerState.track);
    f.playerState.pitchCents = 10;
    await Promise.resolve();
    release(f.saved);
    await pending;
    expect(f.graph.stageAudioControls).not.toHaveBeenCalled();
    expect(f.playerState.pitchCents).toBe(10);
  });
  it('offers paused restore recovery and keeps explicit defaults for this session only', async () => {
    const f = fixture();
    f.bridge.getPerformanceSettings.mockResolvedValueOnce({
      status: 'invalid',
    });
    expect(await f.owner.restore(f.playerState.track)).toBe(false);
    expect(await f.owner.useDefaultsOnce()).toBe(true);
    expect(f.graph.stageAudioControls).toHaveBeenCalledWith(defaults);
    expect(await f.owner.ensure(f.playerState.track, () => true)).toBe(true);
    expect(f.bridge.getPerformanceSettings).toHaveBeenCalledOnce();
    expect(f.bridge.savePerformanceSettings).not.toHaveBeenCalled();
  });
});
