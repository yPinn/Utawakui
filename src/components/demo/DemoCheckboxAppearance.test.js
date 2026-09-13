import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import DemoCandidateCheckbox from './DemoCandidateCheckbox.vue';
import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';

const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoCheckboxAppearance.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateCheckbox.vue', import.meta.url),
  'utf8',
);
const checkboxSource = readFileSync(
  new URL('../ui/UiCheckbox.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoCheckboxAppearance, './DemoCheckboxAppearance.vue'],
  [DemoCandidateCheckbox, './DemoCandidateCheckbox.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoCheckboxAppearance', () => {
  it('keeps the accepted Checkbox phase mounted beside Range', () => {
    expect(demoInputsSource).toContain(
      "import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoCheckboxAppearance v-else-if="section.key === \'checkbox\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'checkbox\'" class="demo-checkbox-grid">',
    );
    expect(demoInputsSource).toContain(
      '<DemoRangeAppearance v-else-if="section.key === \'range\'" />',
    );
  });

  it('orders Candidate and Current from geometry through the public contract', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));
    const candidateIndex = html.indexOf('data-checkbox-source="candidate"');
    const currentIndex = html.indexOf('data-checkbox-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Checkbox');
    expect(html).toContain('現行 UiCheckbox');

    const sequence = [
      '尺寸與 target geometry',
      'Owned anatomy',
      '內容與換行',
      '狀態外觀與覆蓋',
      'Hint → Error 與 ARIA',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-checkbox-source="${source}"[\\s\\S]*?(?=<section[^>]*data-checkbox-source=|$)`,
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

  it('visualizes 36 and 32 CSS px Candidate rows against the Current intrinsic row', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));

    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-checkbox-size="${size}"`);
    }
    expect(html).toContain('Standard target · 36 CSS px');
    expect(html).toContain('Compact target · 32 CSS px');
    expect(html).toContain('Current · intrinsic inline row');
    expect(html).toContain('Visual indicator · 16 CSS px');
    expect(html).toContain('Native input／indicator · 16 CSS px');
    expect(html).toContain('Target · full label row');
    expect(html).toContain('Target · input＋associated label');
    expect(html).toContain('Width · intrinsic content');
    expect(componentSource).toContain(
      '.demo-checkbox-size--standard {\n  --demo-checkbox-target-size: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-checkbox-size--compact {\n  --demo-checkbox-target-size: 2rem;',
    );
    expect(candidateSource).toMatch(
      /--demo-checkbox-resolved-target-size:\s*var\(\s*--demo-checkbox-target-size,\s*var\(--ui-control-height\)\s*\);/u,
    );
    expect(candidateSource).not.toContain(
      '--demo-checkbox-target-size: var(--ui-control-height);',
    );
    expect(candidateSource).toContain(
      'min-height: var(--demo-checkbox-resolved-target-size);',
    );
    expect(candidateSource).toContain('width: var(--ui-checkbox-size);');
    expect(candidateSource).toContain('height: var(--ui-checkbox-size);');
  });

  it('keeps one native input behind a project-owned indicator and full label-row target', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));

    for (const part of ['input', 'indicator', 'label', 'support']) {
      expect(
        html.match(new RegExp(`data-checkbox-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Native input · full label-row hit target');
    expect(html).toContain('Project-owned 16px Check／Minus');
    expect(html).toContain('Current Windows native checkbox');
    expect(candidateSource).toContain('type="checkbox"');
    expect(candidateSource).toContain('inset: 0;');
    expect(candidateSource).toContain('opacity: 0;');
    expect(candidateSource).toContain('pointer-events: none;');
    expect(candidateSource).toContain(
      "import { Check, Minus } from '../../icons/index.js';",
    );
    expect(checkboxSource).not.toContain('appearance: none;');
  });

  it('keeps an accessible square target when a compound owner hides the visible label', async () => {
    const html = await renderToString(
      createSSRApp(DemoCandidateCheckbox, {
        id: 'track-row-selection',
        label: '選取音樂分析候選',
        labelHidden: true,
        modelValue: true,
      }),
    );

    expect(html).toContain('has-hidden-label');
    expect(html).toContain('ui-field__label--hidden');
    expect(html).toContain('for="track-row-selection"');
    expect(html).toContain('選取音樂分析候選');
    expect(candidateSource).toMatch(
      /\.demo-candidate-checkbox\.has-hidden-label\s*\{[\s\S]*?width:\s*var\(--demo-checkbox-resolved-target-size\);/u,
    );
  });

  it('covers short, long CJK, long Latin, multilingual, and wrapped labels', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));

    for (const content of ['short', 'long-cjk', 'long-latin', 'multilingual']) {
      expect(
        html.match(new RegExp(`data-checkbox-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain(
      '演出開始後自動切換到下一首並保留目前播放狀態與導唱設定',
    );
    expect(html).toContain(
      'Automatically advance to the next performance item while preserving the current guide-vocal setting',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(candidateSource).toContain('overflow-wrap: anywhere;');
    expect(candidateSource).toContain('align-items: start;');
    expect(candidateSource).toContain(
      'calc((var(--demo-checkbox-resolved-target-size) - 1lh) / 2)',
    );
    expect(candidateSource).toContain(
      '(var(--demo-checkbox-resolved-target-size) - var(--ui-checkbox-size)) / 2',
    );
    expect(html).toContain('Label wraps · indicator stays 16px／top aligned');
  });

  it('covers Boolean, mixed, interaction, validation, and disabled states without readonly', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));
    const states = [
      'unchecked',
      'checked',
      'indeterminate',
      'hover',
      'focus',
      'invalid',
      'required',
      'disabled',
    ];

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-checkbox-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-checkbox-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('Checkbox 支援 Boolean／mixed，且沒有 readonly。');
    expect(componentSource).not.toContain(':readonly');
    expect(candidateSource).toMatch(
      /:focus-visible[\s\S]*?outline: var\(--ui-focus-width\) solid var\(--ui-color-focus\);/u,
    );
    expect(candidateSource).toMatch(
      /\[aria-invalid='true'\][\s\S]*?border-color: var\(--ui-color-danger\);/u,
    );
  });

  it('preserves controlled Boolean updates and projects indeterminate to DOM and ARIA', async () => {
    const { app, root } = mount(DemoCheckboxAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const uncheckedId = 'demo-checkbox-candidate-state-unchecked';
    const mixedId = 'demo-checkbox-candidate-state-indeterminate';

    const unchecked = inputById(uncheckedId);
    expect(unchecked.props.checked).toBe(false);
    trigger(unchecked, 'onChange', { target: { checked: true } });
    await nextTick();
    expect(inputById(uncheckedId).props.checked).toBe(true);

    const mixed = inputById(mixedId);
    expect(mixed.props.indeterminate).toBe(true);
    expect(mixed.props['aria-checked']).toBe('mixed');
    trigger(mixed, 'onChange', { target: { checked: true } });
    await nextTick();
    expect(inputById(mixedId).props.checked).toBe(true);
    expect(inputById(mixedId).props.indeterminate).toBe(false);
    expect(inputById(mixedId).props['aria-checked']).toBeUndefined();
    expect(
      inputById('demo-checkbox-candidate-state-required').props.required,
    ).toBe(true);
    expect(
      inputById('demo-checkbox-candidate-state-disabled').props.disabled,
    ).toBe(true);
    app.unmount();
  });

  it('demonstrates Hint replacement and merged ARIA descriptions', () => {
    const { app, root } = mount(DemoCheckboxAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];

    const hint = inputById('demo-checkbox-candidate-validation-hint');
    const invalid = inputById('demo-checkbox-candidate-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'checkbox-external-note demo-checkbox-candidate-validation-hint-hint',
    );
    expect(hint.props).toMatchObject({
      name: 'demo-checkbox-candidate-consent',
      value: 'accepted',
      'data-contract': 'native-forwarding',
    });
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'checkbox-external-note demo-checkbox-candidate-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-checkbox-candidate-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('documents the bounded public contract and isolates Candidate styling', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));

    expect(html).toContain('Boolean modelValue → update:modelValue');
    expect(html).toContain(
      'indeterminate · caller-owned visual／ARIA projection · clear on selection',
    );
    expect(html).toContain('required · disabled · invalid');
    expect(html).toContain('name · value · native attrs');
    expect(html).toContain('focus() · bounded native-control access');
    expect(html).toContain(
      'Custom visual indicator · Native input · No readonly prop · No size prop',
    );
    expect(componentSource).toContain('demo-checkbox-layer--candidate');
    expect(componentSource).toContain('.demo-checkbox-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-checkbox-layer--current)",
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(checkboxSource).not.toContain('data-checkbox-state');
    expect(checkboxSource).not.toContain('indeterminate:');
  });
});
