import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERFORMER_GUIDE } from '../../utils/outputPerformerGuide.js';
import { useOutputPerformerGuide } from './useOutputPerformerGuide.js';

afterEach(() => vi.unstubAllGlobals());

describe('model placement preference', () => {
  it('previews live without writing, cancels and restores committed geometry on remount', () => {
    const items = new Map();
    const setItem = vi.fn((key, value) => items.set(key, value));
    vi.stubGlobal('localStorage', {
      getItem: (key) => items.get(key),
      setItem,
    });
    const workbench = useOutputPerformerGuide();
    const resized = {
      shape: 'roundedRectangle',
      x: 0.7,
      y: 0.6,
      width: 0.3,
      height: 0.5,
    };

    workbench.preview(resized);
    expect(workbench.guide.value).toEqual(resized);
    expect(setItem).not.toHaveBeenCalled();
    workbench.preview(null);
    expect(workbench.guide.value).toEqual(DEFAULT_PERFORMER_GUIDE);
    workbench.commit(resized);
    expect(setItem).toHaveBeenCalledOnce();
    expect(useOutputPerformerGuide().guide.value).toEqual(resized);
  });

  it('loads a saved placement from before mask shapes without changing its geometry', () => {
    const legacy = { x: 0.3, y: 0.4, width: 0.4, height: 0.3 };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(legacy) });
    expect(useOutputPerformerGuide().guide.value).toEqual({
      ...legacy,
      shape: 'ellipse',
    });
  });

  it.each([undefined, 'ellipse'])(
    'updates the former default ellipse (%s) to the portrait preset',
    (shape) => {
      const previousDefault = {
        ...DEFAULT_PERFORMER_GUIDE,
        shape,
        width: 0.48,
      };
      vi.stubGlobal('localStorage', {
        getItem: () => JSON.stringify(previousDefault),
      });
      expect(useOutputPerformerGuide().guide.value).toEqual(
        DEFAULT_PERFORMER_GUIDE,
      );
    },
  );

  it('uses a safe default for corrupt storage and still allows editing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{ corrupt',
      setItem: () => {
        throw Error('unavailable');
      },
    });
    const workbench = useOutputPerformerGuide();
    expect(workbench.guide.value).toEqual(DEFAULT_PERFORMER_GUIDE);
    workbench.commit({ ...DEFAULT_PERFORMER_GUIDE, x: 0.6 });
    expect(workbench.guide.value.x).toBe(0.6);
  });
});
