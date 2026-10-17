import { describe, expect, it } from 'vitest';
import OUTPUT_TEMPLATE_VALUES from '../../../../shared/outputTemplateValues.json';
import CaptionPreview from './CaptionPreview.vue';
import NowNextPreview from './NowNextPreview.vue';
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
      CaptionPreview,
    );
    expect(outputTemplatePreviewFor({ id: 'unknown', kind: 'setlist' })).toBe(
      QueueBoardPreview,
    );
    expect(outputTemplatePreviewFor({ id: 'unknown', kind: 'other' })).toBe(
      NowNextPreview,
    );
    expect(outputTemplatePreviewFor(null)).toBe(NowNextPreview);
  });
});
