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
const primitiveSource = readFileSync(
  new URL('./DemoStatusIconPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateStatusIcon.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiStatusIcon.vue', import.meta.url),
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
      '<div v-else-if="section.key === \'hints\'"',
    );
  });

  it('orders Candidate and Current through the status-icon contract', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));
    const candidateIndex = html.indexOf('data-status-icon-source="candidate"');
    const currentIndex = html.indexOf('data-status-icon-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      'Role boundary',
      '尺寸與 anatomy',
      'Semantic tones',
      'Motion',
      'Context recipes',
      'ARIA／Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-status-icon-source="${source}"[\\s\\S]*?(?=<section[^>]*data-status-icon-source=|$)`,
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

  it('keeps status geometry separate from action target floors', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));

    expect(html).toContain('Standard · 24 CSS px');
    expect(html).toContain('Compact · 20 CSS px');
    expect(html).toContain('Current · 24 CSS px');
    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-status-icon-size="${size}"`);
    }
    expect(candidateSource).toContain(
      "'--demo-status-icon-size': size === 'compact' ? '1.25rem' : '1.5rem'",
    );
    expect(currentSource).toContain(':size="ICON_SIZE"');
    expect(currentSource).toContain('width: var(--ui-space-5);');
    expect(candidateSource).not.toContain('--ui-control-height');
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
    for (const tone of tones) {
      expect(html).toContain(`data-status-icon-tone="${tone}"`);
    }
    expect(candidateSource).toContain('.demo-candidate-status-icon {');
    for (const tone of tones.filter((tone) => tone !== 'muted')) {
      expect(candidateSource).toContain(`.demo-candidate-status-icon--${tone}`);
    }
    expect(html).toContain('需確認');
    expect(html).toContain('圖示、形狀與 concise label 共同傳達狀態');
    expect(html).not.toContain('permission denied');
    expect(candidateSource).toMatch(
      /\.demo-candidate-status-icon--current[\s\S]*?var\(--ui-color-current\) 80%/u,
    );
  });

  it('does not let fixture text selectors override status-icon color', () => {
    expect(primitiveSource).toContain('class="demo-status-icon-tone__label"');
    expect(primitiveSource).toContain('class="demo-status-icon-recipe__label"');
    expect(primitiveSource).not.toContain('.demo-status-icon-tone > span');
    expect(primitiveSource).not.toContain(
      '.demo-status-icon-recipe__row > span',
    );
    expect(primitiveSource).not.toContain('.demo-status-icon-aria-list span');
  });

  it('shows Current-only compatibility tones without promoting them', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));
    const candidate = html.match(
      /<section[^>]*data-status-icon-source="candidate"[\s\S]*?(?=<section[^>]*data-status-icon-source=)/u,
    )?.[0];
    const current = html.match(
      /<section[^>]*data-status-icon-source="current"[\s\S]*$/u,
    )?.[0];

    expect(candidate).not.toContain('data-status-icon-tone="text"');
    expect(candidate).not.toContain('data-status-icon-tone="highlight"');
    expect(current).toContain('data-status-icon-tone="text"');
    expect(current).toContain('data-status-icon-tone="highlight"');
    expect(html).toContain('Current compatibility only');
  });

  it('keeps motion on the glyph and honors reduced motion', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));

    expect(html.match(/data-status-icon-motion="static"/gu)).toHaveLength(2);
    expect(html.match(/data-status-icon-motion="spinning"/gu)).toHaveLength(2);
    expect(html).toContain('Static container／spinning glyph');
    expect(currentSource).toContain('ui-status-icon__glyph--spin');
    expect(currentSource).toContain("data-ui-motion='reduced'");
    expect(currentSource).toContain('@media (prefers-reduced-motion: reduce)');
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

  it('keeps context, interaction, and announcements parent-owned', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));

    for (const recipe of [
      'row-trail',
      'selection',
      'adjacent-text',
      'live-region',
    ]) {
      expect(
        html.match(new RegExp(`data-status-icon-recipe="${recipe}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain(
      'Parent owns role=status／aria-live and full sentence',
    );
    expect(candidateSource).not.toMatch(/:hover|:focus|:active/u);
    expect(candidateSource).not.toContain('cursor: pointer');
  });

  it('documents the bounded API and isolates Current styling', async () => {
    const html = await renderToString(createSSRApp(DemoStatusIconAppearance));

    expect(html).toContain('icon · required project-owned component');
    expect(html).toContain('label · required concise status name');
    expect(html).toContain('decorative · hides duplicated meaning');
    expect(html).toContain('spinning · glyph only／reduced-motion safe');
    expect(html).toContain('No action／focus／disabled／separate tooltip prop');
    expect(appearanceSource).toContain(
      ':class="`demo-status-icon-layer--${layer.key}`"',
    );
    expect(appearanceSource).toContain('.demo-status-icon-layer--current');
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-status-icon-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-status-icon');
    expect(currentSource).not.toContain('--demo-status-icon-size');
  });

  it('records the owner-confirmed UiStatusIcon checkpoint and next gate', () => {
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
    expect(reviewContract).toContain('下一個可開始的元件只有 `UiHint`');
  });
});
