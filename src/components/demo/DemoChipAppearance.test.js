import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoChipAppearance from './DemoChipAppearance.vue';
const feedbackSource = readFileSync(
  new URL('./DemoFeedback.vue', import.meta.url),
  'utf8',
);
const primitiveSource = readFileSync(
  new URL('./DemoChipPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateChip.vue', import.meta.url),
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
  it('replaces only the chips sample with the staged appearance review', () => {
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
    expect(feedbackSource).not.toContain('const STATUS_TONES');
  });
  it('does not let fixture layout override chip width or semantic text styles', () => {
    expect(primitiveSource).toContain('class="demo-chip-item__label"');
    expect(primitiveSource).not.toContain('.demo-chip-tone > span');
    expect(primitiveSource).not.toContain('.demo-chip-content__item > span');
    expect(primitiveSource).toContain(
      '.demo-chip-size :deep(.ui-chip) {\n  justify-self: start;',
    );
  });
  it('keeps the primitive non-interactive and parent-owned for announcements', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));
    expect(html).toContain(
      'Native span · visible text is the accessible content',
    );
    expect(html).toContain(
      'Parent owns role=status／aria-live when the value changes',
    );
    expect(html).toContain(
      'No hover／pressed／focus／selected／remove／disabled contract',
    );
    expect(candidateSource).not.toMatch(/:hover|:focus|:active/u);
    expect(candidateSource).not.toContain('cursor: pointer');
    expect(candidateSource).not.toContain('role="status"');
    expect(candidateSource).not.toContain('aria-live');
    expect(html).not.toMatch(
      /class="[^"]*demo-candidate-chip[^"]*"[^>]*tabindex=/u,
    );
  });
  it('records the owner-confirmed Tabs gate and the bounded UiChip phase', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiChip Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      'Tabs 已完成 owner 可視確認；依 owner 指示只向下進入 Feedback 的',
    );
    expect(reviewContract).toContain(
      '`UiChip` 維持非互動 native `span`，只標記系統產生的短狀態、屬性或數量',
    );
    expect(reviewContract).toContain(
      '不新增 selected、dismissible、interactive、disabled、href 或 `role="status"` prop',
    );
  });
});
