import { describe, expect, it } from 'vitest';
import OUTPUT_TEMPLATE_VALUES from '../../../../shared/outputTemplateValues.json';
import KaraokeStackPreview from './KaraokeStackPreview.vue';
import ArtCardPreview from './ArtCardPreview.vue';
import QueueBoardPreview from './QueueBoardPreview.vue';
import { outputTemplatePreviewFor } from './outputTemplatePreviews.js';

describe('output template preview registry', () => {
  it('maps every bundled template id to its own preview', () => {
    const ids = Object.keys(OUTPUT_TEMPLATE_VALUES.templateKinds);
    const previews = ids.map((id) =>
      outputTemplatePreviewFor({
        id,
        kind: OUTPUT_TEMPLATE_VALUES.templateKinds[id],
      }),
    );

    expect(previews.every(Boolean)).toBe(true);
    expect(new Set(previews).size).toBe(ids.length);
  });

  it('falls back by kind, then to the Now Playing preview', () => {
    expect(outputTemplatePreviewFor({ id: 'unknown', kind: 'lyrics' })).toBe(
      KaraokeStackPreview,
    );
    expect(outputTemplatePreviewFor({ id: 'unknown', kind: 'setlist' })).toBe(
      QueueBoardPreview,
    );
    expect(outputTemplatePreviewFor({ id: 'unknown', kind: 'other' })).toBe(
      ArtCardPreview,
    );
    expect(outputTemplatePreviewFor(null)).toBe(ArtCardPreview);
  });
});
