import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedbackSource = readFileSync(
  new URL('./DemoFeedback.vue', import.meta.url),
  'utf8',
);

describe('DemoFeedback', () => {
  it('delegates only the reviewed feedback sections to staged appearances', () => {
    expect(feedbackSource).toContain(
      "import DemoChipAppearance from './DemoChipAppearance.vue';",
    );
    expect(feedbackSource).toContain(
      '<DemoChipAppearance v-if="section.key === \'chips\'" />',
    );
    expect(feedbackSource).not.toContain('const CHIP_TONES');
    expect(feedbackSource).toContain(
      "import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';",
    );
    expect(feedbackSource).toMatch(
      /<DemoStatusIconAppearance\s+v-else-if="section\.key === 'status-icons'"\s*\/>/u,
    );
    expect(feedbackSource).not.toContain('const STATUS_TONES');
    expect(feedbackSource).toContain(
      "import DemoHintAppearance from './DemoHintAppearance.vue';",
    );
    expect(feedbackSource).toMatch(
      /<DemoHintAppearance\s+v-else-if="section\.key === 'hints'"\s*\/>/u,
    );
    expect(feedbackSource).not.toContain('const HINT_TONES');
    expect(feedbackSource).toContain(
      "import DemoNoticeAppearance from './DemoNoticeAppearance.vue';",
    );
    expect(feedbackSource).toMatch(
      /<DemoNoticeAppearance\s+v-else-if="section\.key === 'notices'"\s*\/>/u,
    );
    expect(feedbackSource).not.toContain(
      "import UiNotice from '../ui/UiNotice.vue';",
    );
  });
});
