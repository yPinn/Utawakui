import { describe, expect, it } from 'vitest';
import { formatLyricsSourceLabel } from './lyricsSourcePresentation.js';
describe('renderer source labels', () => {
  it('labels a persisted Kugou source without changing existing source formatting', () => {
    expect(
      formatLyricsSourceLabel({
        kind: 'kugou',
        language: 'und',
        label: 'Artist',
      }),
    ).toBe('酷狗音樂 / Artist');
    expect(
      formatLyricsSourceLabel({
        kind: 'lrclib',
        language: 'und',
        label: 'Album',
      }),
    ).toBe('LRCLIB / Album');
  });
});
