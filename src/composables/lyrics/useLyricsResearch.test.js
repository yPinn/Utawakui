import { describe, expect, it, vi } from 'vitest';
import { createLyricsResearchOwner } from './useLyricsResearch.js';
const status = { researchOnly: true, status: 'ready', busy: false };
const intent = { trackId: 'song', language: 'zh', lineIndex: 0 };
function bridge() {
  return {
    getLyricsResearchStatus: vi.fn(async () => status),
    prepareLyricsResearch: vi.fn(async () => status),
    verifyLyricsResearch: vi.fn(async () => status),
    removeLyricsResearch: vi.fn(async () => status),
    cancelLyricsResearch: vi.fn(),
    inspectLyricsResearch: vi.fn(async () => ({ lines: [] })),
    previewLyricsResearch: vi.fn(async () => ({
      researchOnly: true,
      lines: [],
    })),
  };
}
describe('research UI owner', () => {
  it('never prepares on status and only submits bounded preview intent after explicit action', async () => {
    const api = bridge(),
      owner = createLyricsResearchOwner(() => api);
    await owner.refresh();
    expect(api.prepareLyricsResearch).not.toHaveBeenCalled();
    await owner.action('prepare');
    await owner.action('preview', intent);
    expect(api.previewLyricsResearch).toHaveBeenCalledWith(intent);
    expect(owner.preview.value.researchOnly).toBe(true);
    owner.clearPreview();
    expect(owner.preview.value).toBe(null);
  });
  it('discards stale inspections and preview results when a selection changes', async () => {
    const api = bridge();
    let first;
    api.inspectLyricsResearch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValueOnce({ sourceLabel: 'new', lines: [] });
    const owner = createLyricsResearchOwner(() => api);
    const old = owner.inspect(intent);
    await owner.inspect({ ...intent, trackId: 'new' });
    first({ sourceLabel: 'old' });
    await old;
    expect(owner.inspection.value.sourceLabel).toBe('new');
    let finish;
    api.previewLyricsResearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = owner.action('preview', intent);
    owner.clearPreview();
    finish({ researchOnly: true, lines: ['stale'] });
    await running;
    expect(owner.preview.value).toBe(null);
  });
  it('clears old results on failure/cancel and keeps private paths out of errors', async () => {
    const api = bridge(),
      owner = createLyricsResearchOwner(() => api);
    await owner.action('preview', intent);
    api.previewLyricsResearch.mockRejectedValueOnce(Error('C:/private'));
    await owner.action('preview', intent);
    expect(owner.preview.value).toBe(null);
    expect(owner.error.value).not.toContain('private');
    api.prepareLyricsResearch.mockResolvedValueOnce({ cancelled: true });
    await owner.action('prepare');
    expect(owner.error.value).toContain('已取消');
    await owner.cancel();
    expect(api.cancelLyricsResearch).toHaveBeenCalled();
    api.cancelLyricsResearch.mockRejectedValue(Error('private'));
    await owner.cancel();
    expect(owner.error.value).toContain('取消尚未完成');
    api.inspectLyricsResearch.mockRejectedValue(Error('private'));
    await owner.inspect(intent);
    expect(owner.inspection.value).toBe(null);
    const missing = createLyricsResearchOwner(() => null);
    await missing.refresh();
    expect(missing.error.value).toContain('無法讀取');
    await missing.action('verify');
    expect(missing.busy.value).toBe(false);
  });
  it('does not start a second action while main reports busy', async () => {
    const api = bridge();
    api.getLyricsResearchStatus.mockResolvedValue({ ...status, busy: true });
    const owner = createLyricsResearchOwner(() => api);
    await owner.refresh();
    await owner.action('prepare');
    expect(api.prepareLyricsResearch).not.toHaveBeenCalled();
  });
});
