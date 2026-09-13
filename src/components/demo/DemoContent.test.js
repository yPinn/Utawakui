import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoContent from './DemoContent.vue';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const contentSource = readSource('./DemoContent.vue');

const SECTIONS = [
  {
    key: 'marquee-text',
    title: '跑馬燈文字',
    components: ['UiMarqueeText'],
  },
  { key: 'track-thumb', title: '曲目縮圖', components: ['UiTrackThumb'] },
  {
    key: 'collage-thumb',
    title: '拼貼縮圖',
    components: ['UiCollageThumb'],
  },
  { key: 'track-rows', title: '曲目資料列', components: ['UiTrackRow'] },
];

describe('DemoContent staged review boundary', () => {
  it('delegates reviewed Content components to Candidate／Current comparisons', async () => {
    const html = await renderToString(
      createSSRApp(DemoContent, { sections: SECTIONS }),
    );

    expect(contentSource).toContain(
      "import DemoMarqueeTextAppearance from './DemoMarqueeTextAppearance.vue';",
    );
    expect(contentSource).toContain(
      "import DemoTrackThumbAppearance from './DemoTrackThumbAppearance.vue';",
    );
    expect(contentSource).toContain(
      "import DemoCollageThumbAppearance from './DemoCollageThumbAppearance.vue';",
    );
    expect(contentSource).toContain(
      "import DemoTrackRowAppearance from './DemoTrackRowAppearance.vue';",
    );
    expect(contentSource).toMatch(
      /const COMPARISON_SECTION_KEYS = new Set\(\[\s*'marquee-text',\s*'track-thumb',\s*'collage-thumb',\s*'track-rows',?\s*\]\);/u,
    );
    expect(contentSource).toMatch(
      /<DemoMarqueeTextAppearance\s+v-if="section\.key === 'marquee-text'"\s*\/>/u,
    );
    expect(contentSource).toMatch(
      /<DemoTrackThumbAppearance\s+v-else-if="section\.key === 'track-thumb'"\s*\/>/u,
    );
    expect(contentSource).toMatch(
      /<DemoCollageThumbAppearance\s+v-else-if="section\.key === 'collage-thumb'"\s*\/>/u,
    );
    expect(contentSource).toMatch(
      /<DemoTrackRowAppearance\s+v-else-if="section\.key === 'track-rows'"\s*\/>/u,
    );
    expect(html.match(/data-review-section="reviewed"/gu)).toHaveLength(4);
    expect(html).toContain('data-marquee-source="candidate"');
    expect(html).toContain('data-marquee-source="current"');
    expect(html).toContain('data-track-thumb-source="candidate"');
    expect(html).toContain('data-track-thumb-source="current"');
    expect(html).toContain('data-collage-thumb-source="candidate"');
    expect(html).toContain('data-collage-thumb-source="current"');
    expect(html).toContain('data-track-row-source="candidate"');
    expect(html).toContain('data-track-row-source="current"');
  });

  it('leaves reviewed primitives and the Track Row production component untouched', () => {
    expect(contentSource).not.toContain(
      "import UiTrackThumb from '../ui/UiTrackThumb.vue';",
    );
    expect(contentSource).not.toContain(
      "import UiCollageThumb from '../ui/UiCollageThumb.vue';",
    );
    expect(contentSource).not.toContain(
      "import UiTrackRow from '../ui/UiTrackRow.vue';",
    );
    expect(contentSource).not.toContain(
      "import UiMarqueeText from '../ui/UiMarqueeText.vue';",
    );
    expect(contentSource).toContain("section.key === 'collage-thumb'");
    expect(contentSource).toContain("section.key === 'track-rows'");
  });
});
