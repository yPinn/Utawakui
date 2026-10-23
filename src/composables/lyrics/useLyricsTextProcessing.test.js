import { effectScope, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import { useLyricsTextProcessing } from './useLyricsTextProcessing.js';

describe('source-owned text selections', () => {
  it('starts literal, hides only selected candidates, restores and resets on source or text changes', () => {
    const scope = effectScope();
    const document = shallowRef({
      documentId: 'same',
      lines: [
        { lineId: 'c', text: '作詞：測試' },
        { lineId: 'v', text: '[女]一起唱（和聲）' },
      ],
    });
    const sourceKey = shallowRef('track-a/source-a');
    const processing = scope.run(() =>
      useLyricsTextProcessing({ document, sourceKey }),
    );
    expect(processing.hiddenLineIds.value).toEqual([]);
    expect(processing.setHidden('v', true)).toBe(false);
    expect(processing.setHidden('c', true)).toBe(true);
    expect(
      processing.project(document.value).lines.map((l) => l.lineId),
    ).toEqual(['v']);
    processing.setHidden('c', false);
    expect(processing.project(document.value)).toBe(document.value);
    processing.setHidden('c', true);
    sourceKey.value = 'track-a/source-b';
    expect(processing.hiddenLineIds.value).toEqual([]);
    processing.setHidden('c', true);
    document.value = {
      ...document.value,
      lines: [{ lineId: 'c', text: '作詞：另一句' }],
    };
    expect(processing.hiddenLineIds.value).toEqual([]);
    processing.setHidden('c', true);
    processing.restore();
    expect(processing.project(document.value)).toBe(document.value);
    scope.stop();
  });
});
