import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoChipAppearance from './DemoChipAppearance.vue';

const feedbackSource = readFileSync(
  new URL('./DemoFeedback.vue', import.meta.url),
  'utf8',
);
const appearanceSource = readFileSync(
  new URL('./DemoChipAppearance.vue', import.meta.url),
  'utf8',
);
const reviewContract = readFileSync(
  new URL(
    '../../../docs/contracts/token-v2-component-review.md',
    import.meta.url,
  ),
  'utf8',
);

describe('DemoChipAppearance', () => {
  it('replaces only the chips sample with the appearance review', () => {
    expect(feedbackSource).toContain(
      "import DemoChipAppearance from './DemoChipAppearance.vue';",
    );
    expect(feedbackSource).toContain(
      '<DemoChipAppearance v-if="section.key === \'chips\'" />',
    );
    expect(feedbackSource).not.toContain('const CHIP_TONES');
  });

  it('renders the formal UiChip without restyling it', () => {
    expect(appearanceSource).toContain(
      "import UiChip from '../ui/UiChip.vue';",
    );
    // Candidate appears only inside the single labelled proposal specimen.
    expect(
      appearanceSource.match(
        /<DemoProposalSpecimen[\s\S]*?<\/DemoProposalSpecimen>/u,
      )?.[0],
    ).toContain('<DemoCandidateChip');
    expect(appearanceSource.split('<DemoCandidateChip').length).toBe(2);
    expect(appearanceSource).not.toContain(':deep(.ui-chip)');
  });

  it('covers every tone and keeps announcements parent-owned', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));

    for (const tone of [
      'muted',
      'accent',
      'current',
      'info',
      'success',
      'warning',
      'danger',
      'gated',
    ]) {
      expect(html).toContain(`ui-chip--${tone}`);
    }
    expect(html).toMatch(
      /data-chip-recipe="announcement"[^>]*role="status"[^>]*aria-live="polite"/u,
    );
    expect(html).not.toMatch(/class="[^"]*ui-chip[^"]*"[^>]*role="status"/u);
    expect(html).toContain(
      'No hover／pressed／focus／selected／remove／disabled contract',
    );
  });

  it('records the owner-confirmed Tabs gate and the bounded UiChip phase', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiChip Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiChip` 維持非互動 native `span`，只標記系統產生的短狀態、屬性或數量',
    );
  });
});
