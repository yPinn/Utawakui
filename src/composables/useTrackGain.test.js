import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrackGain } from './useTrackGain.js';

let bridge;
beforeEach(() => {
  bridge = {
    getTrackGain: vi.fn(async () => ({ ok: true, gainDb: -3, editToken: 'a' })),
    saveTrackGain: vi.fn(async (_id, _token, gainDb) => ({
      ok: true,
      gainDb,
      editToken: 'b',
    })),
  };
  globalThis.window = { Utawakui: bridge };
  useTrackGain().forgetTrackGains();
});
afterEach(() => {
  delete globalThis.window;
});

describe('useTrackGain', () => {
  it('reads once per track and caches the value', async () => {
    const gain = useTrackGain();
    expect(await gain.gainDbFor('t1')).toBe(-3);
    expect(await gain.gainDbFor('t1')).toBe(-3);
    expect(bridge.getTrackGain).toHaveBeenCalledOnce();
  });

  it('falls back to 0 dB when the bridge fails or reports a status', async () => {
    const gain = useTrackGain();
    bridge.getTrackGain.mockRejectedValueOnce(new Error('private'));
    expect(await gain.gainDbFor('t1')).toBe(0);
    bridge.getTrackGain.mockResolvedValueOnce({ ok: false, status: 'missing' });
    expect(await gain.gainDbFor('t2')).toBe(0);
    expect(await gain.gainDbFor(null)).toBe(0);
  });

  it('saves with the read token, updates the cache and bumps the revision', async () => {
    const gain = useTrackGain();
    const before = gain.revision.value;
    await expect(gain.saveTrackGain('t1', 2.5)).resolves.toMatchObject({
      ok: true,
      gainDb: 2.5,
    });
    expect(bridge.saveTrackGain).toHaveBeenCalledWith('t1', 'a', 2.5);
    expect(gain.revision.value).toBe(before + 1);
    expect(await gain.gainDbFor('t1')).toBe(2.5);
  });

  it('drops the cache entry after a rejected save so the next read is fresh', async () => {
    const gain = useTrackGain();
    bridge.saveTrackGain.mockResolvedValueOnce({ ok: false, status: 'stale' });
    await expect(gain.saveTrackGain('t1', 1)).resolves.toMatchObject({
      ok: false,
    });
    await gain.gainDbFor('t1');
    expect(bridge.getTrackGain).toHaveBeenCalledTimes(2);
  });
});
