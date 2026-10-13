import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoProgressAppearance from './DemoProgressAppearance.vue';
const primitiveSource = readFileSync(
  new URL('./DemoProgressPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateProgress.vue', import.meta.url),
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
  it('keeps indeterminate motion bounded and preserves a reduced-motion cue', () => {
    expect(candidateSource).toContain('@keyframes demo-progress-indeterminate');
    expect(candidateSource).toMatch(
      /\.demo-candidate-progress__track:indeterminate\s*\{[\s\S]*animation:/u,
    );
    // The whole selector sits inside :global(); `:global(x) .y` compiles to x.
    expect(candidateSource).toMatch(
      /:global\(\s*:root\[data-ui-motion='reduced'\]\s+\.demo-candidate-progress__track:indeterminate\s*\)/u,
    );
    expect(candidateSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(candidateSource).toMatch(
      /animation:\s*none;[\s\S]*background-position:\s*50% 0;/u,
    );
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
