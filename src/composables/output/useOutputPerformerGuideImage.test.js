import { h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../components/ui/uiTestHost.js';
import {
  loadPerformerGuideImage,
  preparePerformerGuideImage,
  savePerformerGuideImage,
} from '../../utils/outputPerformerGuideImage.js';
import { useOutputPerformerGuideImage } from './useOutputPerformerGuideImage.js';

vi.mock('../../utils/outputPerformerGuideImage.js', () => ({
  loadPerformerGuideImage: vi.fn(),
  preparePerformerGuideImage: vi.fn(),
  savePerformerGuideImage: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

function mountPlacementImage() {
  let state;
  const { app } = mount({
    setup() {
      state = useOutputPerformerGuideImage();
      return () => h('div');
    },
  });
  return { app, state };
}

describe('saved model placement image', () => {
  it('hydrates the saved image, preserves it on failure, and restores the default across navigation', async () => {
    const builtIn = new Blob(['built-in'], { type: 'image/png' });
    const previous = new Blob(['previous'], { type: 'image/png' });
    const replacement = new Blob(['replacement'], { type: 'image/png' });
    loadPerformerGuideImage.mockResolvedValue(previous);
    preparePerformerGuideImage.mockResolvedValueOnce(builtIn);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:default')
      .mockReturnValueOnce('blob:previous')
      .mockReturnValueOnce('blob:replacement');
    const { app, state } = mountPlacementImage();
    let pending;

    try {
      await vi.waitFor(() => expect(state.src.value).toBe('blob:previous'));
      expect(state.custom.value).toBe(true);
      expect(preparePerformerGuideImage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image/png' }),
      );

      savePerformerGuideImage.mockRejectedValueOnce(
        new Error('storage unavailable'),
      );
      await state.change(replacement);
      expect(state.src.value).toBe('blob:previous');
      expect(state.error.value).toBe(
        'outputPanel.performerGuide.imageSaveFailed',
      );

      pending = state.change(replacement);
    } finally {
      app.unmount();
    }
    const next = mountPlacementImage();
    try {
      await pending;
      expect(next.state.src.value).toBe('blob:replacement');
      expect(savePerformerGuideImage).toHaveBeenLastCalledWith(replacement);
      expect(preparePerformerGuideImage).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledWith('blob:previous');
      expect(loadPerformerGuideImage).toHaveBeenCalledOnce();

      await next.state.change(null);
      expect(savePerformerGuideImage).toHaveBeenLastCalledWith(null);
      expect(next.state.src.value).toBe('blob:default');
      expect(next.state.custom.value).toBe(false);
      expect(revoke).toHaveBeenCalledWith('blob:replacement');
      expect(createUrl).toHaveBeenCalledTimes(3);
    } finally {
      next.app.unmount();
    }
  });
});
