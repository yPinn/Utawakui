import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const candidateButtonSource = read('./DemoCandidateButton.vue');
const candidateTextButtonSource = read('./DemoCandidateTextButton.vue');
const candidateTabsSource = read('./DemoCandidateTabs.vue');
const candidateChipSource = read('./DemoCandidateChip.vue');
const candidateCheckboxSource = read('./DemoCandidateCheckbox.vue');
const candidateRangeSource = read('./DemoCandidateRange.vue');
const candidateProgressSource = read('./DemoCandidateProgress.vue');
const candidateMarqueeSource = read('./DemoCandidateMarqueeText.vue');
const candidateHintSource = read('./DemoCandidateHint.vue');
const candidateNoticeSource = read('./DemoCandidateNotice.vue');
const notificationHostSource = read('./DemoCandidateNotificationHost.vue');
const progressPrimitiveSource = read('./DemoProgressPrimitive.vue');
const fieldAppearanceSource = read('./DemoFieldAppearance.vue');
const uiTextFieldSource = read('../ui/UiTextField.vue');
const uiTextareaSource = read('../ui/UiTextarea.vue');
const currentSources = [
  read('../ui/UiButton.vue'),
  read('../ui/UiTextButton.vue'),
  read('../ui/UiTabs.vue'),
  read('../ui/UiChip.vue'),
  read('../ui/UiRange.vue'),
  read('../ui/UiProgress.vue'),
  read('../ui/UiMarqueeText.vue'),
];
const reviewContract = read(
  '../../../docs/contracts/token-v2-component-review.md',
);

function expectNoneRule(source, selector) {
  const rule = source.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'su'));

  expect(rule?.[1]).toContain('-webkit-user-select: none;');
  expect(rule?.[1]).toContain('user-select: none;');
}

describe('Token v2 Candidate text selection contract', () => {
  it('makes action and state chrome explicitly non-selectable', () => {
    expectNoneRule(candidateButtonSource, '\\.demo-candidate-btn');
    expectNoneRule(candidateTextButtonSource, '\\.demo-candidate-text-btn');
    expectNoneRule(
      candidateTabsSource,
      '\\.demo-candidate-tabs :deep\\(\\.ui-tabs__tab\\)',
    );
    expectNoneRule(candidateChipSource, '\\.demo-candidate-chip');
    expectNoneRule(
      candidateCheckboxSource,
      '\\.demo-candidate-checkbox :deep\\(\\.ui-field__label--inline\\)',
    );
    expectNoneRule(
      candidateRangeSource,
      '\\.demo-candidate-range :deep\\(\\.ui-field__label\\)',
    );
    expectNoneRule(candidateRangeSource, '\\.demo-candidate-range__value');
    expectNoneRule(candidateProgressSource, '\\.demo-candidate-progress__copy');
  });

  it('keeps user data and explanatory content selectable', () => {
    expect(uiTextFieldSource).toContain('-webkit-user-select: text;');
    expect(uiTextFieldSource).toContain('user-select: text;');
    expect(uiTextareaSource).toContain('-webkit-user-select: text;');
    expect(uiTextareaSource).toContain('user-select: text;');
    expect(fieldAppearanceSource).not.toMatch(
      /data-field-state='readonly'[^{}]*\{[^}]*user-select:\s*none/su,
    );
    expect(candidateHintSource).not.toContain('user-select: none');
    expect(candidateNoticeSource).not.toContain('user-select: none');
    expect(progressPrimitiveSource).not.toContain('user-select: none');
    expect(candidateMarqueeSource).not.toContain('user-select: none');
    expect(candidateMarqueeSource).not.toContain('-webkit-user-select: none');
  });

  it('keeps the fixed notification exception narrow', () => {
    expectNoneRule(
      notificationHostSource,
      '\\.demo-candidate-notification-host',
    );
    expect(candidateNoticeSource).not.toContain('user-select: none');
    expect(candidateButtonSource).not.toContain('pointer-events: none');
    expect(candidateTextButtonSource).not.toContain('pointer-events: none');
  });

  it('leaves Current production components as active truth', () => {
    for (const source of currentSources) {
      expect(source).not.toContain('-webkit-user-select: none;');
      expect(source).not.toContain('user-select: none;');
    }
  });

  it('records selection independently from semantic color', () => {
    expect(reviewContract).toContain('## 補充決定：Candidate 文字選取邊界');
    expect(reviewContract).toContain(
      'selection ownership 不由 tone 或 semantic color 推導',
    );
    expect(reviewContract).toContain(
      'Hint／Error、Inline Notice、Readonly 與診斷內容維持可選取',
    );
    expect(reviewContract).toContain(
      'Progress 的 label／value copy lane 為不可選取的介面狀態',
    );
  });
});
