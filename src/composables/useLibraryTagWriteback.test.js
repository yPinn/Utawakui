import { expect, it, vi } from 'vitest';
import { useLibraryTagWriteback } from './useLibraryTagWriteback.js';
it('keeps App saving separate from explicit file preview and confirmation, and permits retry after busy', async () => {
  const bridge = {
    getLibraryTagOptions: vi.fn(async () => ({
      status: 'ready',
      supported: true,
      trackId: 't',
      values: { title: 'Title', artist: 'Artist' },
      releases: [],
      history: [],
    })),
    previewLibraryTags: vi.fn(async () => ({
      status: 'ready',
      previewId: 'p',
      fields: [],
    })),
    commitLibraryTags: vi
      .fn()
      .mockResolvedValueOnce({ status: 'busy' })
      .mockResolvedValueOnce({ status: 'saved' }),
    restoreLibraryTags: vi.fn(),
  };
  const api = useLibraryTagWriteback({ bridge });
  await api.load('t');
  expect(bridge.commitLibraryTags).not.toHaveBeenCalled();
  await api.preview(['title']);
  expect(bridge.previewLibraryTags).toHaveBeenCalledWith({
    trackId: 't',
    fields: ['title'],
  });
  expect(await api.commit()).toBe(false);
  expect(api.state.error).toContain('使用中');
  expect(api.state.preview.previewId).toBe('p');
  expect(await api.commit()).toBe(true);
  expect(bridge.commitLibraryTags).toHaveBeenLastCalledWith({ previewId: 'p' });
});
it('does not display an old response after changing track', async () => {
  let finish;
  const bridge = {
    getLibraryTagOptions: vi.fn(
      () => new Promise((resolve) => (finish = resolve)),
    ),
  };
  const api = useLibraryTagWriteback({ bridge });
  const request = api.load('one');
  api.reset();
  finish({ status: 'ready', trackId: 'one' });
  await request;
  expect(api.state.options).toBe(null);
});
it('retries a recovery conflict, restores by bounded receipt and discards previews on back', async () => {
  const bridge = {
    getLibraryTagOptions: vi.fn(async () => ({ status: 'recovery-required' })),
    recoverLibraryTags: vi
      .fn()
      .mockResolvedValueOnce({ status: 'recovery-conflict' })
      .mockResolvedValueOnce({ status: 'ready' }),
    restoreLibraryTags: vi.fn(async () => ({ status: 'saved' })),
    previewLibraryTags: vi.fn(async () => ({
      status: 'ready',
      previewId: 'p',
    })),
  };
  const api = useLibraryTagWriteback({ bridge });
  expect(await api.load('t', { collectionId: 'album', position: 2 })).toBe(
    false,
  );
  expect(api.state.needsRecovery).toBe(true);
  expect(await api.recover()).toBe(false);
  expect(await api.recover()).toBe(true);
  expect(api.state.needsRecovery).toBe(false);
  await api.preview(['title']);
  api.back();
  expect(api.state.preview).toBe(null);
  expect(await api.restore('receipt')).toBe(true);
  expect(bridge.restoreLibraryTags).toHaveBeenCalledWith({
    receiptId: 'receipt',
  });
  bridge.restoreLibraryTags.mockResolvedValueOnce({ status: 'conflict' });
  expect(await api.restore('receipt')).toBe(false);
  bridge.restoreLibraryTags.mockRejectedValueOnce(Error('private details'));
  expect(await api.restore('receipt')).toBe(false);
  expect(api.state.error).not.toContain('private details');
});
it('observes waiting progress and cancels a queued file without losing its preview', async () => {
  let progress, finish;
  const off = vi.fn();
  const bridge = {
    getLibraryTagOptions: vi.fn(async () => ({
      status: 'ready',
      supported: true,
      values: { title: 'Title' },
      releases: [],
      history: [],
    })),
    previewLibraryTags: vi.fn(async () => ({
      status: 'ready',
      previewId: 'p',
    })),
    onLibraryTagProgress: vi.fn((fn) => {
      progress = fn;
      return off;
    }),
    commitLibraryTags: vi.fn(
      () => new Promise((resolve) => (finish = resolve)),
    ),
    cancelLibraryTags: vi.fn(async () => {
      finish({ status: 'cancelled' });
      return { status: 'cancelling' };
    }),
  };
  const api = useLibraryTagWriteback({ bridge });
  expect(await api.cancel()).toBe(false);
  await api.load('t');
  await api.preview(['title']);
  const pending = api.commit();
  progress({ trackId: 't', phase: 'waiting' });
  expect(api.state.phase).toBe('waiting');
  expect(await api.cancel()).toBe(true);
  expect(await pending).toBe(false);
  expect(api.state.preview.previewId).toBe('p');
  expect(api.state.message).toContain('已取消');
  expect(off).toHaveBeenCalledOnce();
});
