import { existsSync, readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoProgressAppearance from './DemoProgressAppearance.vue';
const appearanceSource = readFileSync(
  new URL('./DemoProgressAppearance.vue', import.meta.url),
  'utf8',
);
const progressSource = readFileSync(
  new URL('../ui/UiProgress.vue', import.meta.url),
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
  it('renders the production primitive without a parallel Candidate or density API', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));
    expect(html).toContain('data-progress-source="production"');
    expect(html).toContain('class="ui-progress__fill');
    expect(html).not.toContain('demo-candidate-progress');
    expect(
      existsSync(new URL('./DemoCandidateProgress.vue', import.meta.url)),
    ).toBe(false);
    expect(appearanceSource).toContain(
      "import UiProgress from '../ui/UiProgress.vue';",
    );
    expect(appearanceSource).not.toMatch(
      /layer\.component|densityProps|defineProps/u,
    );
    expect(html).not.toMatch(/\sdensity="/u);
  });

  it('shows determinate boundaries, custom totals, indeterminate and optional copy through UiProgress', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));
    const specimen = (id) =>
      html.match(
        new RegExp(
          `<div[^>]*data-progress-state="${id}"[^>]*>[\\s\\S]*?</progress>[\\s\\S]*?</div></div>`,
          'u',
        ),
      )?.[0];
    for (const [id, value, max, ratio] of [
      ['zero', 0, 100, 0],
      ['partial', 46, 100, 0.46],
      ['complete', 100, 100, 1],
      ['bounded-total', 5, 12, 5 / 12],
    ]) {
      const state = specimen(id);
      expect(state, id).toBeDefined();
      expect(state).toContain(`value="${value}"`);
      expect(state).toContain(`max="${max}"`);
      expect(state).toContain(`--ui-progress-ratio:${ratio}`);
    }
    expect(specimen('indeterminate')).not.toMatch(
      /\svalue=|aria-valuetext=|ui-progress__fill/u,
    );
    expect(specimen('label-hidden')).toContain('aria-label="背景整理進度"');
    expect(specimen('label-hidden')).not.toContain('ui-progress__copy');
    expect(specimen('no-value-text')).not.toMatch(
      /aria-valuetext=|ui-progress__value/u,
    );
    expect(html).toContain('data-progress-content="rtl"');
    expect(html).toContain('dir="rtl"');
  });

  it('keeps the primitive separate from task lifecycle and result messaging', async () => {
    const html = await renderToString(createSSRApp(DemoProgressAppearance));
    expect(html).toContain('顯示有標籤的進度');
    expect(html).toContain('結果與操作另行呈現');
    expect(html).toContain('不負責取消、重試、關閉或通知佇列');
    expect(html).toContain('完成或失敗不靠進度條顏色單獨表達');
    expect(progressSource).not.toMatch(
      /\b(?:tone|success|warning|danger|action|dismiss|cancel|retry)\s*:/iu,
    );
    expect(appearanceSource).not.toMatch(
      /import\s+UiNotice|import\s+UiHint|import\s+UiField/u,
    );
  });
  it('keeps indeterminate motion bounded and preserves a reduced-motion cue', () => {
    expect(progressSource).toContain('@keyframes ui-progress-indeterminate');
    expect(progressSource).toMatch(
      /\.ui-progress__track:indeterminate\s*\{[\s\S]*animation:/u,
    );
    // The whole selector sits inside :global(); `:global(x) .y` compiles to x.
    expect(progressSource).toMatch(
      /:global\(\s*:root\[data-ui-motion='reduced'\]\s+\.ui-progress__track:indeterminate\s*\)/u,
    );
    expect(progressSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(progressSource).toMatch(
      /animation:\s*none;[\s\S]*background-position:\s*50% 0;/u,
    );
  });
  it('uses neutral activity color without treating completion as a tone', () => {
    expect(progressSource).toMatch(
      /\.ui-progress__fill\s*\{[^}]*background:\s*var\(--ui-color-info\);/u,
    );
    expect(progressSource).toContain('height: var(--ui-progress-track-size);');
    expect(progressSource).toContain('border-radius: var(--ui-radius-xs);');
    expect(progressSource).toContain('var(--ui-type-caption-size)');
    expect(progressSource).not.toContain('var(--ui-color-success)');
    expect(progressSource).not.toContain('var(--ui-color-danger)');
    expect(progressSource).not.toContain('accent-color:');
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
