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
const primitiveSource = readFileSync(
  new URL('./DemoChipPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateChip.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiChip.vue', import.meta.url),
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

  it('orders Candidate and Current through the public contract', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));
    const candidateIndex = html.indexOf('data-chip-source="candidate"');
    const currentIndex = html.indexOf('data-chip-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      'Role boundary',
      '尺寸與寬度',
      'Owned anatomy',
      '內容與 overflow',
      'Semantic tones',
      'Context recipes',
      'ARIA／Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-chip-source="${source}"[\\s\\S]*?(?=<section[^>]*data-chip-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
  });

  it('keeps static badge geometry separate from action target floors', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));

    expect(html).toContain('Standard · 24 CSS px');
    expect(html).toContain('Compact · 20 CSS px');
    expect(html).toContain('Current · content-driven');
    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-chip-size="${size}"`);
    }
    expect(primitiveSource).toContain(
      '.demo-chip-size--standard {\n  --demo-chip-height: 1.5rem;',
    );
    expect(primitiveSource).toContain(
      '.demo-chip-size--compact {\n  --demo-chip-height: 1.25rem;',
    );
    expect(candidateSource).toContain(
      'min-height: var(--demo-chip-height, 1.5rem);',
    );
    expect(candidateSource).not.toContain('--ui-control-height');
  });

  it('uses intrinsic width with a parent-bounded overflow path', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));

    expect(html.match(/data-chip-width="intrinsic"/gu)).toHaveLength(2);
    expect(html.match(/data-chip-width="bounded"/gu)).toHaveLength(2);
    expect(html).toContain('Intrinsic · fit content／no fixed max');
    expect(html).toContain('Bounded · parent width／ellipsis when necessary');
    expect(html).toContain('Bounded parent · no authored truncation');
    expect(candidateSource).toContain('min-width: 0;');
    expect(candidateSource).toContain('max-width: 100%;');
    expect(candidateSource).toContain('text-overflow: ellipsis;');
    expect(candidateSource).toContain('white-space: nowrap;');
    expect(candidateSource).not.toMatch(/max-width:\s*\d+(?:\.\d+)?rem/u);
  });

  it('does not let fixture layout override chip width or semantic text styles', () => {
    expect(primitiveSource).toContain('class="demo-chip-item__label"');
    expect(primitiveSource).not.toContain('.demo-chip-tone > span');
    expect(primitiveSource).not.toContain('.demo-chip-content__item > span');
    expect(primitiveSource).toContain(
      '.demo-chip-size :deep(.ui-chip) {\n  justify-self: start;',
    );
  });

  it('visualizes owned anatomy and representative content', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));

    for (const anatomy of ['container', 'leading-icon', 'label']) {
      expect(
        html.match(new RegExp(`data-chip-anatomy="${anatomy}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const content of [
      'short-cjk',
      'number',
      'long-cjk',
      'long-latin',
      'multilingual',
      'icon-label',
    ]) {
      expect(html).toContain(`data-chip-content="${content}"`);
    }
    expect(html).toContain('東京事変／椎名林檎／非常に長い資料分類標籤');
    expect(html).toContain(
      'A deliberately long system-generated category label for inspection',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(html).toContain('24');
  });

  it('covers every current semantic tone without relying on color-only copy', async () => {
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
      expect(
        html.match(new RegExp(`data-chip-tone="${tone}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(candidateSource).toContain('.demo-candidate-chip {');
    for (const tone of [
      'accent',
      'current',
      'info',
      'success',
      'warning',
      'danger',
      'gated',
    ]) {
      expect(candidateSource).toContain(`.demo-candidate-chip--${tone}`);
    }
    expect(candidateSource).toContain('var(--ui-color-accent) 80%');
    expect(candidateSource).toContain('var(--ui-color-current) 80%');
    expect(candidateSource).toContain('var(--ui-color-text)');
    expect(html).toContain('需確認');
    expect(html).toContain('需啟用');
    expect(html).toContain('顏色只加速掃描；文字仍完整命名狀態');
  });

  it('keeps layout recipes parent-owned and wrapping', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));

    for (const recipe of [
      'heading-status',
      'metadata',
      'count',
      'group-wrap',
    ]) {
      expect(
        html.match(new RegExp(`data-chip-recipe="${recipe}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Heading owns baseline／available width');
    expect(html).toContain('Group owns 8px gap／wrap');
    expect(primitiveSource).toContain('flex-wrap: wrap;');
    expect(primitiveSource).toContain('gap: var(--ui-space-2);');
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

  it('documents the bounded API and isolates Current styling', async () => {
    const html = await renderToString(createSSRApp(DemoChipAppearance));

    expect(html).toContain('tone · 8 semantic labels');
    expect(html).toContain('default slot · concise visible label');
    expect(html).toContain('attrs · native span fallthrough');
    expect(html).toContain(
      'background／color · Current compatibility escape hatch',
    );
    expect(html).toContain('No action／filter／dismiss／navigation behavior');
    expect(appearanceSource).toContain(
      ':class="`demo-chip-layer--${layer.key}`"',
    );
    expect(appearanceSource).toContain('.demo-chip-layer--current');
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-chip-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-chip');
    expect(currentSource).not.toContain('--demo-chip-height');
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
