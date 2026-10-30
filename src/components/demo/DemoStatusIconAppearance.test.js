import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoStatusIconAppearance from './DemoStatusIconAppearance.vue';
const feedbackSource = readFileSync(
  new URL('./DemoFeedback.vue', import.meta.url),
  'utf8',
);
const appearanceSource = readFileSync(
  new URL('./DemoStatusIconAppearance.vue', import.meta.url),
  'utf8',
);
const reviewContract = readFileSync(
  new URL(
    '../../../docs/contracts/token-v2-component-review.md',
    import.meta.url,
  ),
  'utf8',
);
describe('DemoStatusIconAppearance', () => {
  it('replaces only the status-icons sample with the staged review', () => {
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
  });
  it('uses icon shape and concise labels across semantic tones', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));
    const tones = [
      'muted',
      'accent',
      'info',
      'success',
      'warning',
      'danger',
      'current',
      'gated',
    ];
    for (const tone of [...tones, 'text', 'highlight']) {
      expect(html).toContain(`data-status-icon-tone="${tone}"`);
    }
    expect(appearanceSource).toContain(
      "import UiStatusIcon from '../ui/UiStatusIcon.vue';",
    );
    // Candidate appears only inside the single labelled proposal specimen.
    expect(
      appearanceSource.match(
        /<DemoProposalSpecimen[\s\S]*?<\/DemoProposalSpecimen>/u,
      )?.[0],
    ).toContain('<DemoCandidateStatusIcon');
    expect(appearanceSource.split('<DemoCandidateStatusIcon').length).toBe(3);
    expect(appearanceSource).not.toContain(':deep(.ui-status-icon');
    expect(html).toContain('需確認');
    expect(html).toContain('圖示、形狀與 concise label');
    expect(html).not.toContain('permission denied');
  });
  it('distinguishes standalone meaning from decorative duplication', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));
    expect(html).toMatch(
      /data-status-icon-aria="standalone"[\s\S]*?role="img"[\s\S]*?aria-label="已完成"/u,
    );
    expect(html).toMatch(
      /data-status-icon-aria="decorative"[\s\S]*?aria-hidden="true"/u,
    );
    expect(html).toContain('Standalone icon · concise accessible label');
    expect(html).toContain('Decorative duplicate · adjacent text owns meaning');
  });
  it('records the owner-confirmed UiStatusIcon checkpoint', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiStatusIcon Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiChip` 已完成 owner 可視確認；依 owner 指示只向下進入 Feedback 的',
    );
    expect(reviewContract).toContain(
      '名稱保留 `UiStatusIcon`，不改叫 Badge 或泛化為 Status Indicator',
    );
    expect(reviewContract).toContain(
      '不新增 action、focus、disabled、tooltip、size 或 live-region prop',
    );
    expect(reviewContract).toContain(
      '`current` 統一使用 Accent／Indigo family；`live` 與 `danger` 保留獨立紅色 token',
    );
  });
});
