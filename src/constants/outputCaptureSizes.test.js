import { describe, expect, it } from 'vitest';
import {
  OUTPUT_LYRICS_CAPTURE_SIZE,
  OUTPUT_WIDGET_CAPTURE_SIZES,
  calculateWidgetPreviewScale,
  captureSizeForKind,
  defaultCaptureSizeIdForKind,
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from './outputCaptureSizes.js';

describe('output capture size contract', () => {
  it('builds widget sizes by stacking one 640x360 ninth vertically', () => {
    expect(OUTPUT_WIDGET_CAPTURE_SIZES).toEqual([
      { id: 'small', label: '小', width: 640, height: 360, rows: 1 },
      { id: 'medium', label: '中', width: 640, height: 720, rows: 2 },
      { id: 'large', label: '大', width: 640, height: 1080, rows: 3 },
    ]);
  });

  it('uses the hidden Large height envelope when one or two sizes are visible', () => {
    expect(
      calculateWidgetPreviewScale({
        availableWidth: 660,
        availableHeight: 420,
        optionCount: 2,
        columnGap: 12,
        captionHeight: 40,
        rowGap: 8,
      }),
    ).toBeCloseTo(372 / 1080);

    expect(
      calculateWidgetPreviewScale({
        availableWidth: 660,
        availableHeight: 420,
        optionCount: 1,
        captionHeight: 40,
        rowGap: 8,
      }),
    ).toBeCloseTo(372 / 1080);
  });

  it('keeps Lyrics fixed at FHD while widgets use safe slot defaults', () => {
    expect(OUTPUT_LYRICS_CAPTURE_SIZE).toEqual({
      id: 'full',
      label: 'FHD',
      width: 1920,
      height: 1080,
      rows: 3,
    });
    expect(defaultCaptureSizeIdForKind('now-playing')).toBe('small');
    expect(defaultCaptureSizeIdForKind('setlist')).toBe('large');
    expect(defaultCaptureSizeIdForKind('lyrics')).toBe('full');
    expect(defaultCaptureSizeIdForKind('artwork')).toBe('small');
    expect(
      supportedCaptureSizeIdsForTemplate('now-next', 'now-playing'),
    ).toEqual(['small']);
    expect(
      supportedCaptureSizeIdsForTemplate('queue-board', 'setlist'),
    ).toEqual(['large']);
    expect(supportedCaptureSizeIdsForTemplate('art-card', 'artwork')).toEqual([
      'small',
    ]);
    expect(
      supportedCaptureSizeIdsForTemplate('cover-player', 'artwork'),
    ).toEqual(['medium']);
    expect(normalizeCaptureSizeId('lyrics', 'small', 'focus-line')).toBe(
      'full',
    );
    expect(normalizeCaptureSizeId('artwork', 'large', 'art-card')).toBe(
      'small',
    );
    expect(normalizeCaptureSizeId('artwork', 'large', 'cover-player')).toBe(
      'medium',
    );
    expect(
      captureSizeForKind('setlist', 'medium', 'queue-board'),
    ).toMatchObject({
      id: 'large',
      width: 640,
      height: 1080,
    });
  });
});
