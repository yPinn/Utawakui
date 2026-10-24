import { expect, it, vi } from 'vitest';
import {
  createReleaseCatalogSession,
  useReleaseCatalog,
} from './useReleaseCatalog.js';
it('ignores a late candidate result after switching songs and never sends source metadata', async () => {
  let complete;
  const bridge = {
    searchReleaseCatalog: vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    ),
  };
  const session = createReleaseCatalogSession(bridge, async () => true);
  session.open({ id: 'one', title: 'One' });
  const pending = session.search();
  await Promise.resolve();
  session.open({ id: 'two', title: 'Two' });
  complete({
    status: 'ok',
    candidates: [{ candidateId: 'opaque', title: 'Album' }],
  });
  await pending;
  expect(session.state.candidates).toEqual([]);
  expect(bridge.searchReleaseCatalog).toHaveBeenCalledWith({ trackId: 'one' });
});
it('preserves paged choices, accepts only explicit positions and disposes subscriptions on scope changes', async () => {
  let changed;
  const dispose = vi.fn();
  const bridge = {
    onReleaseOrganizationChanged: (callback) => {
      changed = callback;
      return dispose;
    },
    searchReleaseCatalog: async () => ({
      status: 'ok',
      libraryEpoch: 1,
      candidates: [],
    }),
    previewReleaseCatalog: vi.fn(async ({ offset }) => ({
      status: 'ok',
      rows: [{ position: offset ? 101 : 1 }],
      hasMore: !offset,
    })),
    acceptReleaseCatalog: async () => ({ status: 'ok' }),
    refreshReleaseCatalog: vi.fn(async () => ({
      status: 'complete',
      updated: 1,
    })),
  };
  const session = createReleaseCatalogSession(bridge);
  session.open({ id: 'local', title: 'Song' });
  await session.search();
  expect(session.state.message).toContain('沒有找到');
  await session.preview('opaque');
  session.setPosition(1);
  await session.preview('opaque', 100);
  expect(session.state.preview.rows.map((row) => row.position)).toEqual([
    1, 101,
  ]);
  expect(session.state.position).toBe(1);
  await session.accept();
  expect(session.state.open).toBe(false);
  session.open({ id: 'other' });
  await session.refresh();
  expect(session.state.message).toContain('已補齊');
  bridge.refreshReleaseCatalog.mockResolvedValueOnce({
    status: 'complete',
    updated: 0,
  });
  await session.refresh();
  expect(session.state.message).toContain('尚未取得');
  changed({ libraryEpoch: 2 });
  expect(session.state.error).toContain('曲庫位置已變更');
  session.close();
  expect(session.state.open).toBe(false);
  session.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
it('does not start gated work when disabled and cannot close during an active lookup', async () => {
  const searchReleaseCatalog = vi.fn();
  const disabled = createReleaseCatalogSession(
    { searchReleaseCatalog },
    async () => false,
  );
  disabled.open({ id: 'local' });
  await disabled.search();
  expect(searchReleaseCatalog).not.toHaveBeenCalled();
  expect(disabled.state.busy).toBe(false);
  let done;
  const session = createReleaseCatalogSession({
    searchReleaseCatalog: () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  });
  session.open({ id: 'local' });
  const pending = session.search();
  await Promise.resolve();
  session.close();
  expect(session.state.open).toBe(true);
  session.dispose();
  done({ status: 'ok', candidates: [] });
  await pending;
  expect(session.state.candidates).toEqual([]);
  expect(useReleaseCatalog()).toBe(useReleaseCatalog());
});
it('requires an explicit source position before accepting and keeps errors recoverable', async () => {
  const bridge = {
    searchReleaseCatalog: vi.fn(async () => ({
      status: 'ok',
      candidates: [{ candidateId: 'opaque', title: 'Album' }],
    })),
    previewReleaseCatalog: vi.fn(async () => ({
      status: 'ok',
      rows: [{ position: 5, title: 'Song' }],
    })),
    acceptReleaseCatalog: vi.fn(async () => ({ status: 'conflict' })),
  };
  const session = createReleaseCatalogSession(bridge, async () => true);
  session.open({ id: 'local', title: 'Song' });
  await session.search();
  await session.preview('opaque');
  await session.accept();
  expect(bridge.acceptReleaseCatalog).not.toHaveBeenCalled();
  session.setPosition(5);
  await session.accept();
  expect(bridge.acceptReleaseCatalog).toHaveBeenCalledWith({
    candidateId: 'opaque',
    position: 5,
  });
  expect(session.state.open).toBe(true);
  expect(session.state.error).not.toBe('');
});
