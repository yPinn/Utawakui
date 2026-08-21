import { describe, expect, it } from 'vitest';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from './preview.mjs';

describe('overlay preview fallback', () => {
  it('recognizes only the explicit preview query', () => {
    expect(isPreviewMode({ search: '?preview=1' })).toBe(true);
    expect(isPreviewMode({ search: '?preview=0' })).toBe(false);
    expect(isPreviewMode({ search: '' })).toBe(false);
  });

  it('marks only the workbench document with a preview canvas', () => {
    const document = { documentElement: { dataset: {} } };
    applyPreviewCanvas(document, true);
    expect(document.documentElement.dataset.overlayPreview).toBe('true');
  });

  it('uses demo content only when preview mode receives an empty live frame', () => {
    const hidden = { revision: 7, visible: false, currentText: '' };
    const demo = { revision: 0, visible: true, currentText: 'Demo lyric' };
    expect(withPreviewFallback(hidden, demo, true)).toEqual({
      revision: 7,
      visible: true,
      currentText: 'Demo lyric',
    });
    expect(withPreviewFallback(hidden, demo, false)).toBe(hidden);

    const live = { revision: 8, visible: true, currentText: 'Live lyric' };
    expect(withPreviewFallback(live, demo, true)).toBe(live);
  });
});
