import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoProgressAppearance from './DemoProgressAppearance.vue';

const feedbackSource = readFileSync(
  new URL('./DemoFeedback.vue', import.meta.url),
  'utf8',
);
const appearanceSource = readFileSync(
  new URL('./DemoProgressAppearance.vue', import.meta.url),
  'utf8',
);
const primitiveSource = readFileSync(
  new URL('./DemoProgressPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateProgress.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiProgress.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);
const reviewContract = readFileSync(
  new URL(
    '../../../docs/contracts/token-v2-component-review.md',
    import.meta.url,
  ),
  'utf8',
);

function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}

describe('DemoProgressAppearance', () => {
  it('replaces only the progress sample with the staged review', () => {
    expect(feedbackSource).toContain(
      "import DemoProgressAppearance from './DemoProgressAppearance.vue';",
    );
    expect(feedbackSource).toMatch(
      /<DemoProgressAppearance\s+v-else-if="section\.key === 'progress'"\s*\/>/u,
    );
    expect(feedbackSource).not.toContain(
      "import UiProgress from '../ui/UiProgress.vue';",
    );
    expect(feedbackSource).toContain("'progress',");
    expect(feedbackSource).toMatch(
      /<DemoNoticeAppearance\s+v-else-if="section\.key === 'notices'"\s*\/>/u,
    );
  });

  it('orders Candidate and Current through the progress contract', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));
    const candidateIndex = html.indexOf('data-progress-source="candidate"');
    const currentIndex = html.indexOf('data-progress-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      '使用時機',
      '尺寸與內容結構',
      '進度狀態',
      '窄內容與多語',
      '任務情境',
      '輔助技術與公開介面',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-progress-source="${source}"[\\s\\S]*?(?=<section[^>]*data-progress-source=|$)`,
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

  it('keeps the primitive separate from task lifecycle and result messaging', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));

    expect(html).toContain('UiProgress 是有標籤的進度指示器');
    expect(html).toContain('工作結果與後續操作由所在畫面顯示');
    expect(html).toContain('不負責取消、重試、關閉或通知佇列');
    expect(html).toContain('完成或失敗不靠進度條顏色單獨表達');
    expect(candidateSource).not.toMatch(
      /tone|success|warning|danger|action|dismiss|cancel|retry/iu,
    );
    expect(primitiveSource).not.toMatch(
      /import\s+UiNotice|import\s+UiHint|import\s+UiField/u,
    );
  });

  it('uses the existing 8px density alias and the progress-specific 2px radius', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));

    expect(html).toContain('Standard · 8 CSS px');
    expect(html).toContain('Compact · 8 CSS px');
    expect(html).toContain('Current · 8 CSS px');
    for (const density of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-progress-density="${density}"`);
    }
    expect(tokenSource).toContain(
      '--ui-progress-track-size: var(--ui-space-2);',
    );
    expect(candidateSource).toContain('height: var(--ui-progress-track-size);');
    expect(candidateSource).toContain('border-radius: var(--ui-radius-xs);');
    expect(candidateSource).not.toContain('--ui-control-height');
    expect(candidateSource).not.toContain('var(--ui-radius-pill)');
  });

  it('covers zero, partial, complete, bounded-total, and indeterminate states', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));

    for (const state of [
      'zero',
      'partial',
      'complete',
      'bounded-total',
      'indeterminate',
    ]) {
      expect(
        html.match(new RegExp(`data-progress-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('5／12');
    expect(html).toContain('尚未開始');
    expect(html).toContain('全部完成');
    expect(candidateSource).toContain(
      ':value="indeterminate ? undefined : value"',
    );
    expect(candidateSource).toContain('v-if="valueText && !indeterminate"');
  });

  it('keeps indeterminate motion bounded and preserves a reduced-motion cue', () => {
    expect(candidateSource).toContain('@keyframes demo-progress-indeterminate');
    expect(candidateSource).toMatch(
      /\.demo-candidate-progress__track:indeterminate\s*\{[\s\S]*animation:/u,
    );
    expect(candidateSource).toContain(
      ":global(:root[data-ui-motion='reduced'])",
    );
    expect(candidateSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(candidateSource).toMatch(
      /animation:\s*none;[\s\S]*background-position:\s*50% 0;/u,
    );
  });

  it('wraps labels and retains tabular values in narrow multilingual content', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));

    for (const content of [
      'long-cjk',
      'long-latin',
      'multilingual',
      'unbroken',
    ]) {
      expect(
        html.match(new RegExp(`data-progress-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('繁體中文、日本語、한국어 and English');
    expect(html).toContain(
      'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    );
    expect(candidateSource).toContain('overflow-wrap: anywhere;');
    expect(candidateSource).toContain('font-variant-numeric: tabular-nums;');
    expect(primitiveSource).toContain('width: min(18rem, 100%);');
    expect(primitiveSource).toContain('<UiScrollRegion');
    expect(primitiveSource).toContain('axis="horizontal"');
    expect(candidateSource).toMatch(
      /\.demo-candidate-progress__copy\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/u,
    );
    expect(primitiveSource).not.toContain('user-select: none');
  });

  it('uses neutral activity color without treating completion as a tone', () => {
    expect(candidateSource).toContain('var(--ui-color-info)');
    expect(candidateSource).not.toMatch(
      /::-webkit-progress-value,\s*\n\.demo-candidate-progress__track::-moz-progress-bar/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-progress__track::-webkit-progress-value\s*\{[\s\S]*?background:\s*var\(--ui-color-info\);/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-progress__track::-moz-progress-bar\s*\{[\s\S]*?background:\s*var\(--ui-color-info\);/u,
    );
    expect(candidateSource).not.toContain('var(--ui-color-success)');
    expect(candidateSource).not.toContain('var(--ui-color-danger)');
    expect(candidateSource).not.toContain('accent-color:');
  });

  it('keeps native progress semantics while callers own busy regions and announcements', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));
    const candidate = html.match(
      /<section[^>]*data-progress-source="candidate"[\s\S]*?(?=<section[^>]*data-progress-source=)/u,
    )?.[0];

    expect(candidate).toMatch(
      /<progress[^>]*value="46"[^>]*max="100"[^>]*aria-label="正在整理曲目"[^>]*aria-valuetext="46%"/u,
    );
    expect(candidate).toMatch(
      /data-progress-state="indeterminate"[\s\S]*?<progress(?![^>]*\svalue=)[^>]*aria-label="正在準備音訊"/u,
    );
    expect(candidateSource).not.toContain('aria-valuenow');
    expect(candidateSource).not.toContain('aria-busy');
    expect(candidateSource).not.toContain('aria-live');
    expect(candidateSource).not.toContain('role="status"');
    expect(primitiveSource).toMatch(
      /data-progress-recipe="busy-region"[^>]*aria-busy="true"/u,
    );
    expect(primitiveSource).toContain('role="status"');
    expect(primitiveSource).toContain('aria-live="polite"');
    expect(html).toContain('所在區域決定 aria-busy');
    expect(html).toContain('只在重要階段更新狀態文字');
    expect(currentSource).toContain(':aria-busy="indeterminate || undefined"');
  });

  it('keeps visible examples concise and free of background implementation terms', async () => {
    const text = visibleText(
      await renderToString(createSSRApp(DemoProgressAppearance)),
    );

    expect(text).toContain('正在整理曲目');
    expect(text).toContain('正在準備音訊');
    expect(text).toContain('匯入完成，可以繼續整理曲目。');
    expect(text).not.toMatch(
      /runtime|sidecar|metadata|adapter|\bhost\b|\bparent\b|\bcaller\b|\bprimitive\b|\bproduction\b|consumer count|\blifecycle\b|\banatomy\b|\bwrapper\b/iu,
    );
  });

  it('isolates the active-token Current snapshot from Candidate styles', () => {
    expect(appearanceSource).toContain(
      ':class="`demo-progress-layer--${layer.key}`"',
    );
    expect(appearanceSource).toContain('.demo-progress-layer--current');
    expect(appearanceSource).toContain('--ui-progress-track-size: 0.5rem;');
    expect(appearanceSource).toContain('--ui-radius-pill: 999rem;');
    expect(appearanceSource).toContain('--ui-color-surface-hover: #344046;');
    expect(appearanceSource).toContain('--ui-color-accent: #55a2a7;');
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-progress-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-progress');
    expect(candidateSource).not.toContain('#344046');
    expect(candidateSource).not.toContain('#55a2a7');
  });

  it('keeps Progress completed after Track Thumb reaches its checkpoint', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiProgress Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiMarqueeText Candidate／Current 檢查',
    );
    expect(reviewContract).toContain('`UiProgress` 是有標籤的原子進度指示器');
    expect(reviewContract).toContain(
      'region `aria-busy` 與 milestone announcement 由流程 owner 負責',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiTrackThumb Candidate／Current 檢查',
    );
    expect(reviewContract).toContain('下一個可處理的元件只有 `UiCollageThumb`');
  });
});
