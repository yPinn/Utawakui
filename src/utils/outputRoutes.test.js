import { describe, expect, it } from 'vitest';
import {
  buildOutputTemplateUrls,
  outputPathForTemplate,
} from './outputRoutes.js';

describe('output template routes', () => {
  it('maps implemented presets to stable shared template routes', () => {
    expect(outputPathForTemplate('now-next')).toBe('/overlay/now-playing');
    expect(outputPathForTemplate('queue-board')).toBe('/overlay/setlist');
    expect(outputPathForTemplate('focus-line')).toBe('/overlay/lyrics');
    expect(outputPathForTemplate('karaoke-stack')).toBe('/overlay/lyrics');
    expect(outputPathForTemplate('reading-aid')).toBeNull();
  });

  it('keeps the OBS URL stable and adds demo state only to the workbench URL', () => {
    expect(
      buildOutputTemplateUrls(
        { running: true, httpUrl: 'http://127.0.0.1:8700' },
        'focus-line',
      ),
    ).toEqual({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      previewUrl: 'http://127.0.0.1:8700/overlay/lyrics?preview=1',
    });
    expect(
      buildOutputTemplateUrls({ running: false, httpUrl: null }, 'focus-line'),
    ).toEqual({ obsUrl: null, previewUrl: null });
  });
});
