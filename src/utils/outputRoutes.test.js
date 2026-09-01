import { describe, expect, it } from 'vitest';
import {
  buildAllOutputSlotUrls,
  buildOutputSlotUrls,
  outputPathForKind,
} from './outputRoutes.js';

describe('output template routes', () => {
  it('maps three independent kinds to stable routes', () => {
    expect(outputPathForKind('now-playing')).toBe('/overlay/now-playing');
    expect(outputPathForKind('setlist')).toBe('/overlay/setlist');
    expect(outputPathForKind('lyrics')).toBe('/overlay/lyrics');
    expect(outputPathForKind('artwork')).toBeNull();
    expect(outputPathForKind('composite')).toBeNull();
  });

  it('uses the capture route in workbench without injecting demo state', () => {
    expect(
      buildOutputSlotUrls(
        { running: true, httpUrl: 'http://127.0.0.1:8700' },
        'lyrics',
      ),
    ).toEqual({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      previewUrl: 'http://127.0.0.1:8700/overlay/lyrics',
    });
    expect(
      buildOutputSlotUrls(
        {
          running: false,
          httpUrl: null,
          host: '127.0.0.1',
          port: 8700,
        },
        'lyrics',
      ),
    ).toEqual({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      previewUrl: null,
    });
  });

  it('builds a copy target for every output kind without selecting one', () => {
    const urls = buildAllOutputSlotUrls({
      running: true,
      httpUrl: 'http://127.0.0.1:8700',
    });
    expect(Object.keys(urls)).toEqual(['setlist', 'lyrics', 'now-playing']);
    expect(urls['now-playing'].obsUrl).toBe(
      'http://127.0.0.1:8700/overlay/now-playing',
    );
  });
});
