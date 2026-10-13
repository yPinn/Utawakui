import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const contentSource = readSource('./DemoContent.vue');
describe('DemoContent staged review boundary', () => {
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
