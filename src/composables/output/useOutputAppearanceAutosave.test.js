import { effectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OUTPUT_APPEARANCE_AUTOSAVE_DELAY_MS,
  useOutputAppearanceAutosave,
} from './useOutputAppearanceAutosave.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createAutosave(save) {
  const scope = effectScope();
  const autosave = scope.run(() => useOutputAppearanceAutosave({ save }));
  return { autosave, scope };
}

describe('useOutputAppearanceAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces rapid changes and saves only the latest snapshot', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { autosave, scope } = createAutosave(save);
    const first = { kind: 'lyrics', settings: { fontScale: 'small' } };
    const latest = { kind: 'lyrics', settings: { fontScale: 'large' } };

    autosave.schedule(first);
    autosave.schedule(latest);

    expect(autosave.status.value).toBe('pending');
    await vi.advanceTimersByTimeAsync(OUTPUT_APPEARANCE_AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(latest);
    expect(autosave.status.value).toBe('saved');
    scope.stop();
  });

  it('saves discrete changes immediately without waiting for the debounce', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { autosave, scope } = createAutosave(save);
    const snapshot = { kind: 'lyrics', settings: { fontFamily: 'antique' } };

    const operation = autosave.schedule(snapshot, { immediate: true });
    await operation;

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(snapshot);
    expect(autosave.status.value).toBe('saved');
    scope.stop();
  });

  it('serializes writes and keeps only the latest in-flight change', async () => {
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const { autosave, scope } = createAutosave(save);
    const first = { kind: 'lyrics', settings: { positionOffsetX: 1 } };
    const skipped = { kind: 'lyrics', settings: { positionOffsetX: 2 } };
    const latest = { kind: 'lyrics', settings: { positionOffsetX: 3 } };

    autosave.schedule(first);
    const flushPromise = autosave.flush();
    autosave.schedule(skipped);
    autosave.schedule(latest);

    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe('saving');

    firstSave.resolve(true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect(save).toHaveBeenLastCalledWith(latest);
    secondSave.resolve(true);
    await flushPromise;

    expect(autosave.status.value).toBe('saved');
    scope.stop();
  });

  it('does not write an active snapshot twice when its final commit repeats it', async () => {
    const firstSave = createDeferred();
    const save = vi.fn().mockReturnValue(firstSave.promise);
    const { autosave, scope } = createAutosave(save);
    const snapshot = { kind: 'lyrics', settings: { positionOffsetX: 3 } };

    const firstOperation = autosave.schedule(snapshot, { immediate: true });
    const repeatedOperation = autosave.schedule(
      { kind: 'lyrics', settings: { positionOffsetX: 3 } },
      { immediate: true },
    );
    firstSave.resolve(true);
    await Promise.all([firstOperation, repeatedOperation]);

    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe('saved');
    scope.stop();
  });

  it('retains the latest failed snapshot and retries it explicitly', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { autosave, scope } = createAutosave(save);
    const snapshot = { kind: 'lyrics', settings: { textColor: '#f6e5d3' } };

    autosave.schedule(snapshot);
    await autosave.flush();

    expect(autosave.status.value).toBe('error');
    expect(autosave.canRetry.value).toBe(true);

    await autosave.retry();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(snapshot);
    expect(autosave.status.value).toBe('saved');
    expect(autosave.canRetry.value).toBe(false);
    scope.stop();
  });

  it('flushes a pending debounce immediately', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { autosave, scope } = createAutosave(save);
    const snapshot = { kind: 'lyrics', settings: { accentColor: '#76d6d1' } };

    autosave.schedule(snapshot);
    await autosave.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(snapshot);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('cancels an unsaved debounce when its owning scope is disposed', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { autosave, scope } = createAutosave(save);

    autosave.schedule({ kind: 'lyrics', settings: { fontScale: 'large' } });
    scope.stop();
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
  });
});
