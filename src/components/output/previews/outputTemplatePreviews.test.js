import { describe, expect, it } from 'vitest';
import OUTPUT_TEMPLATE_VALUES from '../../../../shared/outputTemplateValues.json';
import KaraokeStackPreview from './KaraokeStackPreview.vue';
import ArtCardPreview from './ArtCardPreview.vue';
import QueueBoardPreview from './QueueBoardPreview.vue';
import { outputTemplatePreviewFor } from './outputTemplatePreviews.js';

describe('output template preview registry', () => {
  it('loads a distinct preview for every bundled template id', async () => {
    const ids = Object.keys(OUTPUT_TEMPLATE_VALUES.templateKinds);
    const previews = await Promise.all(
      ids.map(async (id) => {
        const load = outputTemplatePreviewFor({
          id,
          kind: OUTPUT_TEMPLATE_VALUES.templateKinds[id],
        });
        return (await load()).default;
      }),
    );

    expect(previews.every(Boolean)).toBe(true);
    expect(new Set(previews).size).toBe(ids.length);
  });

  it.each([
    [{ id: 'unknown', kind: 'lyrics' }, KaraokeStackPreview],
    [{ id: 'unknown', kind: 'setlist' }, QueueBoardPreview],
    [{ id: 'unknown', kind: 'other' }, ArtCardPreview],
    [null, ArtCardPreview],
  ])('falls back for %j', async (preset, expected) => {
    const { default: preview } = await outputTemplatePreviewFor(preset)();
    expect(preview).toBe(expected);
  });
});
