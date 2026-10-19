import { afterEach, expect, it, vi } from 'vitest';
import { useImportSourceResolution } from './useImportSourceResolution.js';

afterEach(() => vi.unstubAllGlobals());

it('clears an empty draft without requiring a revision adapter or starting a provider operation', async () => {
  const clearPreview = vi.fn();
  const ensureProviderFlow = vi.fn();
  const setStatus = vi.fn();
  const resolution = useImportSourceResolution({
    state: { input: '  ' },
    clearPreview,
    ensureProviderFlow,
    setStatus,
  });
  await resolution.resolveSource();
  expect(clearPreview).toHaveBeenCalledOnce();
  expect(setStatus).toHaveBeenCalledWith();
  expect(ensureProviderFlow).not.toHaveBeenCalled();
});

it.each([
  ['resolveImportInput', false],
  ['fetchYoutubePlaylist', false],
  ['resolveImportSource', false],
  ['fetchVideoMetadata', false],
  ['resolveImportInput', true],
])(
  'discards a stale %s response (rejected=%s) after the draft changes',
  async (method, rejected) => {
    let finish;
    let fail;
    const pending = new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const bridge = vi.fn(() => pending);
    vi.stubGlobal('window', {
      Utawakui: {
        fetchYoutubePlaylist: vi.fn().mockResolvedValue(null),
        [method]: bridge,
      },
    });
    let revision = 0;
    const state = { input: 'old source', sourceKind: 'idle' };
    const clearPreview = vi.fn();
    const reportImportError = vi.fn();
    const setStatus = vi.fn();
    const resolution = useImportSourceResolution({
      state,
      getDraftRevision: () => revision,
      clearPreview,
      ensureProviderFlow: vi.fn().mockResolvedValue(true),
      handleProviderSetupError: vi.fn(),
      reportImportError,
      setStatus,
    });
    const request = resolution.resolveSource();
    await vi.waitFor(() => expect(bridge).toHaveBeenCalledOnce());
    revision++;
    state.input = 'new source';
    state.sourceKind = 'single';
    state.singleTrack = { id: 'new-song', title: 'New song' };
    if (rejected) fail(new Error('private stale response'));
    else finish({ kind: 'playlist', entries: [{ id: 'old-song' }] });
    await request;
    expect(state.singleTrack.id).toBe('new-song');
    expect(state.sourceKind).toBe('single');
    expect(state.input).toBe('new source');
    expect(state.isResolving).toBe(false);
    expect(clearPreview).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenCalledWith();
    expect(setStatus).toHaveBeenCalledOnce();
    expect(reportImportError).not.toHaveBeenCalled();
  },
);
