import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoCandidateMarqueeText from './DemoCandidateMarqueeText.vue';
import DemoMarqueeTextAppearance from './DemoMarqueeTextAppearance.vue';
const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const appearanceSource = readSource('./DemoMarqueeTextAppearance.vue');
const candidateSource = readSource('./DemoCandidateMarqueeText.vue');
const candidateDescriptor = parse(candidateSource).descriptor;
const candidateFocusCss = compileStyle({
  id: 'data-v-marquee-test',
  filename: 'DemoCandidateMarqueeText.vue',
  source: candidateDescriptor.styles[0].content,
  scoped: candidateDescriptor.styles[0].scoped,
}).code;
const currentSource = readSource('../ui/UiMarqueeText.vue');
const reviewContract = readSource(
  '../../../docs/contracts/token-v2-component-review.md',
);
describe('DemoMarqueeTextAppearance', () => {
  it('keeps the public contract to text plus native root attributes', async () => {
    const textHtml = await renderToString(
      createSSRApp(DemoCandidateMarqueeText, {
        text: '長曲名',
        lang: 'ja',
        'data-fixture': 'native-attrs',
      }),
    );
    const numberHtml = await renderToString(
      createSSRApp(DemoCandidateMarqueeText, {
        text: 2048,
      }),
    );
    expect(textHtml).toContain('lang="ja"');
    expect(textHtml).toContain('data-fixture="native-attrs"');
    expect(textHtml).toContain('dir="auto"');
    expect(textHtml).toContain('長曲名');
    expect(numberHtml).toContain('2048');
    expect(candidateSource).toMatch(
      /defineProps\(\{\s*text:\s*\{\s*type:\s*\[String, Number\],\s*default:\s*''\s*\},?\s*\}\)/su,
    );
    expect(candidateSource).not.toMatch(
      /speed|duration\s*:|density\s*:|tone\s*:|lines\s*:|active\s*:|paused\s*:/u,
    );
  });
  it('owns measurement and cleanup without duplicating feature behavior', () => {
    expect(candidateSource).toContain("useTemplateRef('root')");
    expect(candidateSource).toContain("useTemplateRef('text')");
    expect(candidateSource).toContain('new ResizeObserver(measure)');
    expect(candidateSource).toContain('document.fonts?.ready?.then(measure)');
    expect(candidateSource).toContain('watch(displayText');
    expect(candidateSource).toContain('cancelAnimationFrame(frameId)');
    expect(candidateSource).toContain('resizeObserver?.disconnect()');
    expect(candidateSource).not.toMatch(
      /import\s+UiTextButton|import\s+UiTrackRow/u,
    );
  });
  it('moves only overflowing text and exposes the full value only when needed', () => {
    expect(candidateSource).toContain(
      "'demo-candidate-marquee--overflow': isOverflowing",
    );
    expect(candidateSource).toContain(
      ':title="attrs.title ?? (isOverflowing ? displayText : undefined)"',
    );
    expect(candidateSource).toContain('overflow > 1');
    expect(candidateSource).toContain('text-overflow: ellipsis;');
    expect(candidateSource).not.toContain(':title="displayText"');
    expect(currentSource).toContain('tooltipDisabled');
    expect(currentSource).toContain(
      'tooltipEnabled: { type: Boolean, default: true }',
    );
    expect(currentSource).toContain('!props.tooltipEnabled');
    expect(currentSource).not.toContain(':title="displayText"');
  });
  it('uses controlled one-pass reveal instead of unattended infinite motion', () => {
    expect(candidateSource).toContain(
      '@media (hover: hover) and (pointer: fine)',
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-marquee--overflow:hover\s+\.demo-candidate-marquee__text[\s\S]*animation:/u,
    );
    expect(candidateSource).toMatch(
      /\[data-marquee-focus-owner\]:focus-visible[\s\S]*\.demo-candidate-marquee__text[\s\S]*animation:/u,
    );
    expect(candidateSource).toMatch(/animation:[^;]*\s0\.2s\s+1\s+both;/u);
    expect(candidateSource).not.toMatch(/animation:[^;]*infinite/u);
    expect(candidateSource).not.toMatch(/0%,\s*20%\s*\{/u);
    expect(candidateSource).not.toMatch(/82%,\s*100%\s*\{/u);
    expect(candidateSource).toContain(
      'const MARQUEE_MIN_DURATION_SECONDS = 1.8;',
    );
    expect(candidateSource).toContain(
      'const MARQUEE_MAX_DURATION_SECONDS = 5;',
    );
    expect(candidateSource).not.toContain(
      'distance.value / MARQUEE_SPEED_PX_PER_SECOND + 4',
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-marquee--selecting\s+\.demo-candidate-marquee__text[\s\S]*animation-play-state:\s*paused;/u,
    );
    expect(currentSource).toMatch(/infinite alternate;/u);
  });
  it('makes reveal and directional edge affordances explicit state', () => {
    expect(candidateSource).toContain("const motionPhase = shallowRef('idle')");
    expect(candidateSource).toContain(
      "'demo-candidate-marquee--moving': motionPhase === 'moving'",
    );
    expect(candidateSource).toContain(
      "'demo-candidate-marquee--end': motionPhase === 'end'",
    );
    expect(candidateSource).toContain('@pointerenter="resetReveal"');
    expect(candidateSource).toContain('@animationstart="handleAnimationStart"');
    expect(candidateSource).toContain('@animationend="handleAnimationEnd"');
    expect(candidateSource).toContain("motionPhase.value = 'end'");
    expect(candidateSource).toContain(
      "focusOwner?.addEventListener('focus', resetReveal, true)",
    );
    expect(candidateSource).toContain(
      "focusOwner?.addEventListener('blur', resetReveal, true)",
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-marquee--overflow\s*\{[\s\S]*?mask-image:\s*linear-gradient\(/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-marquee--overflow\.demo-candidate-marquee--moving\s*\{[\s\S]*?transparent\s+0[\s\S]*?transparent\s+100%/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-marquee--overflow\.demo-candidate-marquee--end\s*\{[\s\S]*?mask-image:\s*linear-gradient\(/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-marquee--overflow\.demo-candidate-marquee--end:dir\(rtl\)\s*\{[\s\S]*?mask-image:\s*linear-gradient\(/u,
    );
  });
  it('keeps the external focus recipe attached to the nested text after SFC compilation', () => {
    expect(candidateDescriptor.styles[0].scoped).not.toBe(true);
    expect(candidateFocusCss).toMatch(
      /\[data-marquee-focus-owner\]:focus-visible\s+\.demo-candidate-marquee--overflow\s+\.demo-candidate-marquee__text\s*\{/u,
    );
    expect(candidateFocusCss).toContain(
      'animation: demo-marquee-scroll-ltr var(--demo-marquee-duration)',
    );
  });
  it('stops motion for both reduced-motion signals', () => {
    // The whole selector sits inside :global(); `:global(x) .y` compiles to x.
    expect(candidateSource).toContain(
      ":global(:root[data-ui-motion='reduced'] .demo-candidate-marquee--overflow)",
    );
    expect(candidateSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(candidateSource).toMatch(/animation:\s*none\s*!important;/u);
    expect(candidateSource).toMatch(/will-change:\s*auto;/u);
  });
  it('supports LTR and RTL travel without turning text into a control', async () => {
    const html = await renderToString(createSSRApp(DemoMarqueeTextAppearance));
    expect(candidateSource).toContain('@keyframes demo-marquee-scroll-ltr');
    expect(candidateSource).toContain('@keyframes demo-marquee-scroll-rtl');
    expect(candidateSource).toMatch(
      /demo-candidate-marquee--overflow:dir\(rtl\)[\s\S]*animation-name:\s*demo-marquee-scroll-rtl;/u,
    );
    expect(html).toContain('dir="rtl"');
    expect(candidateSource).not.toMatch(/tabindex|role=|aria-live|aria-label/u);
  });
  it('keeps standalone text selectable while interactive owners retain their own contract', () => {
    expect(candidateSource).not.toContain('user-select: none');
    expect(candidateSource).not.toContain('-webkit-user-select: none');
    expect(candidateSource).toContain('@pointerdown="beginPointerSelection"');
    expect(candidateSource).toContain('@pointerup="endPointerSelection"');
    expect(candidateSource).toContain('@pointercancel="endPointerSelection"');
    expect(candidateSource).toContain('@pointerleave="resetPointerReveal"');
    expect(candidateSource).toContain(
      "'demo-candidate-marquee--selecting': isPointerSelecting",
    );
    expect(candidateSource).toMatch(
      /demo-candidate-marquee--selecting\s+\.demo-candidate-marquee__text[\s\S]*?animation-play-state:\s*paused;/u,
    );
    expect(appearanceSource).toContain('data-marquee-copy="selectable"');
    expect(appearanceSource).toContain('data-marquee-focus-owner');
    expect(appearanceSource).toContain('data-marquee-recipe="rtl-focus-owner"');
    expect(appearanceSource).toMatch(
      /\[data-marquee-focus-owner\]\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/u,
    );
  });
  it('keeps Marquee completed after Track Thumb reaches its checkpoint', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiProgress Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiMarqueeText Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiMarqueeText` 只擁有單行溢位量測與可控的內容移動',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiTrackThumb Candidate／Current 檢查',
    );
    expect(reviewContract).toContain('下一個可處理的元件只有 `UiCollageThumb`');
  });
});
