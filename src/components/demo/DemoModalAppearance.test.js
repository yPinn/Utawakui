import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appearanceSource = readFileSync(
  new URL('./DemoModalAppearance.vue', import.meta.url),
  'utf8',
);
const layerSource = readFileSync(
  new URL('./DemoModalLayer.vue', import.meta.url),
  'utf8',
);
const overlaysSource = readFileSync(
  new URL('./DemoOverlays.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

describe('DemoModalAppearance Candidate and Current checkpoint', () => {
  it('shows the greenfield shell geometry before mapping production content', () => {
    expect(appearanceSource).toContain(
      'Greenfield raised shell＋on-raised 欄位層級',
    );
    expect(layerSource).toContain("key: 'small'");
    expect(layerSource).toContain("key: 'medium'");
    expect(layerSource).toContain("key: 'large'");
    expect(layerSource).toContain('Small · 384px／max 560px');
    expect(layerSource).toContain('Medium · 512px／max 720px');
    expect(layerSource).toMatch(/Large ·\s+768px／max 800px/);
    expect(layerSource).toContain('Standard 24px／Compact 16px');
    expect(layerSource).toContain('Header／Body／Footer');
    expect(layerSource).toContain('Body-only scroll');
    expect(layerSource).toContain(
      'Medium scroll baseline · 45rem／720px ceiling',
    );
    expect(layerSource).toMatch(/不綁定 production\s+情境/);
    expect(layerSource).toContain('Viewport − 48px');
    expect(layerSource).toContain('整個 shell 一起捲動');
    expect(layerSource).toContain('page 未 inert');
    expect(layerSource).toContain('Current 背景頁仍在互動樹中');
    expect(layerSource).toMatch(/header 與 close\s+會離開\s+viewport/);
    expect(layerSource).toContain('繁體中文、日本語、한국어 and English');
    expect(layerSource).toContain("title: '確認內容'");
    expect(layerSource).toContain("title: '提供補充內容'");
    expect(layerSource).not.toContain('Desired inline');
    expect(layerSource).not.toContain('Block ceiling');
    expect(layerSource).not.toContain('Body behavior');
    expect(layerSource).not.toContain('demo-modal-sample__measurements');
    expect(layerSource).not.toContain("purpose: 'transactional'");
    expect(layerSource).not.toContain("purpose: 'informational'");
    expect(layerSource).not.toContain("purpose: 'workspace'");
  });

  it('reuses reviewed components in Candidate and production truth in Current', () => {
    expect(layerSource).toContain(
      "import DemoCandidateButton from './DemoCandidateButton.vue'",
    );
    expect(layerSource).toContain(
      "import DemoCandidateCheckbox from './DemoCandidateCheckbox.vue'",
    );
    expect(layerSource).toContain(
      "import DemoCandidateHint from './DemoCandidateHint.vue'",
    );
    expect(layerSource).toContain(
      "import DemoCandidateSelect from './DemoCandidateSelect.vue'",
    );
    expect(layerSource).toContain("import UiButton from '../ui/UiButton.vue'");
    expect(layerSource).toContain(
      "import UiCheckbox from '../ui/UiCheckbox.vue'",
    );
    expect(layerSource).toContain("import UiHint from '../ui/UiHint.vue'");
    expect(layerSource).toContain("import UiModal from '../ui/UiModal.vue'");
    expect(layerSource).toContain("import UiSelect from '../ui/UiSelect.vue'");
    expect(layerSource).toContain(
      "import UiTextField from '../ui/UiTextField.vue'",
    );
    expect(layerSource).toContain(
      "import UiTextarea from '../ui/UiTextarea.vue'",
    );
    expect(layerSource).toContain('const checkboxComponent = computed');
    expect(layerSource).toContain('const hintComponent = computed');
    expect(layerSource).toContain('const selectComponent = computed');
    expect(layerSource).toContain('v-model="showFooter"');
    expect(layerSource).toContain('v-model="fieldSummary"');
    expect(layerSource).toContain('v-model="fieldDetails"');
    expect(layerSource).toContain('v-model="fieldCategory"');
    expect(layerSource).not.toContain('DemoCandidateNotice');
    expect(layerSource).not.toContain('UiNotice');
  });

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

  it('keeps Current on an explicit active-token snapshot', () => {
    expect(appearanceSource).toContain(
      ":root[data-demo-modal-source='current']",
    );
    expect(appearanceSource).toContain('--ui-color-surface: #292f35');
    expect(appearanceSource).toContain('--ui-color-surface-raised: #30383e');
    expect(appearanceSource).toContain('--ui-field-bg: #344046');
    expect(appearanceSource).toContain(
      '--ui-shadow-overlay: 0 0.75rem 1.875rem',
    );
    expect(appearanceSource).toContain('--ui-modal-width-default: 26.25rem');
    expect(appearanceSource).toContain('--ui-modal-width-notice: 40rem');
    expect(appearanceSource).toContain('--ui-modal-width-wide: 45rem');
    expect(appearanceSource).toContain("[data-ui-theme='light']");
    expect(appearanceSource).toContain('--ui-color-surface: #fffdfa');
    expect(appearanceSource).toContain('--ui-color-surface-raised: #fff');
    expect(appearanceSource).toContain('--ui-field-bg: #edf2ef');
    expect(appearanceSource).toContain('--ui-color-surface-selected: #dceee9');
    expect(appearanceSource).toContain('--ui-color-accent: #327a7f');
    expect(appearanceSource).toContain('--ui-color-info: #4d8793');
    expect(appearanceSource).toContain('--ui-color-warning: #b78336');
    expect(appearanceSource).not.toContain('--ui-field-bg-on-raised');
  });

  it('defines semantic field surfaces for controls nested on a raised Candidate shell', () => {
    expect(tokenSource).toContain(
      '--ui-field-bg-on-raised: var(--ui-color-surface)',
    );
    expect(tokenSource).toContain(
      '--ui-field-bg-hover-on-raised: var(--ui-color-surface-hover)',
    );
    expect(tokenSource).toContain(
      '--ui-field-bg-readonly-on-raised: var(--ui-color-surface-raised)',
    );
  });

  it('wires the completed Candidate and Current comparison into the shared catalogue section', () => {
    expect(overlaysSource).toContain(
      "import DemoModalAppearance from './DemoModalAppearance.vue'",
    );
    expect(overlaysSource).toContain("new Set(['context-menu', 'modal'])");
    expect(overlaysSource).toContain(
      '<DemoModalAppearance v-else-if="section.key === \'modal\'" />',
    );
    expect(appearanceSource).toMatch(
      /\.demo-modal-layer\s*\{[^}]*padding-block-start:\s*var\(--ui-space-4\);[^}]*border-block-start:/s,
    );
    expect(appearanceSource).toMatch(
      /\.demo-modal-layer__header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(12rem,\s*0\.42fr\)\s+minmax\(0,\s*1fr\);/s,
    );
  });
});
