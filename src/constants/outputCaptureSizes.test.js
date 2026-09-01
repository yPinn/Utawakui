import { describe, expect, it } from 'vitest';
import {
  OUTPUT_LYRICS_CAPTURE_SIZE,
  OUTPUT_REFERENCE_CANVAS,
  OUTPUT_WIDGET_CAPTURE_SIZES,
  calculateWidgetPreviewScale,
  captureSizeForKind,
  defaultCaptureSizeIdForKind,
  normalizeCaptureSizeId,
  supportedCaptureSizeIdsForTemplate,
} from './outputCaptureSizes.js';

describe('output capture size contract', () => {
  it('builds compact widget sizes from a 4x4 FHD reference grid', () => {
    expect(OUTPUT_REFERENCE_CANVAS).toEqual({
      width: 1920,
      height: 1080,
      columns: 4,
      rows: 4,
    });
    expect(OUTPUT_WIDGET_CAPTURE_SIZES).toEqual([
      { id: 'small', label: '小', width: 480, height: 270, rows: 1 },
      { id: 'medium', label: '中', width: 480, height: 540, rows: 2 },
      { id: 'large', label: '大', width: 480, height: 810, rows: 3 },
    ]);
  });

  it('fits previews against the actual visible capture sizes', () => {
    expect(
      calculateWidgetPreviewScale({
        availableWidth: 660,
        availableHeight: 420,
        captureSizes: [{ width: 480, height: 270 }],
        captionHeight: 40,
        rowGap: 8,
      }),
    ).toBe(1);

    expect(
      calculateWidgetPreviewScale({
        availableWidth: 660,
        availableHeight: 420,
        captureSizes: [{ width: 480, height: 540 }],
        captionHeight: 40,
        rowGap: 8,
      }),
    ).toBeCloseTo(372 / 540);

    expect(
      calculateWidgetPreviewScale({
        availableWidth: 660,
        availableHeight: 420,
        captureSizes: [
          { width: 480, height: 270 },
          { width: 480, height: 540 },
        ],
        columnGap: 12,
        captionHeight: 40,
        rowGap: 8,
      }),
    ).toBeCloseTo(324 / 480);
  });

  it('keeps Lyrics fixed at FHD while widgets use safe slot defaults', () => {
    expect(OUTPUT_LYRICS_CAPTURE_SIZE).toEqual({
      id: 'full',
      label: 'FHD',
      width: 1920,
      height: 1080,
      rows: 4,
    });
    expect(defaultCaptureSizeIdForKind('now-playing')).toBe('small');
    expect(defaultCaptureSizeIdForKind('setlist')).toBe('large');
    expect(defaultCaptureSizeIdForKind('lyrics')).toBe('full');
    expect(
      supportedCaptureSizeIdsForTemplate('now-next', 'now-playing'),
    ).toEqual(['small']);
    expect(
      supportedCaptureSizeIdsForTemplate('queue-board', 'setlist'),
    ).toEqual(['large']);
    expect(
      supportedCaptureSizeIdsForTemplate('art-card', 'now-playing'),
    ).toEqual(['small']);
    expect(
      supportedCaptureSizeIdsForTemplate('cover-player', 'now-playing'),
    ).toEqual(['medium']);
    expect(normalizeCaptureSizeId('lyrics', 'small', 'focus-line')).toBe(
      'full',
    );
    expect(normalizeCaptureSizeId('now-playing', 'large', 'art-card')).toBe(
      'small',
    );
    expect(normalizeCaptureSizeId('now-playing', 'large', 'cover-player')).toBe(
      'medium',
    );
    expect(
      captureSizeForKind('setlist', 'medium', 'queue-board'),
    ).toMatchObject({
      id: 'large',
      width: 480,
      height: 810,
    });
  });
});
