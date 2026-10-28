import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const layerSource = readFileSync(
  new URL('./DemoModalLayer.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
describe('DemoModalAppearance Candidate and Current checkpoint', () => {
  it('keeps sample content orthogonal to modal size and public behavior', () => {
    expect(layerSource).toContain('const CONTENT_CASES = Object.freeze');
    expect(layerSource).toContain("key: 'short'");
    expect(layerSource).toContain("key: 'fields'");
    expect(layerSource).toContain("key: 'reading'");
    expect(layerSource).toContain("const contentCase = shallowRef('short')");
    expect(layerSource).toContain('aria-label="選擇內容案例"');
    expect(layerSource).toContain('短內容');
    expect(layerSource).toContain('欄位組合');
    expect(layerSource).toContain('長篇說明');
    expect(layerSource).not.toContain('CONTENT_CASE_SIZE');
    expect(layerSource).not.toContain('purpose=');
    expect(layerSource).not.toContain('content-case=');
    expect(layerSource).not.toContain('v-model="stressBody"');
  });
  it('provides long structured selectable content with a caller-owned initial focus target', () => {
    expect(layerSource).toContain('const READING_SECTIONS = Object.freeze');
    expect(layerSource).toContain('class="demo-modal-case-reading"');
    expect(layerSource).toContain(':autofocus="index === 0 || undefined"');
    expect(layerSource).toContain(':tabindex="index === 0 ? -1 : undefined"');
    expect(layerSource).toContain('SummerLiveSessionFinalMixWithoutSpaces');
    expect(layerSource).toMatch(
      /\.demo-modal-case-reading\s*\{[^}]*user-select:\s*text;/s,
    );
  });
  it('uses the Large body width without turning readable prose into a shell rule', () => {
    expect(layerSource).toMatch(
      /\.demo-modal-sample__lead\s*\{[^}]*max-inline-size:\s*68ch;/s,
    );
    expect(layerSource).toContain('@container (min-width: 42rem)');
    expect(layerSource).toMatch(
      /\.demo-modal-sample\[data-modal-shell-size='large'\]\s+\.demo-modal-sample__reading\s*\{[^}]*max-inline-size:\s*none;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*var\(--ui-space-3\)\s+var\(--ui-space-5\);/s,
    );
    expect(layerSource).not.toContain('--ui-modal-prose');
  });
  it('defines semantic field surfaces for controls nested on a raised Candidate shell', () => {
    expect(tokenSource).toContain(
      '--ui-field-background-on-raised: var(--ui-color-surface)',
    );
    expect(tokenSource).toContain(
      '--ui-field-background-hover-on-raised: var(--ui-color-surface-hover)',
    );
    expect(tokenSource).toContain(
      '--ui-field-background-readonly-on-raised: var(--ui-color-surface-raised)',
    );
  });
});
