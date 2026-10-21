import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePerformanceArchive } from './usePerformanceArchive.js';

afterEach(() => vi.unstubAllGlobals());
describe('read-only performance archive loading', () => {
  it('ignores stale reads and disposed responses while retaining occurrence identity', async () => {
    const pending = {};
    const get = vi.fn(
      (id) =>
        new Promise((resolve) => {
          pending[id] = resolve;
        }),
    );
    vi.stubGlobal('window', { Utawakui: { getPerformanceSession: get } });
    const id = shallowRef('a'),
      scope = effectScope();
    const archive = scope.run(() => usePerformanceArchive(id));
    expect(archive.loading.value).toBe(true);
    id.value = 'b';
    await nextTick();
    const items = [
      { itemId: 'one', trackId: 'repeat' },
      { itemId: 'two', trackId: 'repeat' },
      { itemId: 'manual', mode: 'manual' },
    ];
    pending.b({ ok: true, plan: { id: 'b', items } });
    await nextTick();
    expect(archive.session.value.items).toEqual(items);
    pending.a({ ok: true, plan: { id: 'a', items: [] } });
    await nextTick();
    expect(archive.session.value.id).toBe('b');
    id.value = 'c';
    await nextTick();
    expect(archive.session.value).toBe(null);
    scope.stop();
    pending.c({ ok: true, plan: { id: 'c', items: [] } });
    await nextTick();
    expect(archive.session.value).toBe(null);
  });
  it('exposes a retryable error instead of substituting another or empty session', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: '找不到場次' } })
      .mockResolvedValueOnce({ ok: true, plan: { id: 'a', items: [] } });
    vi.stubGlobal('window', { Utawakui: { getPerformanceSession: get } });
    const scope = effectScope(),
      archive = scope.run(() => usePerformanceArchive(() => 'a'));
    await nextTick();
    expect(archive.error.value).toBe('找不到場次');
    expect(archive.session.value).toBe(null);
    await archive.refresh();
    expect(archive.error.value).toBe('');
    expect(archive.session.value.items).toEqual([]);
    scope.stop();
  });
});
