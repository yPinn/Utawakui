import { readFileSync } from 'node:fs';
import { createSSRApp, h, nextTick, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiField from '../ui/UiField.vue';
import UiSelect from '../ui/UiSelect.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import DemoCandidateSelect from './DemoCandidateSelect.vue';
import DemoSelectAppearance from './DemoSelectAppearance.vue';

const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoSelectAppearance.vue', import.meta.url),
  'utf8',
);
const candidateSelectSource = readFileSync(
  new URL('./DemoCandidateSelect.vue', import.meta.url),
  'utf8',
);
const selectSource = readFileSync(
  new URL('../ui/UiSelect.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoSelectAppearance, './DemoSelectAppearance.vue'],
  [DemoCandidateSelect, './DemoCandidateSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoSelectAppearance', () => {
  it('keeps the accepted Select contract mounted beside Checkbox and Range', () => {
    expect(demoInputsSource).toContain(
      "import DemoSelectAppearance from './DemoSelectAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoSelectAppearance v-else-if="section.key === \'select\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'select\'" class="demo-sample-grid">',
    );
    expect(demoInputsSource).toContain(
      '<DemoCheckboxAppearance v-else-if="section.key === \'checkbox\'" />',
    );
    expect(demoInputsSource).toContain(
      '<DemoRangeAppearance v-else-if="section.key === \'range\'" />',
    );
  });

  it('orders Candidate and Current from foundations through the public API', async () => {
    const html = await renderToString(createSSRApp(DemoSelectAppearance));
    const candidateIndex = html.indexOf('data-select-source="candidate"');
    const currentIndex = html.indexOf('data-select-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Select');
    expect(html).toContain('現行 UiSelect');

    const sequence = [
      '基礎尺寸與寬度',
      'Owned anatomy',
      '內容行為',
      '狀態外觀與覆蓋',
      'Hint → Error 與 ARIA',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-select-source="${source}"[\\s\\S]*?(?=<section[^>]*data-select-source=|$)`,
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

  it('visualizes 36, 32, and 30 CSS px heights plus parent-owned widths', async () => {
    const html = await renderToString(createSSRApp(DemoSelectAppearance));

    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-select-size="${size}"`);
    }
    for (const width of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-select-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Standard · 36 CSS px');
    expect(html).toContain('Compact · 32 CSS px');
    expect(html).toContain('Active token floor · 30 CSS px');
    expect(html).toContain(
      'Windows Chromium rendered · 31（native intrinsic floor）',
    );
    expect(html).toContain('Width · 100% parent／min 0／max none');
    expect(componentSource).toContain(
      '.demo-select-size--standard {\n  --ui-field-height: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-select-size--compact {\n  --ui-field-height: 2rem;',
    );
    expect(componentSource).toContain(
      '.demo-select-size--active {\n  --ui-field-height: 1.875rem;',
    );
    expect(componentSource).toContain('width: min(12rem, 100%);');
    expect(componentSource).toContain('width: min(20rem, 100%);');
    expect(selectSource).toContain('width: 100%;');
    expect(selectSource).toContain('min-width: 0;');
    expect(selectSource).not.toContain('max-width:');
  });

  it('uses a controlled Candidate indicator while Current keeps the native indicator', async () => {
    const html = await renderToString(createSSRApp(DemoSelectAppearance));

    for (const part of [
      'label',
      'selected-value',
      'indicator',
      'hint',
      'error',
    ]) {
      expect(
        html.match(new RegExp(`data-select-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Candidate closed indicator · project-owned');
    expect(html).toContain('Current Chromium／Windows native indicator');
    expect(html).toContain(
      'Native popup · UA-owned width／may fit longest option',
    );
    expect(html).toContain(
      'Selected-value lane · ellipsis／hover-focus full value',
    );
    expect(html).toContain(
      'Selected-value lane · single line／native clipping',
    );
    expect(selectSource).not.toMatch(/appearance\s*:/u);
    expect(selectSource).not.toContain('<svg');
    expect(candidateSelectSource).toContain('appearance: none;');
    expect(candidateSelectSource).toContain('padding-inline-end: 2.25rem;');
    expect(candidateSelectSource).toContain('inset-inline-end: 0.75rem;');
    expect(candidateSelectSource).toContain('pointer-events: none;');
    expect(candidateSelectSource).toContain(
      "import { ChevronDown } from '../../icons/index.js';",
    );
  });

  it('renders placeholder, long multilingual values, number values, and disabled options', async () => {
    const html = await renderToString(createSSRApp(DemoSelectAppearance));

    for (const content of [
      'placeholder',
      'long-cjk',
      'long-latin',
      'multilingual',
      'number',
      'disabled-option',
    ]) {
      expect(
        html.match(new RegExp(`data-select-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('東京事変／椎名林檎／非常に長い日本語の選択肢');
    expect(html).toContain(
      'A deliberately long Latin option value for native clipping inspection',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(html).toContain('value="72"');
    expect(html).toMatch(
      /<option[^>]*disabled[^>]*>尚未開放／Unavailable<\/option>/u,
    );
    expect(html).toContain(
      'Placeholder · muted closed lane／hidden from native popup',
    );
    expect(html).toContain(
      'Disabled empty option · closed lane uses value foreground',
    );
    expect(html).toContain('Closed：ellipsis；hover／focus 顯示完整值');
    expect(html).toContain('Closed：ellipsis；靜態完整值提示，不跑馬燈');
    expect(html).toContain('popup 可配合最長 option 加寬');
    expect(candidateSelectSource).toMatch(
      /demo-select-control--placeholder[\s\S]*?color: var\(--ui-field-placeholder\);/u,
    );
    expect(candidateSelectSource).toMatch(
      /option:checked[\s\S]*?background: var\(--ui-color-surface-selected\);/u,
    );
    expect(candidateSelectSource).toMatch(
      /option\[disabled\][\s\S]*?color: var\(--ui-color-text-muted\);/u,
    );
    expect(candidateSelectSource).toMatch(
      /option\[value=''\]\[disabled\][\s\S]*?display: none;/u,
    );
    expect(html).toMatch(
      /<option value="" disabled hidden[^>]*>[^<]+<\/option>/u,
    );
  });

  it('keeps long Candidate values static, truncated, and recoverable on hover or focus', async () => {
    expect(candidateSelectSource).toContain('text-overflow: ellipsis;');
    expect(candidateSelectSource).toContain('white-space: nowrap;');
    expect(candidateSelectSource).toContain('data-value-overflow');
    expect(candidateSelectSource).toContain('role="tooltip"');
    expect(candidateSelectSource).toContain(
      ':aria-hidden="!isValueOverflowing"',
    );
    expect(candidateSelectSource).toContain('inset-inline: 0;');
    expect(candidateSelectSource).toContain('overflow-wrap: anywhere;');
    expect(candidateSelectSource).toContain(
      ".demo-candidate-select__control[data-value-overflow='true']:hover",
    );
    expect(candidateSelectSource).toContain(
      ".demo-candidate-select__control[data-value-overflow='true']:focus-within",
    );
    expect(candidateSelectSource).not.toContain('UiMarqueeText');
    expect(candidateSelectSource).not.toMatch(/@keyframes|animation:/u);
    expect(selectSource).not.toContain('data-value-overflow');

    const selectedValue = shallowRef('latin');
    const options = [
      {
        value: 'latin',
        label:
          'A deliberately long Latin option value for native clipping inspection',
      },
      { value: 'quick', label: '快速處理' },
    ];
    const Harness = {
      setup() {
        return () =>
          h(DemoCandidateSelect, {
            id: 'candidate-long-value',
            label: 'Long value',
            modelValue: selectedValue.value,
            options,
            'onUpdate:modelValue': (value) => {
              selectedValue.value = value;
            },
          });
      },
    };
    const { app, root } = mount(Harness);
    const select = findAll(root, (node) => node.type === 'select')[0];
    const tooltip = () =>
      findAll(root, (node) => node.props.role === 'tooltip')[0];

    expect(textContent(tooltip())).toBe(options[0].label);
    trigger(select, 'onChange', { target: { value: 'quick' } });
    await nextTick();
    expect(textContent(tooltip())).toBe('快速處理');
    app.unmount();
  });

  it('covers the seven Select states without inventing readonly', async () => {
    const html = await renderToString(createSSRApp(DemoSelectAppearance));
    const states = [
      'default',
      'filled',
      'hover',
      'focus',
      'invalid',
      'required',
      'disabled',
    ];

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-select-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-select-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('Select 沒有 native readonly');
    expect(selectSource).not.toContain('readonly');
    expect(componentSource).not.toContain(':readonly');
    expect(componentSource).toMatch(
      /data-select-state='hover'[\s\S]*?border-color: var\(--ui-field-border-hover\);[\s\S]*?background: var\(--ui-field-bg-hover\);/u,
    );
    expect(componentSource).toMatch(
      /data-select-state='focus'[\s\S]*?outline: var\(--ui-focus-width\) solid var\(--ui-color-focus\);[\s\S]*?outline-offset: var\(--ui-focus-offset\);/u,
    );
  });

  it('keeps specimens controlled and preserves typed native updates', async () => {
    const { app, root } = mount(DemoSelectAppearance);
    const selectById = (id) =>
      findAll(
        root,
        (node) => node.type === 'select' && node.props.id === id,
      )[0];
    const filledId = 'demo-select-candidate-state-filled';
    const numberId = 'demo-select-candidate-content-number';

    expect(selectById(filledId).props.value).toBe('general');
    trigger(selectById(filledId), 'onChange', {
      target: { value: 'quick' },
    });
    await nextTick();
    expect(selectById(filledId).props.value).toBe('quick');

    expect(selectById(numberId).props.value).toBe(72);
    trigger(selectById(numberId), 'onChange', {
      target: { value: '88' },
    });
    await nextTick();
    expect(selectById(numberId).props.value).toBe(88);
    expect(
      selectById('demo-select-candidate-state-required').props.required,
    ).toBe(true);
    expect(
      selectById('demo-select-candidate-state-disabled').props.disabled,
    ).toBe(true);
    app.unmount();
  });

  it('demonstrates Hint replacement and complete ARIA relationships', () => {
    const { app, root } = mount(DemoSelectAppearance);
    const selectById = (id) =>
      findAll(
        root,
        (node) => node.type === 'select' && node.props.id === id,
      )[0];

    const hint = selectById('demo-select-candidate-validation-hint');
    const invalid = selectById('demo-select-candidate-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'select-external-note demo-select-candidate-validation-hint-hint',
    );
    expect(hint.props).toMatchObject({
      name: 'demo-select-candidate-recipe',
      autocomplete: 'off',
      'data-contract': 'native-forwarding',
    });
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'select-external-note demo-select-candidate-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-select-candidate-validation-error-hint',
      ),
    ).toHaveLength(0);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-select-candidate-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('documents the bounded public contract and isolates Candidate styling', async () => {
    const html = await renderToString(createSSRApp(DemoSelectAppearance));

    expect(html).toContain(
      'String／Number modelValue → typed update:modelValue',
    );
    expect(html).toContain('options · placeholder · disabled option');
    expect(html).toContain('required · disabled · invalid');
    expect(html).toContain('name · autocomplete · native attrs');
    expect(html).toContain('focus() · bounded native-control access');
    expect(html).toContain(
      'Custom closed indicator／overflow tooltip · No marquee · No readonly prop · No size prop · No custom popup',
    );
    expect(componentSource).toContain('.demo-select-layer--candidate');
    expect(componentSource).toContain('.demo-select-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-select-layer--current)",
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(selectSource).not.toContain('data-select-state');
  });
});
